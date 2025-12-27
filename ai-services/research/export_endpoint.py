"""
Citation Export API Endpoint
"""
from fastapi import HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional


class ExportRequest(BaseModel):
    """Request model for citation export."""
    papers: List[Dict[str, Any]]
    format: str  # 'bibtex', 'ris', 'apa', 'mla'


@app.post("/research/export")
async def export_citations(request: ExportRequest):
    """
    Export papers in various citation formats.
    
    Formats: BibTeX, RIS, APA, MLA
    """
    try:
        from research.citations import export_bibtex, export_ris, export_apa, export_mla
        
        format_handlers = {
            'bibtex': export_bibtex,
            'ris': export_ris,
            'apa': export_apa,
            'mla': export_mla
        }
        
        if request.format not in format_handlers:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {request.format}")
        
        handler = format_handlers[request.format]
        formatted_text = handler(request.papers)
        
        return {
            "success": True,
            "format": request.format,
            "text": formatted_text,
            "count": len(request.papers)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {str(e)}"
        )
