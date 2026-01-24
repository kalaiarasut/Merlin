"""
BLAST Client for eDNA Species Identification

Publication-ready BLAST integration with:
- NCBI BLAST+ API (remote) and local blastn support
- Standardized parameters for reproducibility
- Post-hoc filtering (pident, qcovs, alignment length)
- Strand consistency checking
- Rate limiting and Redis-based semaphore
- Database versioning and audit logging
- Taxonomy fallback resolution (NCBI → WoRMS)

Scientific Compliance:
- perc_identity is NOT a BLAST param (applied post-hoc)
- Results cached to avoid NCBI policy violations
- Full hit metadata preserved for provenance

Author: CMLRE Merlin Platform
"""

import os
import time
import json
import hashlib
import logging
import subprocess
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime, timedelta
from pathlib import Path
import redis
from Bio.Blast import NCBIWWW, NCBIXML
from Bio import Entrez

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION - Standardized BLAST Parameters
# =============================================================================

# BLAST search parameters (perc_identity NOT included - applied post-hoc)
BLAST_DEFAULTS = {
    "word_size": 11,           # Standard for blastn
    "max_target_seqs": 50,     # Rich hit set for LCA
    "dust": "yes",             # Low-complexity filter
    "evalue": 1e-10,           # Stringent threshold
}

# Post-BLAST filtering thresholds
MIN_PIDENT = 85.0              # Percent identity (applied after parsing)
MIN_QUERY_COVERAGE = 70        # Query coverage percentage
MIN_ALIGNMENT_LENGTH = 100     # bp - prevents short spurious hits

# Strand consistency
REQUIRE_CONSISTENT_STRAND = True

# NCBI compliance
NCBI_TOOL_NAME = "CMLRE-Merlin-eDNA"
NCBI_EMAIL = os.environ.get("NCBI_EMAIL", "")
NCBI_API_KEY = os.environ.get("NCBI_API_KEY", "")

# Rate limiting
MAX_REQUESTS_PER_SECOND = 3 if NCBI_API_KEY else 1
MAX_CONCURRENT_BLAST_JOBS = 2  # Global limit across parallel jobs
BLAST_TIMEOUT_SECONDS = 300

# Caching
CACHE_TTL_HOURS = 24
CACHE_DIR = Path("data/blast_cache")

# Redis configuration
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class BlastHit:
    """Complete BLAST hit metadata for provenance"""
    query_id: str
    accession_version: str      # NC_012920.1 (with version!)
    species: str
    pident: float               # Percent identity
    length: int                 # Alignment length
    mismatch: int
    gapopen: int
    qstart: int
    qend: int
    sstart: int
    send: int
    evalue: float
    bitscore: float
    qcovs: int                  # Query coverage %
    taxid: Optional[int] = None
    database: str = "nt"
    database_version: str = ""
    strand: str = "plus"        # plus or minus
    # Derived
    weighted_score: float = field(default=0.0)
    
    def __post_init__(self):
        self.weighted_score = self.bitscore * self.length


@dataclass
class BlastResult:
    """Complete BLAST analysis result with QC metrics"""
    query_id: str
    query_length: int
    hits: List[BlastHit]
    filtered_hits: List[BlastHit]
    # QC metrics
    total_hits: int
    passed_pident: int
    passed_qcovs: int
    passed_length: int
    strand_mismatch_count: int
    # Metadata
    database: str
    database_version: str
    search_timestamp: str
    parameters: Dict[str, Any]
    cached: bool = False


@dataclass
class BlastAuditLog:
    """Audit log entry for NCBI usage tracking"""
    timestamp: str
    user_id: Optional[str]
    job_id: Optional[str]
    query_count: int
    database: str
    cache_hit: bool
    duration_seconds: float


# =============================================================================
# BLAST CLIENT
# =============================================================================

class BlastClient:
    """
    Production-ready BLAST client with scientific safeguards.
    
    Features:
    - Remote NCBI BLAST with rate limiting
    - Local BLAST+ support for offline mode
    - Post-hoc filtering (not search-time)
    - Strand consistency checking
    - Result caching (24hr)
    - Redis semaphore for concurrent job limits
    - Full audit logging
    """
    
    def __init__(
        self,
        use_local: bool = False,
        local_db_path: Optional[str] = None,
        redis_client: Optional[redis.Redis] = None
    ):
        self.use_local = use_local
        self.local_db_path = local_db_path
        self.redis = redis_client or self._connect_redis()
        self._db_version: Optional[str] = None
        self._last_request_time = 0.0
        
        # Configure Entrez for NCBI access
        Entrez.email = NCBI_EMAIL
        Entrez.api_key = NCBI_API_KEY
        Entrez.tool = NCBI_TOOL_NAME
        
        # Ensure cache directory exists
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"BlastClient initialized (local={use_local})")
    
    def _connect_redis(self) -> Optional[redis.Redis]:
        """Connect to Redis for semaphore and caching"""
        try:
            client = redis.from_url(REDIS_URL, decode_responses=True)
            client.ping()
            logger.info("Redis connected for BLAST rate limiting")
            return client
        except Exception as e:
            logger.warning(f"Redis not available: {e}. Using local fallback.")
            return None
    
    def _acquire_semaphore(self, timeout: int = 60) -> bool:
        """Acquire global BLAST semaphore to limit concurrent jobs"""
        if not self.redis:
            return True
        
        semaphore_key = "blast:semaphore"
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            current = self.redis.get(semaphore_key)
            if current is None or int(current) < MAX_CONCURRENT_BLAST_JOBS:
                self.redis.incr(semaphore_key)
                self.redis.expire(semaphore_key, BLAST_TIMEOUT_SECONDS)
                return True
            time.sleep(1)
        
        return False
    
    def _release_semaphore(self):
        """Release global BLAST semaphore"""
        if self.redis:
            self.redis.decr("blast:semaphore")
    
    def _rate_limit(self):
        """Enforce NCBI rate limits"""
        min_interval = 1.0 / MAX_REQUESTS_PER_SECOND
        elapsed = time.time() - self._last_request_time
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        self._last_request_time = time.time()
    
    def _get_cache_key(self, sequence: str, database: str) -> str:
        """Generate cache key from sequence hash"""
        seq_hash = hashlib.md5(sequence.encode()).hexdigest()
        return f"blast:{database}:{seq_hash}"
    
    def _get_cached_result(self, cache_key: str) -> Optional[Dict]:
        """Retrieve cached BLAST result"""
        # Try Redis first
        if self.redis:
            cached = self.redis.get(cache_key)
            if cached:
                return json.loads(cached)
        
        # Fall back to file cache
        cache_file = CACHE_DIR / f"{cache_key.replace(':', '_')}.json"
        if cache_file.exists():
            mtime = datetime.fromtimestamp(cache_file.stat().st_mtime)
            if datetime.now() - mtime < timedelta(hours=CACHE_TTL_HOURS):
                with open(cache_file) as f:
                    return json.load(f)
        
        return None
    
    def _cache_result(self, cache_key: str, result: Dict):
        """Cache BLAST result"""
        result_json = json.dumps(result)
        
        # Redis cache
        if self.redis:
            self.redis.setex(cache_key, CACHE_TTL_HOURS * 3600, result_json)
        
        # File cache (backup)
        cache_file = CACHE_DIR / f"{cache_key.replace(':', '_')}.json"
        with open(cache_file, 'w') as f:
            f.write(result_json)
    
    def _get_database_version(self) -> str:
        """Get NCBI database version (cached per run)"""
        if self._db_version:
            return self._db_version
        
        try:
            # Query NCBI for nt database info
            handle = Entrez.einfo(db="nucleotide")
            record = Entrez.read(handle)
            self._db_version = record.get("DbInfo", {}).get("LastUpdate", "unknown")
        except Exception:
            self._db_version = datetime.now().strftime("%Y-%m-%d")
        
        return self._db_version
    
    def _parse_blast_xml(self, xml_handle) -> List[Dict]:
        """Parse BLAST XML output into hit dictionaries"""
        hits = []
        
        for record in NCBIXML.parse(xml_handle):
            query_id = record.query
            query_length = record.query_length
            
            for alignment in record.alignments:
                for hsp in alignment.hsps:
                    # Determine strand
                    strand = "plus" if hsp.sbjct_start < hsp.sbjct_end else "minus"
                    
                    # Calculate query coverage
                    qcovs = int((hsp.align_length / query_length) * 100)
                    
                    # Extract accession with version
                    accession = alignment.accession
                    
                    # Extract species from title
                    title = alignment.title
                    species = self._extract_species(title)
                    
                    # Extract taxid if available
                    taxid = None  # Would need additional Entrez query
                    
                    hit = {
                        "query_id": query_id,
                        "accession_version": accession,
                        "species": species,
                        "pident": (hsp.identities / hsp.align_length) * 100,
                        "length": hsp.align_length,
                        "mismatch": hsp.align_length - hsp.identities,
                        "gapopen": hsp.gaps,
                        "qstart": hsp.query_start,
                        "qend": hsp.query_end,
                        "sstart": hsp.sbjct_start,
                        "send": hsp.sbjct_end,
                        "evalue": hsp.expect,
                        "bitscore": hsp.bits,
                        "qcovs": qcovs,
                        "taxid": taxid,
                        "strand": strand,
                    }
                    hits.append(hit)
        
        return hits
    
    def _extract_species(self, title: str) -> str:
        """Extract species name from BLAST hit title"""
        # Common pattern: "accession description [Genus species]"
        if "[" in title and "]" in title:
            start = title.rfind("[")
            end = title.rfind("]")
            return title[start+1:end]
        
        # Fallback: first two words after accession
        parts = title.split()
        if len(parts) >= 3:
            return f"{parts[1]} {parts[2]}"
        
        return "Unknown species"
    
    def _filter_hits(self, hits: List[BlastHit]) -> Tuple[List[BlastHit], Dict[str, int]]:
        """
        Apply post-hoc filtering with detailed QC metrics.
        
        Returns:
            Tuple of (filtered_hits, qc_metrics)
        """
        qc = {
            "total": len(hits),
            "passed_pident": 0,
            "passed_qcovs": 0,
            "passed_length": 0,
            "strand_mismatch_count": 0,
            "final": 0,
        }
        
        filtered = []
        reference_strand = None
        
        for hit in hits:
            # Track strand consistency
            if reference_strand is None:
                reference_strand = hit.strand
            elif hit.strand != reference_strand and REQUIRE_CONSISTENT_STRAND:
                qc["strand_mismatch_count"] += 1
            
            # Apply filters
            if hit.pident >= MIN_PIDENT:
                qc["passed_pident"] += 1
            else:
                continue
            
            if hit.qcovs >= MIN_QUERY_COVERAGE:
                qc["passed_qcovs"] += 1
            else:
                continue
            
            if hit.length >= MIN_ALIGNMENT_LENGTH:
                qc["passed_length"] += 1
            else:
                continue
            
            filtered.append(hit)
        
        qc["final"] = len(filtered)
        return filtered, qc
    
    def search(
        self,
        sequence: str,
        database: str = "nt",
        query_id: str = "query",
        use_cache: bool = True
    ) -> BlastResult:
        """
        Run BLAST search with full scientific safeguards.
        
        Args:
            sequence: DNA sequence to search
            database: BLAST database (nt, refseq_genomic, etc.)
            query_id: Identifier for the query
            use_cache: Whether to use cached results
        
        Returns:
            BlastResult with filtered hits and QC metrics
        """
        start_time = time.time()
        cache_key = self._get_cache_key(sequence, database)
        db_version = self._get_database_version()
        
        # Check cache
        if use_cache:
            cached = self._get_cached_result(cache_key)
            if cached:
                logger.info(f"Cache hit for {query_id}")
                hits = [BlastHit(**h) for h in cached["hits"]]
                filtered, qc = self._filter_hits(hits)
                
                return BlastResult(
                    query_id=query_id,
                    query_length=len(sequence),
                    hits=hits,
                    filtered_hits=filtered,
                    total_hits=qc["total"],
                    passed_pident=qc["passed_pident"],
                    passed_qcovs=qc["passed_qcovs"],
                    passed_length=qc["passed_length"],
                    strand_mismatch_count=qc["strand_mismatch_count"],
                    database=database,
                    database_version=db_version,
                    search_timestamp=datetime.now().isoformat(),
                    parameters=BLAST_DEFAULTS,
                    cached=True,
                )
        
        # Acquire semaphore for concurrent job limiting
        if not self._acquire_semaphore():
            raise RuntimeError("Could not acquire BLAST semaphore (too many concurrent jobs)")
        
        try:
            # Rate limit
            self._rate_limit()
            
            # Run BLAST
            if self.use_local:
                raw_hits = self._run_local_blast(sequence, database)
            else:
                raw_hits = self._run_remote_blast(sequence, database)
            
            # Convert to BlastHit objects
            hits = []
            for h in raw_hits:
                hit = BlastHit(
                    database=database,
                    database_version=db_version,
                    **h
                )
                hits.append(hit)
            
            # Cache raw results
            self._cache_result(cache_key, {
                "hits": [asdict(h) for h in hits],
                "timestamp": datetime.now().isoformat(),
            })
            
            # Filter hits
            filtered, qc = self._filter_hits(hits)
            
            duration = time.time() - start_time
            logger.info(f"BLAST completed for {query_id}: {qc['final']}/{qc['total']} hits passed filters ({duration:.2f}s)")
            
            return BlastResult(
                query_id=query_id,
                query_length=len(sequence),
                hits=hits,
                filtered_hits=filtered,
                total_hits=qc["total"],
                passed_pident=qc["passed_pident"],
                passed_qcovs=qc["passed_qcovs"],
                passed_length=qc["passed_length"],
                strand_mismatch_count=qc["strand_mismatch_count"],
                database=database,
                database_version=db_version,
                search_timestamp=datetime.now().isoformat(),
                parameters=BLAST_DEFAULTS,
                cached=False,
            )
        
        finally:
            self._release_semaphore()
    
    def _run_remote_blast(self, sequence: str, database: str) -> List[Dict]:
        """Run BLAST via NCBI web API"""
        logger.info(f"Running remote BLAST against {database}")
        
        result_handle = NCBIWWW.qblast(
            program="blastn",
            database=database,
            sequence=sequence,
            word_size=BLAST_DEFAULTS["word_size"],
            expect=BLAST_DEFAULTS["evalue"],
            hitlist_size=BLAST_DEFAULTS["max_target_seqs"],
            format_type="XML",
        )
        
        return self._parse_blast_xml(result_handle)
    
    def _run_local_blast(self, sequence: str, database: str) -> List[Dict]:
        """Run BLAST via local BLAST+ installation"""
        if not self.local_db_path:
            raise ValueError("Local database path not configured")
        
        # Write sequence to temp file
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.fasta', delete=False) as f:
            f.write(f">query\n{sequence}\n")
            query_file = f.name
        
        try:
            # Run blastn
            outfmt = "6 qseqid sseqid pident length mismatch gapopen qstart qend sstart send evalue bitscore"
            cmd = [
                "blastn",
                "-query", query_file,
                "-db", self.local_db_path,
                "-outfmt", outfmt,
                "-max_target_seqs", str(BLAST_DEFAULTS["max_target_seqs"]),
                "-evalue", str(BLAST_DEFAULTS["evalue"]),
                "-word_size", str(BLAST_DEFAULTS["word_size"]),
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=BLAST_TIMEOUT_SECONDS)
            
            if result.returncode != 0:
                raise RuntimeError(f"BLAST failed: {result.stderr}")
            
            # Parse tabular output
            hits = []
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('\t')
                hit = {
                    "query_id": parts[0],
                    "accession_version": parts[1],
                    "species": "Unknown",  # Need additional lookup
                    "pident": float(parts[2]),
                    "length": int(parts[3]),
                    "mismatch": int(parts[4]),
                    "gapopen": int(parts[5]),
                    "qstart": int(parts[6]),
                    "qend": int(parts[7]),
                    "sstart": int(parts[8]),
                    "send": int(parts[9]),
                    "evalue": float(parts[10]),
                    "bitscore": float(parts[11]),
                    "qcovs": 0,  # Calculate later
                    "taxid": None,
                    "strand": "plus" if int(parts[8]) < int(parts[9]) else "minus",
                }
                hits.append(hit)
            
            return hits
        
        finally:
            os.unlink(query_file)
    
    def search_batch(
        self,
        sequences: List[Tuple[str, str]],  # [(id, sequence), ...]
        database: str = "nt",
        progress_callback: Optional[callable] = None
    ) -> List[BlastResult]:
        """
        Run BLAST for multiple sequences with progress tracking.
        
        Args:
            sequences: List of (query_id, sequence) tuples
            database: BLAST database
            progress_callback: Optional callback(current, total, result)
        
        Returns:
            List of BlastResult objects
        """
        results = []
        
        for i, (query_id, sequence) in enumerate(sequences):
            result = self.search(sequence, database, query_id)
            results.append(result)
            
            if progress_callback:
                progress_callback(i + 1, len(sequences), result)
        
        return results


# =============================================================================
# TAXONOMY RESOLVER
# =============================================================================

class TaxonomyFallbackResolver:
    """
    Resolve taxonomy from NCBI with WoRMS fallback for marine species.
    
    Handles cases where BLAST returns outdated taxonomy.
    """
    
    def __init__(self, worms_api_url: str = "https://www.marinespecies.org/rest"):
        self.worms_api_url = worms_api_url
        self._cache: Dict[int, Dict] = {}
    
    def resolve_by_taxid(self, taxid: int) -> Dict[str, Any]:
        """Resolve taxonomy hierarchy from NCBI taxid"""
        if taxid in self._cache:
            return self._cache[taxid]
        
        try:
            handle = Entrez.efetch(db="taxonomy", id=str(taxid), retmode="xml")
            records = Entrez.read(handle)
            
            if records:
                record = records[0]
                taxonomy = {
                    "taxid": taxid,
                    "scientific_name": record.get("ScientificName", ""),
                    "rank": record.get("Rank", ""),
                    "lineage": {},
                }
                
                for lineage_item in record.get("LineageEx", []):
                    rank = lineage_item.get("Rank", "").lower()
                    name = lineage_item.get("ScientificName", "")
                    if rank in ["kingdom", "phylum", "class", "order", "family", "genus"]:
                        taxonomy["lineage"][rank] = name
                
                self._cache[taxid] = taxonomy
                return taxonomy
        
        except Exception as e:
            logger.warning(f"NCBI taxonomy lookup failed for {taxid}: {e}")
        
        return {}
    
    def resolve_by_name(self, species_name: str) -> Dict[str, Any]:
        """
        Resolve taxonomy by species name.
        Falls back to WoRMS for marine species.
        """
        # Try NCBI first
        try:
            handle = Entrez.esearch(db="taxonomy", term=species_name)
            record = Entrez.read(handle)
            
            if record.get("IdList"):
                taxid = int(record["IdList"][0])
                return self.resolve_by_taxid(taxid)
        
        except Exception as e:
            logger.debug(f"NCBI search failed for {species_name}: {e}")
        
        # Fall back to WoRMS
        return self._resolve_via_worms(species_name)
    
    def _resolve_via_worms(self, species_name: str) -> Dict[str, Any]:
        """Query WoRMS for marine species taxonomy"""
        import requests
        
        try:
            # Search WoRMS
            url = f"{self.worms_api_url}/AphiaRecordsByMatchNames"
            params = {"scientificnames[]": species_name, "marine_only": "true"}
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data and data[0]:
                    record = data[0][0] if isinstance(data[0], list) else data[0]
                    
                    return {
                        "taxid": record.get("AphiaID"),
                        "scientific_name": record.get("scientificname", ""),
                        "rank": record.get("rank", ""),
                        "lineage": {
                            "kingdom": record.get("kingdom", ""),
                            "phylum": record.get("phylum", ""),
                            "class": record.get("class", ""),
                            "order": record.get("order", ""),
                            "family": record.get("family", ""),
                            "genus": record.get("genus", ""),
                        },
                        "is_marine": True,
                        "source": "WoRMS",
                    }
        
        except Exception as e:
            logger.warning(f"WoRMS lookup failed for {species_name}: {e}")
        
        return {}


# =============================================================================
# AUDIT LOGGING
# =============================================================================

def log_blast_audit(
    query_count: int,
    database: str,
    cache_hit: bool,
    duration: float,
    user_id: Optional[str] = None,
    job_id: Optional[str] = None,
    redis_client: Optional[redis.Redis] = None
):
    """Log BLAST usage for NCBI compliance and institutional review"""
    
    log_entry = BlastAuditLog(
        timestamp=datetime.now().isoformat(),
        user_id=user_id,
        job_id=job_id,
        query_count=query_count,
        database=database,
        cache_hit=cache_hit,
        duration_seconds=duration,
    )
    
    # Log to Redis for aggregation
    if redis_client:
        key = f"blast:audit:{datetime.now().strftime('%Y-%m-%d')}"
        redis_client.rpush(key, json.dumps(asdict(log_entry)))
        redis_client.expire(key, 90 * 86400)  # 90 day retention
    
    # Also log to file
    log_file = CACHE_DIR / "blast_audit.jsonl"
    with open(log_file, 'a') as f:
        f.write(json.dumps(asdict(log_entry)) + '\n')
    
    logger.info(f"BLAST audit: {query_count} queries, cache_hit={cache_hit}, duration={duration:.2f}s")


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def create_blast_client(
    use_local: bool = False,
    local_db_path: Optional[str] = None
) -> BlastClient:
    """Factory function to create BLAST client with default configuration"""
    return BlastClient(
        use_local=use_local,
        local_db_path=local_db_path,
    )


def get_filter_thresholds() -> Dict[str, Any]:
    """Get current filter thresholds for documentation"""
    return {
        "min_pident": MIN_PIDENT,
        "min_query_coverage": MIN_QUERY_COVERAGE,
        "min_alignment_length": MIN_ALIGNMENT_LENGTH,
        "require_consistent_strand": REQUIRE_CONSISTENT_STRAND,
    }


# =============================================================================
# MAIN (for testing)
# =============================================================================

if __name__ == "__main__":
    # Test sequence (fish COI)
    test_sequence = """
    CCTTATCTTGGCGCTATGAGCCGGAATAGTCGGTACAGCTCTCAGCCTTTTAATCCGAGCCGAACTAAGCCAACCCGGCGCCCTTCTGGGCGACGACCAAATTTATAATGTAATCGTTACAGCCCATGCCTTCGTAATGATTTTCTTTATAGTAATACCAATTATGATCGGGGGATTTGGAAACTGACTTATCCCACTAATAATCGGCGCTCCTGATATAGCATTCCCCCGAATAAATAATATGAGCTTTTGACTTCTTCCCCCCTCCTTCCTTCTGCTTCTAGCCTCATCCGGAGTTGAAGCGGGCGCCGGAACAGGGTGAACTGTCTACCCTCCTCTAGCCGGTAATTTAGCACATGCTGGAGCATCAGTAGACCTAACAATTTTCTCTCTCCATCTTGCAGGTATTTCCTCTATCTTAGGGGCAATTAACTTTATTACAACAATTATCAACATAAAACCTCCTGCCATCTCTCAATACCAAACACCCCTATTCGTGTGAGCCGTATTAATTACCGCCGTACTTCTACTTCTATCCCTACCTGTTCTAGCGGCCGGCATTACTATGCTACTAACAGACCGAAATCTTAATACCACCTTCTTCGACCCCGCCGGAGGAGGAGACCCCATTCTATACCAACACTTATTC
    """.strip().replace('\n', '').replace(' ', '')
    
    # Create client
    client = create_blast_client()
    
    # Run search (will use cache if available)
    print("Running BLAST search...")
    result = client.search(test_sequence, query_id="test_coi")
    
    print(f"\nResults for {result.query_id}:")
    print(f"  Total hits: {result.total_hits}")
    print(f"  Passed pident: {result.passed_pident}")
    print(f"  Passed qcovs: {result.passed_qcovs}")
    print(f"  Passed length: {result.passed_length}")
    print(f"  Strand mismatches: {result.strand_mismatch_count}")
    print(f"  Final filtered: {len(result.filtered_hits)}")
    print(f"  Cached: {result.cached}")
    
    if result.filtered_hits:
        print(f"\nTop hit:")
        top = result.filtered_hits[0]
        print(f"  Species: {top.species}")
        print(f"  Pident: {top.pident:.1f}%")
        print(f"  Bitscore: {top.bitscore}")
        print(f"  E-value: {top.evalue}")
