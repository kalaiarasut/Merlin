"""
Citation Export Utilities for Research Papers

Supports BibTeX, RIS (EndNote), and APA/MLA formats.
"""

def export_bibtex(papers: list) -> str:
    """
    Export papers as BibTeX format.
    
    Args:
        papers: List of paper dictionaries
        
    Returns:
        BibTeX formatted string
    """
    bibtex_entries = []
    
    for i, paper in enumerate(papers, 1):
        # Clean title and authors
        title = paper.get('title', '').replace('{', '').replace('}', '')
        authors = paper.get('authors', '').split(',')
        
        # Format authors for BibTeX
        author_str = ' and '.join([a.strip() for a in authors if a.strip()])
        
        entry = f"""@article{{paper{i},
  title = {{{title}}},
  author = {{{author_str}}},
  journal = {{{paper.get('journal', 'Unknown')}}},
  year = {{{paper.get('year', 'Unknown')}}},
  doi = {{{paper.get('doi', '')}}},
  note = {{Cited by: {paper.get('citations', 0)}}}
}}
"""
        bibtex_entries.append(entry)
    
    return '\n'.join(bibtex_entries)


def export_ris(papers: list) -> str:
    """
    Export papers as RIS format (for EndNote, Zotero, Mendeley).
    
    Args:
        papers: List of paper dictionaries
        
    Returns:
        RIS formatted string
    """
    ris_entries = []
    
    for paper in papers:
        authors = paper.get('authors', '').split(',')
        
        entry_lines = [
            "TY  - JOUR",  # Journal article
            f"TI  - {paper.get('title', '')}",
            f"JO  - {paper.get('journal', '')}",
            f"PY  - {paper.get('year', '')}",
        ]
        
        # Add authors
        for author in authors:
            if author.strip():
                entry_lines.append(f"AU  - {author.strip()}")
        
        # Add DOI if available
        if paper.get('doi'):
            entry_lines.append(f"DO  - {paper.get('doi')}")
        
        # Add abstract if available
        if paper.get('abstract'):
            entry_lines.append(f"AB  - {paper.get('abstract')}")
        
        entry_lines.append("ER  -\n")
        ris_entries.append('\n'.join(entry_lines))
    
    return '\n\n'.join(ris_entries)


def export_apa(papers: list) -> str:
    """
    Export papers in APA 7th edition format.
    
    Args:
        papers: List of paper dictionaries
       
    Returns:
        APA formatted string
    """
    apa_entries = []
    
    for paper in papers:
        # Format authors (last name, initials)
        authors_raw = paper.get('authors', '').split(',')
        if len(authors_raw) > 7:
            authors_str = ', '.join([a.strip() for a in authors_raw[:7]]) + ', ... '
        else:
            authors_str = ', '.join([a.strip() for a in authors_raw])
        
        # Build APA citation
        year = paper.get('year', 'n.d.')
        title = paper.get('title', '')
        journal = paper.get('journal', '')
        doi = paper.get('doi', '')
        
        citation = f"{authors_str} ({year}). {title}. *{journal}*."
        if doi:
            citation += f" https://doi.org/{doi}"
        
        apa_entries.append(citation)
    
    return '\n\n'.join(apa_entries)


def export_mla(papers: list) -> str:
    """
    Export papers in MLA 9th edition format.
    
    Args:
        papers: List of paper dictionaries
        
    Returns:
        MLA formatted string
    """
    mla_entries = []
    
    for paper in papers:
        # First author last name, first name
        authors_raw = paper.get('authors', '').split(',')
        first_author = authors_raw[0].strip() if authors_raw else 'Unknown'
        et_al = ', et al.' if len(authors_raw) > 1 else ''
        
        title = paper.get('title', '')
        journal = paper.get('journal', '')
        year = paper.get('year', 'n.d.')
        doi = paper.get('doi', '')
        
        citation = f'{first_author}{et_al}. "{title}." *{journal}*, {year}.'
        if doi:
            citation += f' doi:{doi}.'
        
        mla_entries.append(citation)
    
    return '\n\n'.join(mla_entries)
