"""
eDNA Sequence Processing Module

Comprehensive eDNA analysis with:
- BLAST and Kraken2 for species detection
- Biodiversity metrics calculation
- Quality control and filtering
- Taxonomy hierarchy construction
- Sequence statistics
"""

from Bio import SeqIO
from Bio.SeqUtils import gc_fraction
from Bio.Blast import NCBIWWW, NCBIXML
import subprocess
import os
import math
from typing import List, Dict, Optional, Tuple, Any
from collections import Counter
from dataclasses import dataclass, asdict
import json
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class SequenceRecord:
    """Data class for sequence records"""
    id: str
    sequence: str
    length: int
    gc_content: float
    quality_scores: Optional[List[int]] = None
    avg_quality: Optional[float] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class SpeciesDetection:
    """Data class for species detection results"""
    species: str
    confidence: float
    method: str
    reads: int = 0
    e_value: Optional[float] = None
    identity: Optional[float] = None
    taxonomy: Optional[Dict[str, str]] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class BiodiversityMetrics:
    """Data class for biodiversity metrics"""
    shannon_index: float
    simpson_index: float
    chao1: float
    observed_species: int
    evenness: float
    dominance: float
    total_individuals: int
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class QualityMetrics:
    """Data class for sequence quality metrics"""
    total_sequences: int
    total_bases: int
    avg_length: float
    avg_gc_content: float
    avg_quality: Optional[float]
    passed_qc: int
    failed_qc: int
    length_distribution: Dict[str, int]
    gc_distribution: Dict[str, int]
    
    def to_dict(self) -> Dict:
        return asdict(self)


class EdnaProcessor:
    """
    Comprehensive eDNA sequence processor with integrated analysis tools
    """
    
    # Taxonomy database (simplified - in production use NCBI Taxonomy)
    TAXONOMY_DB = {
        "Thunnus": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Actinopterygii", 
                    "order": "Scombriformes", "family": "Scombridae"},
        "Carcharodon": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Chondrichthyes",
                        "order": "Lamniformes", "family": "Lamnidae"},
        "Coryphaena": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Actinopterygii",
                       "order": "Carangiformes", "family": "Coryphaenidae"},
        "Hippocampus": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Actinopterygii",
                        "order": "Syngnathiformes", "family": "Syngnathidae"},
        "Tursiops": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Mammalia",
                     "order": "Cetacea", "family": "Delphinidae"},
        "Delphinus": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Mammalia",
                      "order": "Cetacea", "family": "Delphinidae"},
        "Chelonia": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Reptilia",
                     "order": "Testudines", "family": "Cheloniidae"},
        "Manta": {"kingdom": "Animalia", "phylum": "Chordata", "class": "Chondrichthyes",
                  "order": "Myliobatiformes", "family": "Mobulidae"},
    }
    
    def __init__(self, blast_db: str = None, kraken2_db: str = None):
        self.blast_db = blast_db or os.getenv("BLAST_DB_PATH")
        self.kraken2_db = kraken2_db or os.getenv("KRAKEN2_DB_PATH")
        logger.info(f"EdnaProcessor initialized. BLAST DB: {self.blast_db}, Kraken2 DB: {self.kraken2_db}")
    
    def parse_sequences(self, file_path: str) -> List[SequenceRecord]:
        """
        Parse FASTQ/FASTA file into sequence records
        
        Args:
            file_path: Path to sequence file
            
        Returns:
            List of SequenceRecord objects
        """
        sequences = []
        
        # Detect format based on extension
        ext = os.path.splitext(file_path)[1].lower()
        fmt = "fastq" if ext in [".fastq", ".fq"] else "fasta"
        
        try:
            for record in SeqIO.parse(file_path, fmt):
                seq_str = str(record.seq)
                gc = gc_fraction(record.seq) * 100  # Convert to percentage
                
                quality_scores = None
                avg_quality = None
                
                if "phred_quality" in record.letter_annotations:
                    quality_scores = record.letter_annotations["phred_quality"]
                    avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else None
                
                sequences.append(SequenceRecord(
                    id=record.id,
                    sequence=seq_str,
                    length=len(seq_str),
                    gc_content=gc,
                    quality_scores=quality_scores,
                    avg_quality=avg_quality
                ))
            
            logger.info(f"Parsed {len(sequences)} sequences from {file_path}")
            return sequences
            
        except Exception as e:
            logger.error(f"Error parsing sequences from {file_path}: {e}")
            raise
    
    def parse_sequence_string(self, content: str, format_hint: str = "fasta") -> List[SequenceRecord]:
        """
        Parse sequences from string content
        
        Args:
            content: Sequence content as string
            format_hint: 'fasta' or 'fastq'
            
        Returns:
            List of SequenceRecord objects
        """
        sequences = []
        
        if format_hint == "fastq":
            lines = content.strip().split('\n')
            i = 0
            while i < len(lines) - 3:
                if lines[i].startswith('@'):
                    seq_id = lines[i][1:].split()[0]
                    seq_str = lines[i + 1].strip()
                    quality_str = lines[i + 3].strip() if i + 3 < len(lines) else ""
                    
                    quality_scores = [ord(c) - 33 for c in quality_str] if quality_str else None
                    avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else None
                    gc = self._calculate_gc(seq_str)
                    
                    sequences.append(SequenceRecord(
                        id=seq_id,
                        sequence=seq_str,
                        length=len(seq_str),
                        gc_content=gc,
                        quality_scores=quality_scores,
                        avg_quality=avg_quality
                    ))
                    i += 4
                else:
                    i += 1
        else:
            # FASTA format
            entries = content.strip().split('>')
            for entry in entries:
                if not entry.strip():
                    continue
                lines = entry.strip().split('\n')
                seq_id = lines[0].split()[0]
                seq_str = ''.join(lines[1:]).replace(' ', '').replace('\r', '')
                gc = self._calculate_gc(seq_str)
                
                sequences.append(SequenceRecord(
                    id=seq_id,
                    sequence=seq_str,
                    length=len(seq_str),
                    gc_content=gc
                ))
        
        return sequences
    
    @staticmethod
    def _calculate_gc(sequence: str) -> float:
        """Calculate GC content percentage"""
        if not sequence:
            return 0.0
        gc_count = sum(1 for base in sequence.upper() if base in 'GC')
        return (gc_count / len(sequence)) * 100
    
    def quality_filter(
        self, 
        sequences: List[SequenceRecord], 
        min_length: int = 100,
        max_length: int = 10000,
        min_quality: float = 20,
        min_gc: float = 20,
        max_gc: float = 80
    ) -> Tuple[List[SequenceRecord], List[SequenceRecord]]:
        """
        Filter sequences by quality criteria
        
        Args:
            sequences: List of sequence records
            min_length: Minimum sequence length
            max_length: Maximum sequence length
            min_quality: Minimum average quality score (for FASTQ)
            min_gc: Minimum GC content percentage
            max_gc: Maximum GC content percentage
            
        Returns:
            Tuple of (passed, failed) sequences
        """
        passed = []
        failed = []
        
        for seq in sequences:
            fail_reasons = []
            
            # Length check
            if seq.length < min_length:
                fail_reasons.append(f"length too short ({seq.length} < {min_length})")
            if seq.length > max_length:
                fail_reasons.append(f"length too long ({seq.length} > {max_length})")
            
            # Quality check (for FASTQ)
            if seq.avg_quality is not None and seq.avg_quality < min_quality:
                fail_reasons.append(f"quality too low ({seq.avg_quality:.1f} < {min_quality})")
            
            # GC content check
            if seq.gc_content < min_gc:
                fail_reasons.append(f"GC too low ({seq.gc_content:.1f}% < {min_gc}%)")
            if seq.gc_content > max_gc:
                fail_reasons.append(f"GC too high ({seq.gc_content:.1f}% > {max_gc}%)")
            
            if fail_reasons:
                failed.append(seq)
            else:
                passed.append(seq)
        
        logger.info(f"QC Filter: {len(passed)} passed, {len(failed)} failed")
        return passed, failed
    
    def calculate_quality_metrics(self, sequences: List[SequenceRecord]) -> QualityMetrics:
        """
        Calculate comprehensive quality metrics for a set of sequences
        
        Args:
            sequences: List of sequence records
            
        Returns:
            QualityMetrics object
        """
        if not sequences:
            return QualityMetrics(
                total_sequences=0, total_bases=0, avg_length=0,
                avg_gc_content=0, avg_quality=None, passed_qc=0,
                failed_qc=0, length_distribution={}, gc_distribution={}
            )
        
        total_bases = sum(s.length for s in sequences)
        avg_length = total_bases / len(sequences)
        avg_gc = sum(s.gc_content for s in sequences) / len(sequences)
        
        # Quality scores (for FASTQ)
        quality_seqs = [s for s in sequences if s.avg_quality is not None]
        avg_quality = (sum(s.avg_quality for s in quality_seqs) / len(quality_seqs)) if quality_seqs else None
        
        # QC pass/fail (using default thresholds)
        passed, failed = self.quality_filter(sequences)
        
        # Length distribution
        length_bins = {"<100": 0, "100-200": 0, "200-300": 0, "300-500": 0, "500-1000": 0, ">1000": 0}
        for s in sequences:
            if s.length < 100:
                length_bins["<100"] += 1
            elif s.length < 200:
                length_bins["100-200"] += 1
            elif s.length < 300:
                length_bins["200-300"] += 1
            elif s.length < 500:
                length_bins["300-500"] += 1
            elif s.length < 1000:
                length_bins["500-1000"] += 1
            else:
                length_bins[">1000"] += 1
        
        # GC distribution
        gc_bins = {"<30%": 0, "30-40%": 0, "40-50%": 0, "50-60%": 0, ">60%": 0}
        for s in sequences:
            if s.gc_content < 30:
                gc_bins["<30%"] += 1
            elif s.gc_content < 40:
                gc_bins["30-40%"] += 1
            elif s.gc_content < 50:
                gc_bins["40-50%"] += 1
            elif s.gc_content < 60:
                gc_bins["50-60%"] += 1
            else:
                gc_bins[">60%"] += 1
        
        return QualityMetrics(
            total_sequences=len(sequences),
            total_bases=total_bases,
            avg_length=avg_length,
            avg_gc_content=avg_gc,
            avg_quality=avg_quality,
            passed_qc=len(passed),
            failed_qc=len(failed),
            length_distribution=length_bins,
            gc_distribution=gc_bins
        )
    
    def run_blast(
        self,
        sequences: List[SequenceRecord],
        database: str = "nt",
        max_results: int = 10,
        max_sequences: int = 5
    ) -> List[SpeciesDetection]:
        """
        Run BLAST search for species identification
        
        Args:
            sequences: Sequences to search
            database: BLAST database to use
            max_results: Maximum results per sequence
            max_sequences: Maximum sequences to process (for demo)
            
        Returns:
            List of SpeciesDetection results
        """
        results = []
        
        for seq in sequences[:max_sequences]:
            try:
                logger.info(f"Running BLAST for sequence {seq.id}")
                
                # Run BLAST (using NCBI web service)
                result_handle = NCBIWWW.qblast(
                    "blastn",
                    database,
                    seq.sequence,
                    hitlist_size=max_results
                )
                
                blast_records = NCBIXML.parse(result_handle)
                
                for blast_record in blast_records:
                    for alignment in blast_record.alignments:
                        for hsp in alignment.hsps:
                            # Extract species name from title
                            species_name = self._extract_species_from_title(alignment.title)
                            identity = hsp.identities / hsp.align_length if hsp.align_length > 0 else 0
                            
                            # Get taxonomy
                            taxonomy = self._get_taxonomy(species_name)
                            
                            results.append(SpeciesDetection(
                                species=species_name,
                                confidence=identity,
                                method="BLAST",
                                e_value=hsp.expect,
                                identity=identity,
                                taxonomy=taxonomy
                            ))
                            break  # Take first HSP
                        break  # Take first alignment
            
            except Exception as e:
                logger.error(f"BLAST error for {seq.id}: {e}")
        
        return results
    
    def _extract_species_from_title(self, title: str) -> str:
        """Extract species name from BLAST hit title"""
        # Try to find binomial name pattern
        parts = title.split()
        for i, part in enumerate(parts):
            if part[0].isupper() and i + 1 < len(parts):
                next_part = parts[i + 1]
                if next_part[0].islower() and len(next_part) > 2:
                    return f"{part} {next_part}"
        return title[:50]  # Fallback
    
    def _get_taxonomy(self, species_name: str) -> Dict[str, str]:
        """Get taxonomy hierarchy for a species"""
        # Extract genus
        parts = species_name.split()
        genus = parts[0] if parts else ""
        
        # Look up in taxonomy database
        base_taxonomy = self.TAXONOMY_DB.get(genus, {
            "kingdom": "Animalia",
            "phylum": "Chordata",
            "class": "Unknown",
            "order": "Unknown",
            "family": "Unknown"
        })
        
        return {
            **base_taxonomy,
            "genus": genus,
            "species": species_name
        }
    
    def run_kraken2(self, file_path: str) -> List[SpeciesDetection]:
        """
        Run Kraken2 taxonomic classification
        
        Args:
            file_path: Path to sequence file
            
        Returns:
            List of SpeciesDetection results
        """
        if not self.kraken2_db or not os.path.exists(self.kraken2_db):
            logger.warning("Kraken2 database not configured")
            return []
        
        output_file = file_path + ".kraken2"
        report_file = file_path + ".report"
        
        try:
            cmd = [
                "kraken2",
                "--db", self.kraken2_db,
                "--output", output_file,
                "--report", report_file,
                file_path
            ]
            
            subprocess.run(cmd, check=True, capture_output=True)
            
            results = []
            with open(report_file, 'r') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if len(parts) >= 6:
                        percentage = float(parts[0])
                        reads = int(parts[1])
                        rank = parts[3]
                        name = parts[5].strip()
                        
                        if rank == 'S' and percentage > 0.1:
                            taxonomy = self._get_taxonomy(name)
                            results.append(SpeciesDetection(
                                species=name,
                                confidence=percentage / 100,
                                method="Kraken2",
                                reads=reads,
                                taxonomy=taxonomy
                            ))
            
            return sorted(results, key=lambda x: x.reads, reverse=True)
        
        except Exception as e:
            logger.error(f"Kraken2 error: {e}")
            return []
    
    def aggregate_detections(
        self, 
        *detection_lists: List[SpeciesDetection]
    ) -> List[SpeciesDetection]:
        """
        Aggregate and consolidate species detections from multiple methods
        
        Args:
            detection_lists: Variable number of detection lists
            
        Returns:
            Consolidated species detections
        """
        species_dict: Dict[str, SpeciesDetection] = {}
        
        for detections in detection_lists:
            for detection in detections:
                species = detection.species
                if species not in species_dict:
                    species_dict[species] = detection
                else:
                    # Merge: keep highest confidence, aggregate reads
                    existing = species_dict[species]
                    if detection.confidence > existing.confidence:
                        species_dict[species] = detection
                    species_dict[species].reads += detection.reads
        
        # Sort by confidence
        results = list(species_dict.values())
        results.sort(key=lambda x: x.confidence, reverse=True)
        
        return results
    
    def calculate_biodiversity(self, detections: List[SpeciesDetection]) -> BiodiversityMetrics:
        """
        Calculate biodiversity indices from species detections
        
        Args:
            detections: List of species detections with counts
            
        Returns:
            BiodiversityMetrics object
        """
        if not detections:
            return BiodiversityMetrics(
                shannon_index=0, simpson_index=0, chao1=0,
                observed_species=0, evenness=0, dominance=0, total_individuals=0
            )
        
        # Use reads as abundance, default to 1 if not available
        counts = [max(d.reads, 1) for d in detections]
        total = sum(counts)
        S = len(counts)  # Species richness
        
        # Shannon Index: H' = -Σ(pi * ln(pi))
        shannon_index = 0
        for count in counts:
            p = count / total
            if p > 0:
                shannon_index -= p * math.log(p)
        
        # Simpson Index: D = 1 - Σ(pi^2)
        simpson_sum = sum((count / total) ** 2 for count in counts)
        simpson_index = 1 - simpson_sum
        
        # Pielou's Evenness: J = H' / ln(S)
        evenness = shannon_index / math.log(S) if S > 1 else 0
        
        # Dominance: λ = Σ(pi^2)
        dominance = simpson_sum
        
        # Chao1 estimator
        singletons = sum(1 for c in counts if c == 1)
        doubletons = sum(1 for c in counts if c == 2)
        if doubletons > 0:
            chao1 = S + (singletons ** 2) / (2 * doubletons)
        else:
            chao1 = S + (singletons * (singletons - 1)) / 2
        
        return BiodiversityMetrics(
            shannon_index=shannon_index,
            simpson_index=simpson_index,
            chao1=chao1,
            observed_species=S,
            evenness=evenness,
            dominance=dominance,
            total_individuals=total
        )
    
    def build_taxonomy_tree(self, detections: List[SpeciesDetection]) -> Dict[str, Any]:
        """
        Build a hierarchical taxonomy tree from detections
        
        Args:
            detections: List of species detections with taxonomy
            
        Returns:
            Nested dictionary representing taxonomy tree
        """
        root = {
            "name": "All Taxa",
            "rank": "Root",
            "count": 0,
            "children": []
        }
        
        rank_order = ["kingdom", "phylum", "class", "order", "family", "genus", "species"]
        node_map: Dict[str, Dict] = {"Root": root}
        
        for detection in detections:
            if not detection.taxonomy:
                continue
            
            parent = root
            path = "Root"
            
            for rank in rank_order:
                value = detection.taxonomy.get(rank, f"Unknown {rank}")
                path = f"{path}>{value}"
                
                if path not in node_map:
                    node = {
                        "name": value,
                        "rank": rank.capitalize(),
                        "count": 0,
                        "confidence": detection.confidence,
                        "children": []
                    }
                    node_map[path] = node
                    parent["children"].append(node)
                
                node_map[path]["count"] += max(detection.reads, 1)
                parent = node_map[path]
            
            root["count"] += max(detection.reads, 1)
        
        return root
    
    def generate_report(
        self,
        sequences: List[SequenceRecord],
        detections: List[SpeciesDetection],
        quality_metrics: QualityMetrics,
        biodiversity: BiodiversityMetrics
    ) -> Dict[str, Any]:
        """
        Generate a comprehensive analysis report
        
        Args:
            sequences: Analyzed sequences
            detections: Species detections
            quality_metrics: Quality metrics
            biodiversity: Biodiversity metrics
            
        Returns:
            Complete report as dictionary
        """
        taxonomy_tree = self.build_taxonomy_tree(detections)
        
        return {
            "summary": {
                "total_sequences": len(sequences),
                "species_detected": len(detections),
                "analysis_methods": list(set(d.method for d in detections))
            },
            "quality": quality_metrics.to_dict(),
            "biodiversity": biodiversity.to_dict(),
            "taxonomy_tree": taxonomy_tree,
            "top_species": [d.to_dict() for d in detections[:10]],
            "all_detections": [d.to_dict() for d in detections]
        }


# Example usage and testing
if __name__ == "__main__":
    processor = EdnaProcessor()
    
    # Test with sample data
    sample_fasta = """>seq1 sample sequence 1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG
ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA
>seq2 sample sequence 2
GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAG
CTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAG"""
    
    sequences = processor.parse_sequence_string(sample_fasta)
    print(f"Parsed {len(sequences)} sequences")
    
    quality_metrics = processor.calculate_quality_metrics(sequences)
    print(f"Quality metrics: {quality_metrics}")
    
    # Simulate detections
    mock_detections = [
        SpeciesDetection(species="Thunnus albacares", confidence=0.95, method="BLAST", reads=150),
        SpeciesDetection(species="Coryphaena hippurus", confidence=0.88, method="BLAST", reads=80),
        SpeciesDetection(species="Tursiops truncatus", confidence=0.92, method="Kraken2", reads=45),
    ]
    
    biodiversity = processor.calculate_biodiversity(mock_detections)
    print(f"Biodiversity: Shannon={biodiversity.shannon_index:.3f}, Simpson={biodiversity.simpson_index:.3f}")
    
    tree = processor.build_taxonomy_tree(mock_detections)
    print(f"Taxonomy tree root count: {tree['count']}")

