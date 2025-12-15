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
        self.styles.add(ParagraphStyle(
            name='ReportTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            spaceAfter=20,
            textColor=colors.HexColor(self.COLORS['dark']),
            alignment=TA_CENTER
        ))
        
        self.styles.add(ParagraphStyle(
            name='SectionHeading',
            parent=self.styles['Heading2'],
            fontSize=16,
            spaceBefore=20,
            spaceAfter=10,
            textColor=colors.HexColor(self.COLORS['primary'])
        ))
        
        self.styles.add(ParagraphStyle(
            name='SubHeading',
            parent=self.styles['Heading3'],
            fontSize=12,
            spaceBefore=15,
            spaceAfter=8,
            textColor=colors.HexColor(self.COLORS['dark'])
        ))
        
        self.styles.add(ParagraphStyle(
            name='BodyText',
            parent=self.styles['Normal'],
            fontSize=10,
            leading=14,
            alignment=TA_JUSTIFY
        ))
        
        self.styles.add(ParagraphStyle(
            name='Finding',
            parent=self.styles['Normal'],
            fontSize=10,
            leading=14,
            leftIndent=20,
            bulletIndent=10,
            textColor=colors.HexColor(self.COLORS['text'])
        ))
    
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
        
        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50
        )
        
        story = []
        
        # Title Page
        story.append(Spacer(1, 2*inch))
        story.append(Paragraph(metadata.title, self.styles['ReportTitle']))
        story.append(Spacer(1, 0.5*inch))
        story.append(Paragraph(
            f"<b>{metadata.organization}</b>",
            ParagraphStyle('OrgName', parent=self.styles['Normal'], 
                          alignment=TA_CENTER, fontSize=12)
        ))
        story.append(Spacer(1, 0.25*inch))
        story.append(Paragraph(
            f"Report Date: {metadata.date}",
            ParagraphStyle('Date', parent=self.styles['Normal'], 
                          alignment=TA_CENTER, fontSize=10, textColor=colors.gray)
        ))
        story.append(Paragraph(
            f"Author: {metadata.author}",
            ParagraphStyle('Author', parent=self.styles['Normal'], 
                          alignment=TA_CENTER, fontSize=10, textColor=colors.gray)
        ))
        
        if metadata.abstract:
            story.append(Spacer(1, 0.5*inch))
            story.append(Paragraph("<b>Abstract</b>", self.styles['SubHeading']))
            story.append(Paragraph(metadata.abstract, self.styles['BodyText']))
        
        story.append(PageBreak())
        
        # Table of Contents (simplified)
        story.append(Paragraph("Table of Contents", self.styles['SectionHeading']))
        for i, section in enumerate(sections, 1):
            story.append(Paragraph(
                f"{i}. {section.title}",
                ParagraphStyle('TOCItem', parent=self.styles['Normal'], leftIndent=20)
            ))
        story.append(PageBreak())
        
        # Content Sections
        for section in sections:
            # Section heading
            if section.level == 1:
                story.append(Paragraph(section.title, self.styles['SectionHeading']))
            else:
                story.append(Paragraph(section.title, self.styles['SubHeading']))
            
            # Content text
            if section.content:
                story.append(Paragraph(section.content, self.styles['BodyText']))
                story.append(Spacer(1, 0.1*inch))
            
            # Key findings
            if section.key_findings:
                story.append(Paragraph("<b>Key Findings:</b>", self.styles['SubHeading']))
                for finding in section.key_findings:
                    story.append(Paragraph(f"• {finding}", self.styles['Finding']))
                story.append(Spacer(1, 0.1*inch))
            
            # Bullet points
            if section.bullet_points:
                items = [ListItem(Paragraph(bp, self.styles['BodyText'])) 
                        for bp in section.bullet_points]
                story.append(ListFlowable(items, bulletType='bullet'))
                story.append(Spacer(1, 0.1*inch))
            
            # Charts
            for chart_config in section.charts:
                chart_base64 = self.create_chart(chart_config)
                if chart_base64:
                    img_data = base64.b64decode(chart_base64)
                    img_buffer = BytesIO(img_data)
                    img = Image(img_buffer, width=chart_config.width*inch, 
                               height=chart_config.height*inch)
                    story.append(img)
                    story.append(Spacer(1, 0.2*inch))
            
            # Tables
            for table_config in section.tables:
                story.append(Paragraph(f"<b>{table_config.title}</b>", self.styles['SubHeading']))
                
                table_data = [table_config.headers] + table_config.rows
                
                col_widths = table_config.column_widths
                if not col_widths:
                    col_widths = [1.5*inch] * len(table_config.headers)
                
                table = Table(table_data, colWidths=col_widths)
                
                style = TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(self.COLORS['primary'])),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor(self.COLORS['light'])),
                    ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor(self.COLORS['text'])),
                    ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor(self.COLORS['muted'])),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ])
                
                # Alternate row colors
                for i in range(1, len(table_data)):
                    if i % 2 == 0:
                        style.add('BACKGROUND', (0, i), (-1, i), colors.white)
                
                table.setStyle(style)
                story.append(table)
                story.append(Spacer(1, 0.2*inch))
            
            story.append(Spacer(1, 0.3*inch))
        
        # Build PDF
        doc.build(story)
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
    <title>{metadata.title}</title>
    <style>
        :root {{
            --primary: {self.COLORS['primary']};
            --secondary: {self.COLORS['secondary']};
            --accent: {self.COLORS['accent']};
            --dark: {self.COLORS['dark']};
            --light: {self.COLORS['light']};
            --text: {self.COLORS['text']};
            --muted: {self.COLORS['muted']};
        }}
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: var(--text);
            background: linear-gradient(135deg, var(--light) 0%, #ffffff 100%);
            min-height: 100vh;
        }}
        
        .container {{
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
        }}
        
        .report-header {{
            text-align: center;
            padding: 60px 20px;
            background: linear-gradient(135deg, var(--dark) 0%, var(--primary) 100%);
            color: white;
            border-radius: 12px;
            margin-bottom: 40px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        }}
        
        .report-header h1 {{
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }}
        
        .report-header .meta {{
            opacity: 0.9;
            font-size: 0.95rem;
        }}
        
        .abstract {{
            background: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
            border-left: 4px solid var(--primary);
        }}
        
        .abstract h3 {{
            color: var(--primary);
            margin-bottom: 15px;
        }}
        
        .section {{
            background: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }}
        
        .section h2 {{
            color: var(--primary);
            font-size: 1.5rem;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid var(--light);
        }}
        
        .section h3 {{
            color: var(--dark);
            font-size: 1.2rem;
            margin: 20px 0 15px;
        }}
        
        .section p {{
            margin-bottom: 15px;
            text-align: justify;
        }}
        
        .key-findings {{
            background: var(--light);
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }}
        
        .key-findings h4 {{
            color: var(--primary);
            margin-bottom: 10px;
        }}
        
        .key-findings ul {{
            list-style: none;
        }}
        
        .key-findings li {{
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
        }}
        
        .key-findings li::before {{
            content: "✓";
            color: var(--secondary);
            font-weight: bold;
            position: absolute;
            left: 0;
        }}
        
        .chart-container {{
            text-align: center;
            margin: 25px 0;
        }}
        
        .chart-container img {{
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 0.9rem;
        }}
        
        th {{
            background: var(--primary);
            color: white;
            padding: 12px 15px;
            text-align: left;
            font-weight: 600;
        }}
        
        td {{
            padding: 12px 15px;
            border-bottom: 1px solid #e5e7eb;
        }}
        
        tr:nth-child(even) {{
            background: var(--light);
        }}
        
        tr:hover {{
            background: #e0f2fe;
        }}
        
        .bullet-list {{
            margin: 15px 0;
            padding-left: 20px;
        }}
        
        .bullet-list li {{
            margin-bottom: 8px;
        }}
        
        .footer {{
            text-align: center;
            padding: 30px;
            color: var(--muted);
            font-size: 0.85rem;
        }}
        
        @media print {{
            body {{
                background: white;
            }}
            .section {{
                box-shadow: none;
                border: 1px solid #e5e7eb;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="report-header">
            <h1>{metadata.title}</h1>
            <div class="meta">
                <p>{metadata.organization}</p>
                <p>Generated: {metadata.date} | Author: {metadata.author}</p>
            </div>
        </div>
"""
        
        # Abstract
        if metadata.abstract:
            html_content += f"""
        <div class="abstract">
            <h3>Abstract</h3>
            <p>{metadata.abstract}</p>
        </div>
"""
        
        # Sections
        for section in sections:
            heading_tag = 'h2' if section.level == 1 else 'h3'
            
            html_content += f"""
        <div class="section">
            <{heading_tag}>{section.title}</{heading_tag}>
"""
            
            if section.content:
                html_content += f"            <p>{section.content}</p>\n"
            
            # Key findings
            if section.key_findings:
                html_content += """
            <div class="key-findings">
                <h4>Key Findings</h4>
                <ul>
"""
                for finding in section.key_findings:
                    html_content += f"                    <li>{finding}</li>\n"
                html_content += """
                </ul>
            </div>
"""
            
            # Bullet points
            if section.bullet_points:
                html_content += """            <ul class="bullet-list">\n"""
                for bp in section.bullet_points:
                    html_content += f"                <li>{bp}</li>\n"
                html_content += """            </ul>\n"""
            
            # Charts
            for chart_config in section.charts:
                chart_base64 = self.create_chart(chart_config)
                if chart_base64:
                    html_content += f"""
            <div class="chart-container">
                <img src="data:image/png;base64,{chart_base64}" alt="{chart_config.title}">
            </div>
"""
            
            # Tables
            for table_config in section.tables:
                html_content += f"""
            <h4>{table_config.title}</h4>
            <table>
                <thead>
                    <tr>
"""
                for header in table_config.headers:
                    html_content += f"                        <th>{header}</th>\n"
                html_content += """                    </tr>
                </thead>
                <tbody>
"""
                for row in table_config.rows:
                    html_content += "                    <tr>\n"
                    for cell in row:
                        html_content += f"                        <td>{cell}</td>\n"
                    html_content += "                    </tr>\n"
                html_content += """                </tbody>
            </table>
"""
            
            html_content += """        </div>
"""
        
        # Footer
        html_content += f"""
        <div class="footer">
            <p>Generated by CMLRE Marine Data Platform</p>
            <p>© {datetime.now().year} {metadata.organization}</p>
        </div>
    </div>
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
