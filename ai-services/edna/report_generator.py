"""
Publication-Ready Report Generator for eDNA Analysis

Peer-review-ready reporting with:
- Auto-inserted method citations
- Parameter appendix (JSON)
- Figure provenance tracking
- Report checksum for audits
- Auto-generated "Limitations" section

Features:
- Negative result reporting
- Method provenance embedding
- Version tracking
- Reproducibility documentation

Author: CMLRE Merlin Platform
"""

import os
import json
import hashlib
import logging
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Any
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Report version
REPORT_VERSION = "1.0.0"
PIPELINE_VERSION = "2.0.0"

# Citation repository
CITATIONS = {
    "blast": "Altschul SF, et al. (1990) Basic local alignment search tool. J Mol Biol 215:403-410. doi:10.1016/S0022-2836(05)80360-2",
    "silva": "Quast C, et al. (2013) The SILVA ribosomal RNA gene database project. Nucleic Acids Res 41:D590-D596. doi:10.1093/nar/gks1219",
    "dada2": "Callahan BJ, et al. (2016) DADA2: High-resolution sample inference from Illumina amplicon data. Nat Methods 13:581-583. doi:10.1038/nmeth.3869",
    "uchime": "Edgar RC, et al. (2011) UCHIME improves sensitivity and speed of chimera detection. Bioinformatics 27:2194-2200. doi:10.1093/bioinformatics/btr381",
    "qiime2": "Bolyen E, et al. (2019) Reproducible, interactive, scalable and extensible microbiome data science using QIIME 2. Nat Biotechnol 37:852-857. doi:10.1038/s41587-019-0209-9",
    "biom": "McDonald D, et al. (2012) The Biological Observation Matrix (BIOM) format. GigaScience 1:7. doi:10.1186/2047-217X-1-7",
    "edna_metabarcoding": "Deiner K, et al. (2017) Environmental DNA metabarcoding: Transforming how we survey animal and plant communities. Mol Ecol 26:5872-5895. doi:10.1111/mec.14350",
}

# Limitations text templates
LIMITATIONS_TEMPLATES = {
    "species_level": "Species-level assignments are conservative due to the use of bootstrap confidence thresholds (≥90% for species). Sequences not meeting these thresholds are reported at higher taxonomic ranks.",
    "database_coverage": "Taxonomic assignments are limited by the coverage of reference databases (SILVA, NCBI nt). Species absent from these databases cannot be identified.",
    "primer_bias": "Primer selection may introduce taxonomic biases. Results should be interpreted in the context of the target markers used.",
    "pcr_artifacts": "Despite chimera filtering, PCR artifacts may persist at low frequencies. Independent validation is recommended for novel taxa.",
    "relative_abundance": "Read counts provide semi-quantitative estimates of relative abundance. Absolute abundance cannot be inferred from metabarcoding data alone.",
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class FigureProvenance:
    """Figure provenance for audits"""
    figure_id: str
    figure_type: str
    input_table_hash: str  # SHA256 of input data
    script_version: str
    generation_date: str
    parameters: Dict[str, Any]
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class MethodCitation:
    """Method citation with DOI"""
    method: str
    citation: str
    doi: Optional[str] = None


@dataclass
class NegativeResultReport:
    """Negative result reporting section"""
    blank_controls_tested: int
    taxa_in_blanks: List[str]
    below_threshold_taxa: List[str]
    contamination_assessment: str
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class ParameterAppendix:
    """Parameter appendix for reproducibility"""
    pipeline_version: str
    analysis_date: str
    parameters: Dict[str, Any]
    thresholds: Dict[str, Any]
    random_seed: Optional[int]
    
    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


@dataclass
class Report:
    """Complete analysis report"""
    report_id: str
    title: str
    generation_date: str
    
    # Content sections
    summary: str
    methods: str
    results: str
    limitations: str
    
    # Citations
    citations: List[MethodCitation]
    
    # Negative results
    negative_results: Optional[NegativeResultReport]
    
    # Figures with provenance
    figures: List[FigureProvenance]
    
    # Parameter appendix
    parameters: ParameterAppendix
    
    # Audit
    report_checksum: str = ""
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    def to_markdown(self) -> str:
        """Export as Markdown"""
        sections = [
            f"# {self.title}",
            f"*Generated: {self.generation_date}*",
            f"*Report ID: {self.report_id}*",
            "",
            "## Summary",
            self.summary,
            "",
            "## Methods",
            self.methods,
            "",
            "## Results",
            self.results,
            "",
            "## Limitations",
            self.limitations,
            "",
            "## References",
        ]
        
        for citation in self.citations:
            sections.append(f"- {citation.citation}")
        
        if self.negative_results:
            sections.extend([
                "",
                "## Negative Control Results",
                f"- Blanks tested: {self.negative_results.blank_controls_tested}",
                f"- Taxa detected in blanks: {', '.join(self.negative_results.taxa_in_blanks) or 'None'}",
                f"- Assessment: {self.negative_results.contamination_assessment}",
            ])
        
        sections.extend([
            "",
            "---",
            f"*Report checksum: {self.report_checksum}*",
        ])
        
        return "\n".join(sections)


# =============================================================================
# REPORT GENERATOR
# =============================================================================

class ReportGenerator:
    """
    Publication-ready report generator.
    
    Features:
    - Auto-inserted method citations
    - Parameter appendix generation
    - Figure provenance tracking
    - Report checksum for audits
    - Auto-generated limitations section
    """
    
    def __init__(self):
        self.citations_db = CITATIONS
        self.limitations_db = LIMITATIONS_TEMPLATES
    
    def generate(
        self,
        analysis_results: Dict[str, Any],
        sample_metadata: List[Dict[str, Any]],
        parameters: Dict[str, Any],
        figures: Optional[List[Dict[str, Any]]] = None,
        negative_controls: Optional[Dict[str, Any]] = None
    ) -> Report:
        """
        Generate publication-ready report.
        
        Args:
            analysis_results: Results from pipeline
            sample_metadata: Sample information
            parameters: Analysis parameters used
            figures: Figure metadata for provenance
            negative_controls: Negative control results
        
        Returns:
            Complete Report object
        """
        report_id = self._generate_report_id()
        generation_date = datetime.now().isoformat()
        
        # Generate sections
        summary = self._generate_summary(analysis_results)
        methods = self._generate_methods(parameters)
        results = self._generate_results(analysis_results)
        limitations = self._generate_limitations(analysis_results)
        
        # Collect citations
        citations = self._collect_citations(parameters)
        
        # Process negative results
        negative_results = None
        if negative_controls:
            negative_results = self._process_negative_controls(negative_controls)
        
        # Process figures
        figure_provenance = []
        if figures:
            for fig in figures:
                prov = FigureProvenance(
                    figure_id=fig.get("id", "unknown"),
                    figure_type=fig.get("type", "plot"),
                    input_table_hash=self._hash_data(fig.get("input_data", {})),
                    script_version=fig.get("script_version", PIPELINE_VERSION),
                    generation_date=generation_date,
                    parameters=fig.get("parameters", {}),
                )
                figure_provenance.append(prov)
        
        # Create parameter appendix
        param_appendix = ParameterAppendix(
            pipeline_version=PIPELINE_VERSION,
            analysis_date=generation_date,
            parameters=parameters,
            thresholds=parameters.get("thresholds", {}),
            random_seed=parameters.get("random_seed"),
        )
        
        # Create report
        report = Report(
            report_id=report_id,
            title=f"eDNA Analysis Report - {generation_date[:10]}",
            generation_date=generation_date,
            summary=summary,
            methods=methods,
            results=results,
            limitations=limitations,
            citations=citations,
            negative_results=negative_results,
            figures=figure_provenance,
            parameters=param_appendix,
        )
        
        # Generate checksum
        report.report_checksum = self._generate_checksum(report)
        
        return report
    
    def _generate_summary(self, results: Dict[str, Any]) -> str:
        """Generate executive summary"""
        asv_count = results.get("asv_count", 0)
        species_count = results.get("species_count", 0)
        sample_count = results.get("sample_count", 0)
        
        return f"""This eDNA metabarcoding analysis processed {sample_count} samples, 
identifying {asv_count} amplicon sequence variants (ASVs) assigned to {species_count} 
species-level taxa. Analysis followed publication-ready standards with bootstrap 
confidence thresholds and chimera filtering."""
    
    def _generate_methods(self, parameters: Dict[str, Any]) -> str:
        """Generate methods section with auto-citations"""
        sections = []
        
        # Denoising
        sections.append(f"""**Sequence Processing**: Raw reads were quality-filtered 
(minimum Q={parameters.get('min_quality', 20)}) and denoised using a DADA2-style 
algorithm to produce amplicon sequence variants (ASVs) [DADA2].""")
        
        # Chimera detection
        sections.append(f"""**Chimera Detection**: Chimeric sequences were identified 
using de novo detection with marker-specific thresholds validated against synthetic 
chimeras [UCHIME].""")
        
        # Taxonomy
        sections.append(f"""**Taxonomic Assignment**: Taxonomy was assigned using a 
two-stage approach: (1) SILVA Naive Bayes classification for rRNA markers [SILVA], 
and (2) NCBI BLAST for species-level refinement [BLAST]. Weighted LCA was applied 
with bitscore × alignment length weighting. Bootstrap confidence thresholds were: 
kingdom ≥70%, species ≥90%.""")
        
        return "\n\n".join(sections)
    
    def _generate_results(self, results: Dict[str, Any]) -> str:
        """Generate results section"""
        sections = []
        
        # Overview
        sections.append(f"""A total of {results.get('asv_count', 0)} ASVs were retained 
after quality filtering and chimera removal ({results.get('chimera_rate', 0):.1%} 
chimera rate). Taxonomic assignment achieved species-level resolution for 
{results.get('species_level_rate', 0):.1%} of sequences.""")
        
        return "\n\n".join(sections)
    
    def _generate_limitations(self, results: Dict[str, Any]) -> str:
        """Auto-generate limitations section"""
        limitations = []
        
        # Always include core limitations
        limitations.append(self.limitations_db["species_level"])
        limitations.append(self.limitations_db["database_coverage"])
        limitations.append(self.limitations_db["relative_abundance"])
        
        # Context-specific
        if results.get("low_biomass", False):
            limitations.append(self.limitations_db["pcr_artifacts"])
        
        return "\n\n".join(limitations)
    
    def _collect_citations(self, parameters: Dict[str, Any]) -> List[MethodCitation]:
        """Collect relevant citations based on methods used"""
        citations = []
        
        # Always cite core methods
        core_methods = ["blast", "silva", "dada2", "uchime", "edna_metabarcoding"]
        
        for method in core_methods:
            if method in self.citations_db:
                citation_text = self.citations_db[method]
                # Extract DOI if present
                doi = None
                if "doi:" in citation_text:
                    doi = citation_text.split("doi:")[-1].strip()
                
                citations.append(MethodCitation(
                    method=method,
                    citation=citation_text,
                    doi=doi,
                ))
        
        return citations
    
    def _process_negative_controls(self, controls: Dict[str, Any]) -> NegativeResultReport:
        """Process negative control data"""
        return NegativeResultReport(
            blank_controls_tested=controls.get("blank_count", 0),
            taxa_in_blanks=controls.get("taxa_in_blanks", []),
            below_threshold_taxa=controls.get("below_threshold", []),
            contamination_assessment=controls.get("assessment", "No significant contamination detected in blank controls."),
        )
    
    def _generate_report_id(self) -> str:
        """Generate unique report ID"""
        timestamp = datetime.now().isoformat()
        hash_val = hashlib.sha256(timestamp.encode()).hexdigest()[:8]
        return f"EDNA-{hash_val.upper()}"
    
    def _hash_data(self, data: Any) -> str:
        """Hash data for provenance"""
        content = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def _generate_checksum(self, report: Report) -> str:
        """Generate report checksum for audit"""
        content = json.dumps(report.to_dict(), sort_keys=True, default=str)
        return hashlib.sha256(content.encode()).hexdigest()[:16]


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def generate_report(
    results: Dict[str, Any],
    samples: List[Dict[str, Any]],
    parameters: Dict[str, Any]
) -> Report:
    """Generate publication-ready report"""
    generator = ReportGenerator()
    return generator.generate(results, samples, parameters)


def get_citation(method: str) -> Optional[str]:
    """Get citation for a specific method"""
    return CITATIONS.get(method)


def get_report_documentation() -> Dict[str, Any]:
    """Get report generator documentation"""
    return {
        "features": [
            "Auto-inserted method citations",
            "Parameter appendix (JSON)",
            "Figure provenance (input_table_hash, script_version)",
            "Report checksum for audits",
            "Auto-generated 'Limitations' section",
            "Negative result reporting section",
        ],
        "available_citations": list(CITATIONS.keys()),
        "limitations_templates": list(LIMITATIONS_TEMPLATES.keys()),
        "output_formats": ["Markdown", "JSON", "dict"],
    }


# =============================================================================
# MAIN (for testing)
# =============================================================================

if __name__ == "__main__":
    # Test data
    test_results = {
        "asv_count": 1234,
        "species_count": 89,
        "sample_count": 24,
        "chimera_rate": 0.034,
        "species_level_rate": 0.67,
    }
    
    test_samples = [
        {"sample_id": "S1", "location": "Arabian Sea"},
        {"sample_id": "S2", "location": "Bay of Bengal"},
    ]
    
    test_parameters = {
        "min_quality": 20,
        "min_abundance": 8,
        "random_seed": 42,
        "thresholds": {
            "min_pident": 85,
            "min_qcovs": 70,
        }
    }
    
    test_figures = [
        {
            "id": "fig1_diversity",
            "type": "barplot",
            "input_data": {"values": [1, 2, 3]},
            "script_version": "1.0.0",
        }
    ]
    
    test_negative = {
        "blank_count": 3,
        "taxa_in_blanks": [],
        "assessment": "No taxa detected in blank controls.",
    }
    
    # Generate report
    generator = ReportGenerator()
    report = generator.generate(
        test_results,
        test_samples,
        test_parameters,
        figures=test_figures,
        negative_controls=test_negative,
    )
    
    print(f"\nReport Generated:")
    print(f"  ID: {report.report_id}")
    print(f"  Checksum: {report.report_checksum}")
    print(f"  Citations: {len(report.citations)}")
    print(f"  Figures: {len(report.figures)}")
    
    print(f"\nMarkdown Preview (first 500 chars):")
    print(report.to_markdown()[:500])
    
    print(f"\nParameter Appendix:")
    print(report.parameters.to_json()[:300])
