"""
Report Generation Module

Automated PDF and HTML report generation for marine research analyses
with charts, tables, summaries, and export capabilities.
"""

import os
import json
import base64
from io import BytesIO
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Conditional imports
try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    logger.warning("Matplotlib not available. Chart generation disabled.")

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        Image, PageBreak, ListFlowable, ListItem
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    logger.warning("ReportLab not available. PDF generation disabled.")

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False


class ReportFormat(Enum):
    """Available report formats"""
    PDF = "pdf"
    HTML = "html"
    JSON = "json"
    MARKDOWN = "markdown"


class ReportType(Enum):
    """Types of reports"""
    SPECIES_ANALYSIS = "species_analysis"
    EDNA_ANALYSIS = "edna_analysis"
    OTOLITH_ANALYSIS = "otolith_analysis"
    BIODIVERSITY = "biodiversity"
    NICHE_MODEL = "niche_model"
    OCEANOGRAPHY = "oceanography"
    SURVEY_SUMMARY = "survey_summary"
    CUSTOM = "custom"


@dataclass
class ChartConfig:
    """Configuration for chart generation"""
    chart_type: str  # bar, line, pie, scatter, heatmap
    title: str
    x_label: str = ""
    y_label: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    colors: List[str] = field(default_factory=list)
    width: float = 6.0
    height: float = 4.0
    
    
@dataclass
class TableConfig:
    """Configuration for table generation"""
    title: str
    headers: List[str]
    rows: List[List[Any]]
    column_widths: Optional[List[float]] = None
    highlight_header: bool = True


@dataclass
class ReportSection:
    """A section of a report"""
    title: str
    content: str = ""
    level: int = 1  # Heading level
    charts: List[ChartConfig] = field(default_factory=list)
    tables: List[TableConfig] = field(default_factory=list)
    bullet_points: List[str] = field(default_factory=list)
    key_findings: List[str] = field(default_factory=list)


@dataclass
class ReportMetadata:
    """Metadata for the report"""
    title: str
    author: str = "CMLRE Marine Data Platform"
    organization: str = "Centre for Marine Living Resources & Ecology"
    date: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    version: str = "1.0"
    report_type: str = ReportType.CUSTOM.value
    keywords: List[str] = field(default_factory=list)
    abstract: str = ""


class ReportGenerator:
    """
    Comprehensive report generation system for marine research.
    
    Supports:
    - PDF reports with professional formatting
    - HTML reports for web viewing
    - Markdown for documentation
    - JSON for data export
    
    Features:
    - Automatic chart generation
    - Dynamic tables
    - Summary statistics
    - Key findings extraction
    - Multi-section reports
    """
    
    # CMLRE brand colors
    COLORS = {
        'primary': '#0891b2',      # Ocean blue
        'secondary': '#10b981',    # Marine green
        'accent': '#f97316',       # Coral orange
        'dark': '#1e3a5f',         # Deep blue
        'light': '#f0f9ff',        # Light blue
        'text': '#1f2937',         # Dark gray
        'muted': '#6b7280',        # Gray
    }
    
    CHART_COLORS = ['#0891b2', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
    
    def __init__(self, output_dir: str = "./reports"):
        """Initialize the report generator."""
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        if REPORTLAB_AVAILABLE:
            self.styles = getSampleStyleSheet()
            self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Set up custom paragraph styles for PDF."""
        # Title Style
        self.styles.add(ParagraphStyle(
            name='ReportTitle',
            parent=self.styles['Heading1'],
            fontSize=26,
            leading=30,
            spaceAfter=30,
            textColor=colors.whitesmoke,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        # Section Heading (like Card Title)
        self.styles.add(ParagraphStyle(
            name='SectionHeading',
            parent=self.styles['Heading2'],
            fontSize=18,
            leading=22,
            spaceBefore=20,
            spaceAfter=15,
            textColor=colors.HexColor(self.COLORS['primary']),
            fontName='Helvetica-Bold'
        ))
        
        # Sub Heading
        self.styles.add(ParagraphStyle(
            name='SubHeading',
            parent=self.styles['Heading3'],
            fontSize=14,
            leading=18,
            spaceBefore=12,
            spaceAfter=8,
            textColor=colors.HexColor(self.COLORS['dark']),
            fontName='Helvetica-Bold'
        ))
        
        # Body Text
        self.styles.add(ParagraphStyle(
            name='ReportBody',
            parent=self.styles['Normal'],
            fontSize=11,
            leading=15,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
            textColor=colors.HexColor(self.COLORS['text'])
        ))
        
        # Key Finding Item
        self.styles.add(ParagraphStyle(
            name='Finding',
            parent=self.styles['Normal'],
            fontSize=10,
            leading=14,
            leftIndent=15,
            spaceAfter=4,
            textColor=colors.HexColor(self.COLORS['dark'])
        ))
        
        # Footer Text
        self.styles.add(ParagraphStyle(
            name='FooterText',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor(self.COLORS['muted']),
            alignment=TA_CENTER
        ))

        # Card Header Text
        self.styles.add(ParagraphStyle(
            name='CardTitle',
            parent=self.styles['Normal'],
            fontSize=12,
            leading=14,
            textColor=colors.HexColor(self.COLORS['primary']),
            fontName='Helvetica-Bold',
            spaceAfter=6
        ))

    def _pdf_header_footer(self, canvas, doc):
        """Draw header and footer on each PDF page."""
        canvas.saveState()
        
        # --- Header ---
        # Blue gradient-like background for top
        header_height = 80
        page_width, page_height = A4
        
        # Primary Color Bar
        canvas.setFillColor(colors.HexColor(self.COLORS['dark']))
        canvas.rect(0, page_height - header_height, page_width, header_height, stroke=0, fill=1)
        
        # Accent Line
        canvas.setFillColor(colors.HexColor(self.COLORS['primary']))
        canvas.rect(0, page_height - header_height, page_width, 4, stroke=0, fill=1)
        
        # Title/Logo Area Text
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 18)
        canvas.drawString(50, page_height - 45, "CMLRE Marine Data Platform")
        
        canvas.setFont("Helvetica", 10)
        canvas.drawString(50, page_height - 65, "Automated Analysis Report")
        
        # Date on right
        date_str = datetime.now().strftime("%Y-%m-%d")
        canvas.drawRightString(page_width - 50, page_height - 45, f"Date: {date_str}")
        
        # --- Footer ---
        canvas.setStrokeColor(colors.HexColor(self.COLORS['light']))
        canvas.line(50, 50, page_width - 50, 50)
        
        canvas.setFillColor(colors.HexColor(self.COLORS['muted']))
        canvas.setFont("Helvetica", 8)
        
        # Left Footer
        canvas.drawString(50, 35, "Generated by CMLRE AI Analytics")
        
        # Right Footer (Page Number)
        page_num = canvas.getPageNumber()
        canvas.drawRightString(page_width - 50, 35, f"Page {page_num}")
        
        canvas.restoreState()
    
    def create_chart(self, config: ChartConfig) -> Optional[str]:
        """
        Create a chart and return as base64 encoded image.
        
        Args:
            config: ChartConfig with chart specifications
            
        Returns:
            Base64 encoded PNG image string
        """
        if not MATPLOTLIB_AVAILABLE:
            return None
        
        try:
            fig, ax = plt.subplots(figsize=(config.width, config.height))
            colors = config.colors or self.CHART_COLORS
            
            if config.chart_type == 'bar':
                data = config.data
                x = list(data.keys())
                y = list(data.values())
                bars = ax.bar(x, y, color=colors[:len(x)])
                ax.set_xticklabels(x, rotation=45, ha='right')
                
            elif config.chart_type == 'horizontal_bar':
                data = config.data
                y_pos = range(len(data))
                ax.barh(y_pos, list(data.values()), color=colors[:len(data)])
                ax.set_yticks(y_pos)
                ax.set_yticklabels(list(data.keys()))
                
            elif config.chart_type == 'line':
                for i, (label, values) in enumerate(config.data.items()):
                    ax.plot(values, label=label, color=colors[i % len(colors)], linewidth=2)
                ax.legend()
                
            elif config.chart_type == 'pie':
                data = config.data
                ax.pie(
                    list(data.values()),
                    labels=list(data.keys()),
                    colors=colors[:len(data)],
                    autopct='%1.1f%%',
                    startangle=90
                )
                ax.axis('equal')
                
            elif config.chart_type == 'scatter':
                x = config.data.get('x', [])
                y = config.data.get('y', [])
                ax.scatter(x, y, c=colors[0], alpha=0.6)
                
            elif config.chart_type == 'area':
                for i, (label, values) in enumerate(config.data.items()):
                    ax.fill_between(range(len(values)), values, alpha=0.5, 
                                   label=label, color=colors[i % len(colors)])
                ax.legend()
            
            ax.set_title(config.title, fontsize=12, fontweight='bold', color=self.COLORS['dark'])
            if config.x_label:
                ax.set_xlabel(config.x_label)
            if config.y_label:
                ax.set_ylabel(config.y_label)
            
            ax.spines['top'].set_visible(False)
            ax.spines['right'].set_visible(False)
            
            plt.tight_layout()
            
            # Convert to base64
            buffer = BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight',
                       facecolor='white', edgecolor='none')
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.read()).decode('utf-8')
            plt.close(fig)
            
            return image_base64
            
        except Exception as e:
            logger.error(f"Chart creation error: {e}")
            plt.close('all')
            return None
    
    def generate_pdf(
        self,
        metadata: ReportMetadata,
        sections: List[ReportSection],
        filename: Optional[str] = None
    ) -> str:
        """
        Generate a PDF report.
        
        Args:
            metadata: Report metadata
            sections: List of report sections
            filename: Output filename (optional)
            
        Returns:
            Path to generated PDF
        """
        if not REPORTLAB_AVAILABLE:
            raise RuntimeError("ReportLab not available. Install with: pip install reportlab")
        
        filename = filename or f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        filepath = os.path.join(self.output_dir, filename)
        
        # Doc Template with margins for Header/Footer
        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=100,  # Space for Header
            bottomMargin=60   # Space for Footer
        )
        
        story = []
        
        # --- Title Page Content ---
        # Push down slightly
        story.append(Spacer(1, 1*inch))
        
        # Main Title
        story.append(Paragraph(metadata.title, self.styles['ReportTitle']))
        story.append(Spacer(1, 0.2*inch))
        
        # Organization
        story.append(Paragraph(
            f"{metadata.organization}",
            ParagraphStyle('OrgName', parent=self.styles['Normal'], 
                          alignment=TA_CENTER, fontSize=14, textColor=colors.HexColor(self.COLORS['primary']), fontName='Helvetica-Bold')
        ))
        
        # Meta Info Box (Author, etc.)
        story.append(Spacer(1, 0.5*inch))
        meta_data = [
            [Paragraph(f"<b>Author:</b> {metadata.author}", self.styles['Normal']),
             Paragraph(f"<b>Version:</b> {metadata.version}", self.styles['Normal'])],
            [Paragraph(f"<b>Report Type:</b> {metadata.report_type.replace('_', ' ').title()}", self.styles['Normal']),
             Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", self.styles['Normal'])]
        ]
        t_meta = Table(meta_data, colWidths=[3.5*inch, 2.5*inch])
        t_meta.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(self.COLORS['light'])),
            ('TOPPADDING', (0,0), (-1,-1), 12),
            ('BOTTOMPADDING', (0,0), (-1,-1), 12),
            ('LEFTPADDING', (0,0), (-1,-1), 15),
            ('GRID', (0,0), (-1,-1), 0.5, colors.white),
        ]))
        story.append(t_meta)
        
        # Abstract
        if metadata.abstract:
            story.append(Spacer(1, 0.5*inch))
            story.append(Paragraph("Executive Summary", self.styles['SectionHeading']))
            
            # Abstract inside a distinct left-bordered box effect (using indentation)
            p_abstract = Paragraph(metadata.abstract, ParagraphStyle(
                'AbstractBody', parent=self.styles['ReportBody'],
                leftIndent=10, borderPadding=10,
                borderColor=colors.HexColor(self.COLORS['primary']),
                borderWidth=0, borderLeftWidth=4
            ))
            story.append(p_abstract)
        
        story.append(PageBreak())
        
        # --- Content Sections ---
        for section in sections:
            # Section Title
            story.append(Paragraph(section.title, self.styles['SectionHeading']))
            
            # Content Text
            if section.content:
                # Basic markdown parsing for bold/italic if needed (ReportLab supports <b>, <i>)
                # We assume content is reasonably clean or HTML-like; strict markdown might need parsing
                # For now, just render as text. Markdown chars like ** will show literally unless converted.
                # A simple replace can help:
                formatted_content = section.content.replace('\n', '<br/>')
                # Simple bold conversion (very basic)
                formatted_content = formatted_content.replace('**', '<b>', 1).replace('**', '</b>', 1)
                
                story.append(Paragraph(formatted_content, self.styles['ReportBody']))
                story.append(Spacer(1, 0.15*inch))
            
            # Key Findings (Card Style)
            if section.key_findings:
                story.append(Spacer(1, 0.1*inch))
                
                kf_data = [[Paragraph("Key Findings", self.styles['CardTitle'])]]
                for finding in section.key_findings:
                    kf_data.append([Paragraph(f"• {finding}", self.styles['Finding'])])
                
                # Checkmark/Success color theme for findings
                t_kf = Table(kf_data, colWidths=[6*inch])
                t_kf.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f0fdf4')), # Light green
                    ('BOX', (0,0), (-1,-1), 1, colors.HexColor(self.COLORS['secondary'])),
                    ('TOPPADDING', (0,0), (-1,0), 8), # Header padding
                    ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                    ('LEFTPADDING', (0,0), (-1,-1), 12),
                    ('LINEBELOW', (0,0), (-1,0), 0.5, colors.HexColor('#bbf7d0')), # Divider
                ]))
                story.append(t_kf)
                story.append(Spacer(1, 0.2*inch))
            
            # Bullet Points
            if section.bullet_points:
                items = [ListItem(Paragraph(bp, self.styles['ReportBody'])) 
                        for bp in section.bullet_points]
                story.append(ListFlowable(items, bulletType='bullet', leftIndent=20))
                story.append(Spacer(1, 0.1*inch))
            
            # Charts
            for chart_config in section.charts:
                chart_base64 = self.create_chart(chart_config)
                if chart_base64:
                    img_data = base64.b64decode(chart_base64)
                    img_buffer = BytesIO(img_data)
                    # Constrain width to page
                    img_width = min(chart_config.width*inch, 6*inch)
                    aspect = chart_config.height / chart_config.width
                    img_height = img_width * aspect
                    
                    img = Image(img_buffer, width=img_width, height=img_height)
                    story.append(Spacer(1, 0.1*inch))
                    story.append(img)
                    story.append(Spacer(1, 0.2*inch))
            
            # Tables
            for table_config in section.tables:
                story.append(Paragraph(table_config.title, self.styles['SubHeading']))
                
                table_data = [table_config.headers] + table_config.rows
                
                col_widths = table_config.column_widths
                if not col_widths:
                    # Auto spread
                    avail_width = 6.5 * inch
                    col_w = avail_width / len(table_config.headers)
                    col_widths = [col_w] * len(table_config.headers)
                
                t = Table(table_data, colWidths=col_widths)
                
                # Enterprise Table Style
                t_style = TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(self.COLORS['dark'])),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                    ('TOPPADDING', (0, 0), (-1, 0), 10),
                    # Body
                    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                    ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor(self.COLORS['text'])),
                    ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor(self.COLORS['light'])),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ])
                
                # Striped rows
                for i in range(1, len(table_data)):
                    if i % 2 == 0:
                        t_style.add('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f8fafc'))
                
                t.setStyle(t_style)
                story.append(t)
                story.append(Spacer(1, 0.2*inch))
            
            story.append(Spacer(1, 0.3*inch))
        
        # Build PDF with Header/Footer
        doc.build(
            story,
            onFirstPage=self._pdf_header_footer,
            onLaterPages=self._pdf_header_footer
        )
        
        logger.info(f"PDF report generated: {filepath}")
        return filepath
    
    def generate_html(
        self,
        metadata: ReportMetadata,
        sections: List[ReportSection],
        filename: Optional[str] = None
    ) -> str:
        """
        Generate an HTML report.
        
        Args:
            metadata: Report metadata
            sections: List of report sections
            filename: Output filename (optional)
            
        Returns:
            Path to generated HTML
        """
        filename = filename or f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
        filepath = os.path.join(self.output_dir, filename)
        
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{metadata.title} - CMLRE Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {{
            --primary: #0891b2;
            --primary-dark: #0e7490;
            --secondary: #10b981;
            --accent: #f97316;
            --dark: #0f172a;
            --dark-lighter: #1e293b;
            --light: #f8fafc;
            --lighter: #f1f5f9;
            --text: #1e293b;
            --text-muted: #64748b;
            --border: #e2e8f0;
            --success: #22c55e;
            --warning: #f59e0b;
            --gradient-start: #0891b2;
            --gradient-end: #0e7490;
        }}
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.7;
            color: var(--text);
            background: var(--light);
            font-size: 15px;
        }}
        
        /* Print Styles */
        @media print {{
            body {{ background: white; }}
            .no-print {{ display: none !important; }}
            .section {{ page-break-inside: avoid; box-shadow: none; border: 1px solid var(--border); }}
        }}
        
        /* Header */
        .header {{
            background: linear-gradient(135deg, var(--dark) 0%, var(--dark-lighter) 100%);
            color: white;
            padding: 50px 40px;
            position: relative;
            overflow: hidden;
        }}
        
        .header::before {{
            content: '';
            position: absolute;
            top: -50%;
            right: -20%;
            width: 60%;
            height: 200%;
            background: linear-gradient(135deg, var(--primary) 0%, transparent 60%);
            opacity: 0.3;
            transform: rotate(-15deg);
        }}
        
        .header-content {{
            max-width: 1200px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
        }}
        
        .header-logo {{
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 30px;
        }}
        
        .logo-icon {{
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }}
        
        .logo-text {{
            font-size: 14px;
            font-weight: 500;
            opacity: 0.9;
            letter-spacing: 0.5px;
        }}
        
        .header h1 {{
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 12px;
            letter-spacing: -0.5px;
        }}
        
        .header-meta {{
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            font-size: 14px;
            opacity: 0.85;
        }}
        
        .header-meta span {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        
        /* Container */
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px;
        }}
        
        /* Executive Summary / Abstract */
        .executive-summary {{
            background: white;
            border-radius: 16px;
            padding: 32px;
            margin-bottom: 32px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            border-left: 5px solid var(--primary);
        }}
        
        .executive-summary h2 {{
            font-size: 13px;
            font-weight: 600;
            color: var(--primary);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 16px;
        }}
        
        .executive-summary p {{
            font-size: 16px;
            color: var(--text-muted);
            line-height: 1.8;
        }}
        
        /* Main Content Grid */
        .content-grid {{
            display: grid;
            gap: 32px;
        }}
        
        /* Section Cards */
        .section {{
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }}
        
        .section-header {{
            background: linear-gradient(to right, var(--lighter), white);
            padding: 24px 32px;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 16px;
        }}
        
        .section-icon {{
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
        }}
        
        .section-header h2 {{
            font-size: 20px;
            font-weight: 600;
            color: var(--dark);
        }}
        
        .section-body {{
            padding: 32px;
        }}
        
        /* Content Styling */
        .section-body p {{
            color: var(--text);
            margin-bottom: 20px;
            text-align: justify;
        }}
        
        .section-body strong {{
            color: var(--dark);
            font-weight: 600;
        }}
        
        /* Parsed Markdown Headers */
        .content-header {{
            font-size: 16px;
            font-weight: 600;
            color: var(--primary);
            margin: 24px 0 12px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--lighter);
        }}
        
        /* Data List for Species/Items */
        .data-list {{
            display: grid;
            gap: 12px;
            margin: 24px 0;
        }}
        
        .data-item {{
            display: flex;
            align-items: flex-start;
            gap: 16px;
            padding: 16px 20px;
            background: var(--lighter);
            border-radius: 10px;
            transition: all 0.2s ease;
        }}
        
        .data-item:hover {{
            background: #e0f2fe;
            transform: translateX(4px);
        }}
        
        .data-number {{
            width: 32px;
            height: 32px;
            background: var(--primary);
            color: white;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            flex-shrink: 0;
        }}
        
        .data-content {{
            flex: 1;
        }}
        
        .data-content .species-name {{
            font-weight: 600;
            color: var(--dark);
            font-family: 'Roboto Mono', monospace;
        }}
        
        .data-content .common-name {{
            color: var(--primary);
            font-weight: 500;
        }}
        
        .data-content .metadata {{
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 4px;
        }}
        
        /* Key Findings */
        .findings-container {{
            margin: 24px 0;
        }}
        
        .findings-title {{
            font-size: 15px;
            font-weight: 600;
            color: var(--dark);
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        
        .findings-list {{
            list-style: none;
            display: grid;
            gap: 12px;
        }}
        
        .findings-list li {{
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 14px 18px;
            background: linear-gradient(to right, #ecfdf5, white);
            border-radius: 10px;
            border-left: 3px solid var(--secondary);
        }}
        
        .findings-list li::before {{
            content: "\\2713";
            color: var(--secondary);
            font-weight: 700;
            font-size: 16px;
        }}
        
        /* Tables */
        .table-container {{
            margin: 24px 0;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--border);
        }}
        
        .table-title {{
            font-size: 15px;
            font-weight: 600;
            color: var(--dark);
            padding: 16px 20px;
            background: var(--lighter);
            border-bottom: 1px solid var(--border);
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }}
        
        th {{
            background: var(--dark);
            color: white;
            padding: 14px 18px;
            text-align: left;
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        
        td {{
            padding: 14px 18px;
            border-bottom: 1px solid var(--border);
            color: var(--text);
        }}
        
        tr:nth-child(even) {{ background: var(--lighter); }}
        tr:hover {{ background: #e0f2fe; }}
        
        /* Footer */
        .footer {{
            text-align: center;
            padding: 40px;
            color: var(--text-muted);
            font-size: 13px;
        }}
        
        .footer-brand {{
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 12px;
        }}
        
        .footer-logo {{
            width: 28px;
            height: 28px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-radius: 6px;
        }}
        
        /* Responsive */
        @media (max-width: 768px) {{
            .header {{ padding: 32px 20px; }}
            .header h1 {{ font-size: 1.75rem; }}
            .container {{ padding: 20px; }}
            .section-body {{ padding: 20px; }}
        }}
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <div class="header-logo">
                <div class="logo-icon">&#x1F30A;</div>
                <div class="logo-text">{metadata.organization}</div>
            </div>
            <h1>{metadata.title}</h1>
            <div class="header-meta">
                <span>Date: {metadata.date}</span>
                <span>Author: {metadata.author}</span>
                <span>Type: {metadata.report_type.replace('_', ' ').title()}</span>
            </div>
        </div>
    </header>
    
    <main class="container">
"""
        
        # Abstract / Executive Summary
        if metadata.abstract:
            html_content += f"""
        <div class="executive-summary">
            <h2>Executive Summary</h2>
            <p>{metadata.abstract}</p>
        </div>
"""
        
        # Content Grid
        html_content += """        <div class="content-grid">
"""
        
        # Sections
        for section in sections:
            # Use simple text-based icons instead of emojis (no encoding issues)
            icon = "&#x25CF;"  # Bullet point
            
            html_content += f"""
            <div class="section">
                <div class="section-header">
                    <h2>{section.title}</h2>
                </div>
                <div class="section-body">
"""
            
            # Content - parse markdown-style formatting
            if section.content:
                # Parse the content for better formatting
                content = section.content
                import re
                
                # Convert markdown headers (### Header -> <h3>Header</h3>)
                content = re.sub(r'^###\s*(.+)$', r'<h3 class="content-header">\1</h3>', content, flags=re.MULTILINE)
                content = re.sub(r'^##\s*(.+)$', r'<h3 class="content-header">\1</h3>', content, flags=re.MULTILINE)
                
                # Convert markdown bold to HTML
                content = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', content)
                content = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', content)
                
                # Convert numbered lists
                lines = content.split('\n')
                formatted_lines = []
                in_list = False
                
                for line in lines:
                    line = line.strip()
                    if not line:
                        if in_list:
                            formatted_lines.append('</div>')
                            in_list = False
                        continue
                    
                    # If it's an HTML header, pass through
                    if line.startswith('<h3'):
                        if in_list:
                            formatted_lines.append('</div>')
                            in_list = False
                        formatted_lines.append(line)
                        continue
                    
                    # Check for numbered list items like "1. Species..."
                    num_match = re.match(r'^(\d+)\.\s+(.+)$', line)
                    if num_match:
                        if not in_list:
                            formatted_lines.append('<div class="data-list">')
                            in_list = True
                        num = num_match.group(1)
                        text = num_match.group(2)
                        # Try to parse species format
                        formatted_lines.append(f'''
                    <div class="data-item">
                        <div class="data-number">{num}</div>
                        <div class="data-content">{text}</div>
                    </div>''')
                    else:
                        if in_list:
                            formatted_lines.append('</div>')
                            in_list = False
                        formatted_lines.append(f'<p>{line}</p>')
                
                if in_list:
                    formatted_lines.append('</div>')
                
                html_content += '\n'.join(formatted_lines)
            
            # Key findings with improved styling
            if section.key_findings:
                html_content += """
                    <div class="findings-container">
                        <div class="findings-title">🔑 Key Findings</div>
                        <ul class="findings-list">
"""
                for finding in section.key_findings:
                    html_content += f"                            <li>{finding}</li>\n"
                html_content += """                        </ul>
                    </div>
"""
            
            # Bullet points
            if section.bullet_points:
                html_content += """                    <ul class="bullet-list">\n"""
                for bp in section.bullet_points:
                    html_content += f"                        <li>{bp}</li>\n"
                html_content += """                    </ul>\n"""
            
            # Charts
            for chart_config in section.charts:
                chart_base64 = self.create_chart(chart_config)
                if chart_base64:
                    html_content += f"""
                    <div class="chart-container">
                        <img src="data:image/png;base64,{chart_base64}" alt="{chart_config.title}">
                    </div>
"""
            
            # Tables with improved styling
            for table_config in section.tables:
                html_content += f"""
                    <div class="table-container">
                        <div class="table-title">{table_config.title}</div>
                        <table>
                            <thead>
                                <tr>
"""
                for header in table_config.headers:
                    html_content += f"                                    <th>{header}</th>\n"
                html_content += """                                </tr>
                            </thead>
                            <tbody>
"""
                for row in table_config.rows:
                    html_content += "                                <tr>\n"
                    for cell in row:
                        html_content += f"                                    <td>{cell}</td>\n"
                    html_content += "                                </tr>\n"
                html_content += """                            </tbody>
                        </table>
                    </div>
"""
            
            html_content += """                </div>
            </div>
"""
        
        html_content += """        </div>  <!-- end content-grid -->
"""
        
        # Footer
        html_content += f"""
    </main>
    
    <footer class="footer">
        <div class="footer-brand">
            <div class="footer-logo"></div>
            <span>CMLRE Marine Data Platform</span>
        </div>
        <p>Generated on {metadata.date} | Report ID: {datetime.now().strftime('%Y%m%d%H%M%S')}</p>
        <p>&copy; {datetime.now().year} {metadata.organization}. All rights reserved.</p>
    </footer>
</body>
</html>
"""
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        logger.info(f"HTML report generated: {filepath}")
        return filepath
    
    def generate_markdown(
        self,
        metadata: ReportMetadata,
        sections: List[ReportSection],
        filename: Optional[str] = None
    ) -> str:
        """Generate a Markdown report."""
        filename = filename or f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        filepath = os.path.join(self.output_dir, filename)
        
        md_content = f"""# {metadata.title}

**Organization:** {metadata.organization}  
**Author:** {metadata.author}  
**Date:** {metadata.date}  
**Version:** {metadata.version}

---

"""
        
        if metadata.abstract:
            md_content += f"""## Abstract

{metadata.abstract}

---

"""
        
        # Table of Contents
        md_content += "## Table of Contents\n\n"
        for i, section in enumerate(sections, 1):
            anchor = section.title.lower().replace(' ', '-')
            md_content += f"{i}. [{section.title}](#{anchor})\n"
        md_content += "\n---\n\n"
        
        # Sections
        for section in sections:
            heading = '#' * (section.level + 1)
            md_content += f"{heading} {section.title}\n\n"
            
            if section.content:
                md_content += f"{section.content}\n\n"
            
            if section.key_findings:
                md_content += "### Key Findings\n\n"
                for finding in section.key_findings:
                    md_content += f"- ✓ {finding}\n"
                md_content += "\n"
            
            if section.bullet_points:
                for bp in section.bullet_points:
                    md_content += f"- {bp}\n"
                md_content += "\n"
            
            # Tables
            for table_config in section.tables:
                md_content += f"### {table_config.title}\n\n"
                md_content += "| " + " | ".join(table_config.headers) + " |\n"
                md_content += "| " + " | ".join(['---'] * len(table_config.headers)) + " |\n"
                for row in table_config.rows:
                    md_content += "| " + " | ".join(str(cell) for cell in row) + " |\n"
                md_content += "\n"
            
            md_content += "---\n\n"
        
        # Footer
        md_content += f"""
---

*Generated by CMLRE Marine Data Platform*  
*© {datetime.now().year} {metadata.organization}*
"""
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(md_content)
        
        logger.info(f"Markdown report generated: {filepath}")
        return filepath
    
    def generate_json(
        self,
        metadata: ReportMetadata,
        sections: List[ReportSection],
        filename: Optional[str] = None
    ) -> str:
        """Generate a JSON report for programmatic access."""
        filename = filename or f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = os.path.join(self.output_dir, filename)
        
        report_data = {
            'metadata': {
                'title': metadata.title,
                'author': metadata.author,
                'organization': metadata.organization,
                'date': metadata.date,
                'version': metadata.version,
                'report_type': metadata.report_type,
                'keywords': metadata.keywords,
                'abstract': metadata.abstract
            },
            'sections': []
        }
        
        for section in sections:
            section_data = {
                'title': section.title,
                'level': section.level,
                'content': section.content,
                'key_findings': section.key_findings,
                'bullet_points': section.bullet_points,
                'tables': [
                    {
                        'title': t.title,
                        'headers': t.headers,
                        'rows': t.rows
                    }
                    for t in section.tables
                ],
                'charts': [
                    {
                        'type': c.chart_type,
                        'title': c.title,
                        'data': c.data
                    }
                    for c in section.charts
                ]
            }
            report_data['sections'].append(section_data)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, default=str)
        
        logger.info(f"JSON report generated: {filepath}")
        return filepath
    
    def generate_report(
        self,
        metadata: ReportMetadata,
        sections: List[ReportSection],
        format: ReportFormat = ReportFormat.HTML,
        filename: Optional[str] = None
    ) -> str:
        """
        Generate a report in the specified format.
        
        Args:
            metadata: Report metadata
            sections: List of report sections
            format: Output format
            filename: Optional filename
            
        Returns:
            Path to generated report
        """
        if format == ReportFormat.PDF:
            return self.generate_pdf(metadata, sections, filename)
        elif format == ReportFormat.HTML:
            return self.generate_html(metadata, sections, filename)
        elif format == ReportFormat.MARKDOWN:
            return self.generate_markdown(metadata, sections, filename)
        elif format == ReportFormat.JSON:
            return self.generate_json(metadata, sections, filename)
        else:
            raise ValueError(f"Unsupported format: {format}")


# Convenience functions for common report types
def create_species_report(
    species_data: Dict[str, Any],
    output_dir: str = "./reports"
) -> str:
    """Create a species analysis report."""
    generator = ReportGenerator(output_dir)
    
    metadata = ReportMetadata(
        title=f"Species Analysis Report: {species_data.get('name', 'Unknown')}",
        report_type=ReportType.SPECIES_ANALYSIS.value,
        abstract=f"Comprehensive analysis of {species_data.get('name', 'the species')} "
                f"including distribution, environmental preferences, and population metrics."
    )
    
    sections = [
        ReportSection(
            title="Species Overview",
            content=f"Analysis of {species_data.get('name', 'Unknown')} "
                   f"({species_data.get('common_name', '')}).",
            key_findings=[
                f"Total observations: {species_data.get('observations', 0)}",
                f"Distribution range: {species_data.get('range', 'Unknown')}",
            ]
        ),
        ReportSection(
            title="Distribution",
            charts=[
                ChartConfig(
                    chart_type='bar',
                    title='Observations by Region',
                    data=species_data.get('regional_distribution', {'Region A': 10, 'Region B': 20}),
                    x_label='Region',
                    y_label='Count'
                )
            ]
        )
    ]
    
    return generator.generate_report(metadata, sections, ReportFormat.HTML)


def create_biodiversity_report(
    biodiversity_data: Dict[str, Any],
    output_dir: str = "./reports"
) -> str:
    """Create a biodiversity analysis report."""
    generator = ReportGenerator(output_dir)
    
    metadata = ReportMetadata(
        title="Biodiversity Analysis Report",
        report_type=ReportType.BIODIVERSITY.value,
        abstract="Analysis of species diversity indices and community structure."
    )
    
    sections = [
        ReportSection(
            title="Diversity Indices",
            content="Summary of calculated biodiversity metrics.",
            key_findings=[
                f"Shannon Index: {biodiversity_data.get('shannon_index', 0):.3f}",
                f"Simpson Index: {biodiversity_data.get('simpson_index', 0):.3f}",
                f"Species Richness: {biodiversity_data.get('species_richness', 0)}",
            ],
            tables=[
                TableConfig(
                    title="Biodiversity Metrics Summary",
                    headers=["Metric", "Value", "Interpretation"],
                    rows=[
                        ["Shannon Index", f"{biodiversity_data.get('shannon_index', 0):.3f}", 
                         "High" if biodiversity_data.get('shannon_index', 0) > 2.5 else "Moderate"],
                        ["Simpson Index", f"{biodiversity_data.get('simpson_index', 0):.3f}",
                         "Diverse" if biodiversity_data.get('simpson_index', 0) > 0.7 else "Less diverse"],
                        ["Evenness", f"{biodiversity_data.get('evenness', 0):.3f}",
                         "Even" if biodiversity_data.get('evenness', 0) > 0.8 else "Uneven"],
                    ]
                )
            ]
        )
    ]
    
    return generator.generate_report(metadata, sections, ReportFormat.HTML)


# Example usage
if __name__ == "__main__":
    generator = ReportGenerator("./test_reports")
    
    # Create sample report
    metadata = ReportMetadata(
        title="Marine Biodiversity Survey Report",
        abstract="This report presents findings from the marine biodiversity survey "
                "conducted in the Arabian Sea during Q1 2024.",
        keywords=["marine", "biodiversity", "survey", "Arabian Sea"]
    )
    
    sections = [
        ReportSection(
            title="Executive Summary",
            content="The survey identified 156 species across 42 sampling stations. "
                   "Species diversity was highest in the continental shelf region.",
            key_findings=[
                "156 species identified from 42 stations",
                "Shannon diversity index: 3.2 (high diversity)",
                "5 species of conservation concern detected",
                "Water temperature ranged from 24°C to 29°C"
            ]
        ),
        ReportSection(
            title="Species Distribution",
            content="Analysis of species distribution across sampling regions.",
            charts=[
                ChartConfig(
                    chart_type='bar',
                    title='Species Count by Region',
                    data={
                        'Shelf': 85,
                        'Slope': 42,
                        'Deep': 18,
                        'Coastal': 65
                    },
                    x_label='Region',
                    y_label='Species Count'
                ),
                ChartConfig(
                    chart_type='pie',
                    title='Taxonomic Composition',
                    data={
                        'Fish': 45,
                        'Invertebrates': 30,
                        'Mammals': 5,
                        'Other': 20
                    }
                )
            ],
            tables=[
                TableConfig(
                    title="Top 5 Most Abundant Species",
                    headers=["Rank", "Species", "Count", "Region"],
                    rows=[
                        [1, "Sardinella longiceps", 1250, "Coastal"],
                        [2, "Rastrelliger kanagurta", 890, "Shelf"],
                        [3, "Decapterus russelli", 654, "Shelf"],
                        [4, "Thunnus albacares", 432, "Slope"],
                        [5, "Coryphaena hippurus", 321, "Deep"]
                    ]
                )
            ]
        ),
        ReportSection(
            title="Environmental Analysis",
            content="Correlation between species distribution and environmental factors.",
            bullet_points=[
                "Temperature showed strong correlation with species richness (r=0.72)",
                "Salinity remained stable across stations (34.5-35.5 PSU)",
                "Chlorophyll-a concentrations highest in coastal waters",
                "Dissolved oxygen levels adequate for marine life (>4 mg/L)"
            ]
        )
    ]
    
    # Generate reports in different formats
    html_path = generator.generate_html(metadata, sections, "test_report.html")
    md_path = generator.generate_markdown(metadata, sections, "test_report.md")
    json_path = generator.generate_json(metadata, sections, "test_report.json")
    
    print(f"HTML Report: {html_path}")
    print(f"Markdown Report: {md_path}")
    print(f"JSON Report: {json_path}")
    
    if REPORTLAB_AVAILABLE:
        pdf_path = generator.generate_pdf(metadata, sections, "test_report.pdf")
        print(f"PDF Report: {pdf_path}")
