"""
LLM Chat Service Module

Provides intelligent chat capabilities using Ollama (local, free).
Specialized for marine research domain with context-aware responses.
"""

import os
import json
import httpx
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class LLMProvider(Enum):
    """Available LLM providers"""
    OLLAMA = "ollama"
    FALLBACK = "fallback"


@dataclass
class ChatMessage:
    """A chat message"""
    role: str  # system, user, assistant
    content: str


@dataclass
class ChatConfig:
    """Configuration for LLM chat"""
    provider: LLMProvider = LLMProvider.OLLAMA
    model: str = "llama3.2:1b"  # Default Ollama model (use the 1b version for speed)
    temperature: float = 0.7
    max_tokens: int = 2048
    ollama_url: str = "http://localhost:11434"


# Marine research system prompt
MARINE_SYSTEM_PROMPT = """You are a friendly AI assistant for the CMLRE (Centre for Marine Living Resources & Ecology) Marine Data Platform.

IMPORTANT: 
- For casual greetings like "hi", "hello", "hey" - respond naturally and warmly, then briefly mention how you can help with marine research.
- Do NOT try to interpret greetings as marine data queries.
- Be conversational and helpful, not robotic.

You specialize in:
1. Marine Biology: Fish species, taxonomy, life cycles, ecology
2. Oceanography: Temperature, salinity, currents, depth
3. eDNA Analysis: Environmental DNA, metabarcoding, species detection
4. Otolith Analysis: Fish age determination, growth patterns
5. Biodiversity: Shannon/Simpson indices, conservation status
6. Species Distribution: Niche modeling, habitat suitability

When answering:
- For greetings: Be friendly first, then offer to help
- For questions: Be accurate, concise, and helpful
- Suggest relevant platform features when appropriate

You have access to a marine database with species records, oceanographic data, eDNA samples, and otolith images."""


def get_dynamic_system_prompt() -> str:
    """Get system prompt with REAL database context from MongoDB Atlas AND PostgreSQL."""
    db_context = ""
    
    try:
        # Import database connector
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from database import get_all_species, get_species_analytics, get_oceanographic_summary
        
        # ============================================
        # MongoDB Atlas - Species Data
        # ============================================
        species_list = get_all_species()
        
        if species_list:
            count = len(species_list)
            db_context = f"\n\n=== LIVE DATABASE SPECIES (EXACTLY {count} species from MongoDB Atlas) ===\n"
            for sp in sorted(species_list, key=lambda x: x.get('scientificName', '')):
                sci = sp.get('scientificName', 'Unknown')
                common = sp.get('commonName', '')
                habitat = sp.get('habitat', '')
                status = sp.get('conservationStatus', '')
                db_context += f"- {sci} | {common} | Habitat: {habitat} | Status: {status}\n"
            
            # Get analytics for complex questions
            analytics = get_species_analytics()
            
            db_context += f"\n=== ANALYTICS DATA ===\n"
            
            if analytics.get('habitat_distribution'):
                db_context += "Habitat Distribution:\n"
                for h, c in sorted(analytics['habitat_distribution'].items(), key=lambda x: -x[1]):
                    db_context += f"  - {h}: {c} species\n"
            
            if analytics.get('depth_zones'):
                db_context += "\nDepth Zones:\n"
                for z, c in sorted(analytics['depth_zones'].items(), key=lambda x: -x[1]):
                    db_context += f"  - {z}: {c} species\n"
            
            if analytics.get('geographic_distribution'):
                db_context += "\nGeographic Distribution:\n"
                for r, c in sorted(analytics['geographic_distribution'].items(), key=lambda x: -x[1]):
                    db_context += f"  - {r}: {c} species\n"
            
            if analytics.get('insights'):
                db_context += "\nKey Insights:\n"
                for insight in analytics['insights']:
                    db_context += f"  • {insight}\n"
        
        # ============================================
        # PostgreSQL - Oceanographic Data
        # ============================================
        try:
            ocean_summary = get_oceanographic_summary()
            
            if ocean_summary.get('connected'):
                db_context += f"\n=== OCEANOGRAPHIC DATA (PostgreSQL) ===\n"
                db_context += f"Total Records: {ocean_summary.get('record_count', 0)}\n"
                
                if ocean_summary.get('parameters'):
                    db_context += "Available Parameters:\n"
                    for param in ocean_summary['parameters'][:10]:  # Limit to 10
                        db_context += f"  - {param}\n"
                
                # Get additional oceanographic context if available
                try:
                    from database import get_oceanographic_stats
                    stats = get_oceanographic_stats()
                    if stats:
                        db_context += "\nOceanographic Statistics:\n"
                        if stats.get('temperature_range'):
                            db_context += f"  - Temperature: {stats['temperature_range']}\n"
                        if stats.get('salinity_range'):
                            db_context += f"  - Salinity: {stats['salinity_range']}\n"
                        if stats.get('depth_range'):
                            db_context += f"  - Depth: {stats['depth_range']}\n"
                        if stats.get('locations'):
                            db_context += f"  - Locations: {len(stats['locations'])} sampling stations\n"
                except:
                    pass  # Optional stats function
            else:
                db_context += "\n=== OCEANOGRAPHIC DATA ===\nPostgreSQL: Not connected\n"
        except Exception as e:
            db_context += f"\n=== OCEANOGRAPHIC DATA ===\nPostgreSQL: Error - {str(e)[:50]}\n"
        
        # ============================================
        # Query Rules for LLM
        # ============================================
        db_context += f"\n=== QUERY RULES ===\n"
        if species_list:
            db_context += f"1. Our SPECIES database has EXACTLY {len(species_list)} species (MongoDB Atlas).\n"
        db_context += f"2. For 'starting with X' questions, check SCIENTIFIC NAME first letter.\n"
        db_context += f"3. For depth questions, use the Depth Zones data above.\n"
        db_context += f"4. For region questions, use Geographic Distribution data.\n"
        db_context += f"5. For temperature/salinity/oceanographic questions, use PostgreSQL data.\n"
        db_context += f"6. Give EXACT numbers from the data - don't estimate.\n"
            
    except Exception as e:
        # Fallback to static file
        import json
        from pathlib import Path
        possible_paths = [
            Path(__file__).parent.parent.parent / "database" / "seeds" / "species.json",
        ]
        for db_path in possible_paths:
            if db_path.exists():
                try:
                    with open(db_path, 'r') as f:
                        data = json.load(f)
                    unique = {sp.get('scientificName'): sp.get('commonName') for sp in data if sp.get('scientificName')}
                    db_context = f"\n\nDatabase contains {len(unique)} species (from backup file).\n"
                    break
                except:
                    pass
    
    return MARINE_SYSTEM_PROMPT + db_context


class LLMService:
    """
    LLM Chat Service for marine research queries.
    
    Supports:
    - Ollama (local, free) - Primary
    - Smart fallback responses when Ollama not available
    """
    
    def __init__(self, config: Optional[ChatConfig] = None):
        """Initialize the LLM service."""
        self.config = config or ChatConfig()
        
        # Override from environment
        self.config.ollama_url = os.getenv("OLLAMA_URL", self.config.ollama_url)
        self.config.model = os.getenv("LLM_MODEL", self.config.model)
        
        # Hard check: If explicitly set to base "llama3.2" but that's not installed/working,
        # fallback to the specialized 1b version we know is installed
        if self.config.model == "llama3.2":
            logger.info("Model 'llama3.2' detected, forcing 'llama3.2:1b' for compatibility")
            self.config.model = "llama3.2:1b"
        
        # Determine best available provider
        self._active_provider = self._detect_provider()
        logger.info(f"LLM Service initialized with provider: {self._active_provider.value}, model: {self.config.model}")
    
    def _detect_provider(self) -> LLMProvider:
        """Detect which LLM provider is available."""
        # Try Ollama first (preferred - free & local)
        try:
            import httpx
            response = httpx.get(f"{self.config.ollama_url}/api/tags", timeout=2.0)
            if response.status_code == 200:
                logger.info("Ollama detected and available")
                return LLMProvider.OLLAMA
        except Exception as e:
            logger.debug(f"Ollama not available: {e}")
        
        # Fallback to smart responses
        logger.warning("Ollama not available, using smart fallback")
        return LLMProvider.FALLBACK
    
    async def chat(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[ChatMessage]] = None,
        allow_fallback: bool = True
    ) -> Dict[str, Any]:
        """
        Process a chat message and return a response.
        
        Args:
            message: User's message
            context: Optional context (current page, selected data, etc.)
            conversation_history: Previous messages in the conversation
            
        Returns:
            Dict with response, confidence, and metadata
        """
        # Build context-aware prompt
        enhanced_message = self._enhance_with_context(message, context)
        
        try:
            if self._active_provider == LLMProvider.OLLAMA:
                response = await self._chat_ollama(enhanced_message, conversation_history)
            else:
                if not allow_fallback:
                    raise Exception("LLM provider (Ollama) is unavailable and fallback is disabled.")
                response = self._generate_fallback_response(message, context)
            
            return {
                "response": response,
                "confidence": 0.95 if self._active_provider != LLMProvider.FALLBACK else 0.7,
                "provider": self._active_provider.value,
                "model": self.config.model if self._active_provider != LLMProvider.FALLBACK else "fallback"
            }
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"Chat error: {type(e).__name__}: {str(e)}")
            logger.error(f"Traceback: {error_details}")
            
            if not allow_fallback:
                raise e
                
            # Fall back to smart responses on error
            return {
                "response": self._generate_fallback_response(message, context),
                "confidence": 0.6,
                "provider": "fallback",
                "model": "fallback",
                "error": str(e)
            }
    
    def _enhance_with_context(self, message: str, context: Optional[Dict[str, Any]]) -> str:
        """Enhance the message with relevant context."""
        if not context:
            return message
        
        context_parts = []
        
        if context.get("current_page"):
            context_parts.append(f"User is currently on: {context['current_page']}")
        
        if context.get("selected_species"):
            context_parts.append(f"Selected species: {context['selected_species']}")
        
        if context.get("data_summary"):
            context_parts.append(f"Data context: {context['data_summary']}")
        
        if context.get("recent_analysis"):
            context_parts.append(f"Recent analysis: {context['recent_analysis']}")
        
        if context_parts:
            return f"[Context: {'; '.join(context_parts)}]\n\nQuestion: {message}"
        
        return message
    
    async def _chat_ollama(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None
    ) -> str:
        """Chat using Ollama local LLM."""
        # Use dynamic prompt with real database context
        messages = [{"role": "system", "content": get_dynamic_system_prompt()}]
        
        # Add conversation history
        if history:
            for msg in history[-10:]:  # Keep last 10 messages for context
                messages.append({"role": msg.role, "content": msg.content})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minute timeout for slower hardware
            response = await client.post(
                f"{self.config.ollama_url}/api/chat",
                json={
                    "model": self.config.model,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": self.config.temperature,
                        "num_predict": self.config.max_tokens
                    }
                }
            )
            
            if response.status_code != 200:
                raise Exception(f"Ollama error: {response.text}")
            
            result = response.json()
            return result.get("message", {}).get("content", "I apologize, I couldn't generate a response.")
    
    def _generate_fallback_response(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Generate intelligent fallback response based on keywords."""
        message_lower = message.lower()
        
        # Species-related queries
        if any(kw in message_lower for kw in ['species', 'fish', 'identify', 'what is', 'tell me about']):
            return self._species_response(message, context)
        
        # Oceanography queries
        if any(kw in message_lower for kw in ['temperature', 'salinity', 'ocean', 'water', 'depth', 'current']):
            return self._oceanography_response(message)
        
        # eDNA queries
        if any(kw in message_lower for kw in ['edna', 'dna', 'sequence', 'metabarcoding', 'detection']):
            return self._edna_response(message)
        
        # Otolith queries
        if any(kw in message_lower for kw in ['otolith', 'age', 'ring', 'growth', 'ear stone']):
            return self._otolith_response(message)
        
        # Analysis queries
        if any(kw in message_lower for kw in ['analyze', 'analysis', 'correlation', 'trend', 'pattern']):
            return self._analysis_response(message)
        
        # Biodiversity queries
        if any(kw in message_lower for kw in ['biodiversity', 'diversity', 'shannon', 'simpson', 'richness']):
            return self._biodiversity_response(message)
        
        # Distribution/habitat queries
        if any(kw in message_lower for kw in ['distribution', 'habitat', 'where', 'location', 'niche']):
            return self._distribution_response(message)
        
        # Help/how-to queries
        if any(kw in message_lower for kw in ['how to', 'help', 'guide', 'tutorial', 'explain']):
            return self._help_response(message)
        
        # Default response
        return self._default_response(message)
    
    def _species_response(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Generate species-related response."""
        if context and context.get("selected_species"):
            species = context["selected_species"]
            return f"""Based on the selected species **{species}**, I can help you with:

1. **Taxonomy & Classification**: View the full taxonomic hierarchy in the Species Explorer
2. **Distribution**: Check occurrence records and map visualization
3. **Conservation Status**: IUCN Red List status and population trends
4. **Related Analysis**: 
   - Otolith age estimation if samples are available
   - eDNA detection records
   - Environmental preferences via Niche Modeling

Would you like me to elaborate on any of these aspects?"""
        
        # Check for specific species questions
        message_lower = message.lower()
        
        # Common marine species knowledge base for fallback
        species_info = {
            "yellowfin tuna": {
                "scientific": "Thunnus albacares",
                "description": """**Yellowfin Tuna** (*Thunnus albacares*) is one of the largest tuna species.

🐟 **Key Facts:**
- **Size**: Can reach up to 2.4 meters (7.9 ft) and weigh up to 200 kg (440 lbs)
- **Lifespan**: 6-7 years
- **Habitat**: Tropical and subtropical oceans worldwide, typically in the upper 100m of water
- **Diet**: Fish, squid, and crustaceans

🌊 **Distribution**: Found throughout the Indian Ocean, Pacific Ocean, and Atlantic Ocean in tropical and temperate waters

🎣 **Commercial Importance**: One of the most commercially valuable fish species, used for sashimi, steaks, and canned tuna

📊 **Conservation Status**: Near Threatened (IUCN) - populations have declined due to overfishing

Would you like to explore yellowfin tuna observations in our database?"""
            },
            "bluefin tuna": {
                "scientific": "Thunnus thynnus",
                "description": """**Atlantic Bluefin Tuna** (*Thunnus thynnus*) is the largest tuna species.

🐟 **Key Facts:**
- **Size**: Can reach up to 3 meters (10 ft) and weigh up to 680 kg (1,500 lbs)
- **Lifespan**: Up to 40 years
- **Habitat**: North Atlantic Ocean and Mediterranean Sea
- **Diet**: Fish, squid, crustaceans

🌊 **Distribution**: Migrate extensively across the Atlantic Ocean

🎣 **Commercial Importance**: Extremely valuable for sushi/sashimi markets, fetching premium prices

📊 **Conservation Status**: Endangered (IUCN) - heavily overfished

Would you like to explore bluefin tuna data in our database?"""
            },
            "mahi mahi": {
                "scientific": "Coryphaena hippurus",
                "description": """**Mahi-mahi** (*Coryphaena hippurus*), also known as dolphinfish, is a vibrant, fast-growing fish.

🐟 **Key Facts:**
- **Size**: Up to 1.4 meters (4.6 ft) and 40 kg (88 lbs)
- **Lifespan**: 4-5 years
- **Habitat**: Warm tropical and subtropical waters worldwide
- **Diet**: Flying fish, crabs, squid, mackerel

🌊 **Distribution**: Found in the Atlantic, Indian, and Pacific oceans

🎣 **Characteristics**: Known for brilliant colors (golden sides, blue-green back) and high dorsal fin

📊 **Conservation Status**: Least Concern (IUCN)

Would you like to explore mahi-mahi observations in our database?"""
            },
            "swordfish": {
                "scientific": "Xiphias gladius",
                "description": """**Swordfish** (*Xiphias gladius*) is a large, highly migratory fish known for its elongated bill.

🐟 **Key Facts:**
- **Size**: Up to 4.5 meters (14.8 ft) and 650 kg (1,430 lbs)
- **Lifespan**: Up to 9 years
- **Habitat**: Tropical, temperate, and sometimes cold waters
- **Diet**: Fish, squid, crustaceans

🌊 **Distribution**: Worldwide in Atlantic, Pacific, and Indian Oceans

🎣 **Characteristics**: Uses bill to slash and stun prey, can dive to 550m depth

📊 **Conservation Status**: Least Concern (IUCN)

Would you like to explore swordfish data in our database?"""
            }
        }
        
        # Try to match species names
        for species_key, info in species_info.items():
            if species_key in message_lower:
                return info["description"]
        
        # Generic species response
        return """I can help you explore marine species in several ways:

🐟 **Species Explorer** - Browse our database of 1000+ marine species with:
- Scientific and common names
- Taxonomic classification
- Distribution maps
- Conservation status (IUCN)
- Images from iNaturalist

📸 **Fish Identifier** - Upload a photo to identify species using Fishial.AI

🧬 **eDNA Detection** - See which species have been detected via environmental DNA

To get started, navigate to **Species Explorer** in the sidebar, or upload a fish photo to **Fish Identifier**.

💡 **Tip**: You can ask me about specific species like "What is a yellowfin tuna?" or "Tell me about bluefin tuna" for detailed information."""
    
    def _oceanography_response(self, message: str) -> str:
        """Generate oceanography-related response."""
        return """I can help you explore oceanographic data:

🌊 **Available Parameters**:
- **Temperature**: Sea surface and water column temperature (°C)
- **Salinity**: Practical salinity units (PSU)
- **Chlorophyll-a**: Phytoplankton indicator (μg/L)
- **Dissolved Oxygen**: Critical for marine life (mg/L)
- **pH**: Ocean acidification monitoring
- **Currents**: Speed and direction

📊 **Analysis Options**:
1. **Time Series**: View parameter changes over time
2. **Spatial Mapping**: Visualize geographic distribution
3. **Correlation**: Find relationships between parameters
4. **Depth Profiles**: Analyze vertical structure

🔍 **How to Access**:
- Go to **Oceanography Viewer** for interactive maps
- Use **Analytics** for cross-parameter correlation
- Export data via the API for external analysis

What specific parameter or analysis interests you?"""
    
    def _edna_response(self, message: str) -> str:
        """Generate eDNA-related response."""
        return """I can help with environmental DNA (eDNA) analysis:

🧬 **eDNA Manager Features**:
1. **Sequence Upload**: Support for FASTA/FASTQ files
2. **Quality Control**: Automatic QC metrics (Q-score, GC content, length)
3. **Species Detection**: BLAST and metabarcoding analysis
4. **Biodiversity Metrics**: Shannon, Simpson indices, Chao1 estimator

📈 **Analysis Pipeline**:
- Upload sequences → Quality filtering → Taxonomy assignment → Species list

🔬 **Detection Methods**:
- **BLAST**: Search against NCBI nucleotide database
- **Metabarcoding**: Compare against curated reference databases

📊 **Outputs**:
- Species detection list with confidence scores
- Taxonomic breakdown (Kingdom → Species)
- Biodiversity summary statistics
- Exportable reports (CSV, JSON, PDF)

Navigate to **eDNA Manager** to start processing sequences."""
    
    def _otolith_response(self, message: str) -> str:
        """Generate otolith-related response."""
        return """I can help with otolith (fish ear stone) analysis:

🔬 **Otolith Analysis Features**:
1. **Image Upload**: Drag-and-drop otolith images
2. **Shape Analysis**: Morphometric measurements (length, width, area, circularity)
3. **Age Estimation**: Automated annuli (ring) counting
4. **Species Identification**: Compare shape features against database

📏 **Measurements Provided**:
- Length, width, area, perimeter
- Circularity and aspect ratio
- Fourier descriptors for shape matching

🎯 **Age Estimation Methods**:
- **Canny Edge Detection**: Standard ring detection
- **Adaptive Thresholding**: Enhanced contrast
- **Radial Profile Analysis**: Distance-based counting
- **Ensemble**: Combines all methods for best accuracy

💡 **Tips for Best Results**:
- Use high-resolution images (300+ DPI)
- Ensure good lighting and contrast
- Image the inner (sulcus) side for clearer rings

Go to **Otolith Analysis** to upload and analyze images."""
    
    def _analysis_response(self, message: str) -> str:
        """Generate analysis-related response."""
        return """I can help with data analysis:

📊 **Analytics Dashboard**:
- Real-time statistics across all datasets
- Data quality scores
- Recent activity timeline

🔗 **Correlation Analysis**:
Discover relationships between:
- Species distribution ↔ Environmental parameters
- Temperature ↔ Species abundance
- Depth ↔ Community composition

📈 **Available Analysis Types**:
1. **Temporal Trends**: How data changes over time
2. **Spatial Patterns**: Geographic clustering
3. **Cross-Domain**: Link species, oceanography, and eDNA

🗺️ **Niche Modeling**:
- Species Distribution Models (MaxEnt, BIOCLIM)
- Habitat suitability prediction
- Environmental variable importance

📝 **Report Generation**:
- Automated PDF/HTML reports
- Include charts, tables, and key findings
- Export biodiversity assessments

Visit **Analytics** for cross-domain analysis or **Niche Modeling** for SDM."""
    
    def _biodiversity_response(self, message: str) -> str:
        """Generate biodiversity-related response."""
        return """I can help with biodiversity assessment:

📊 **Diversity Indices Available**:

1. **Shannon Index (H')**: 
   - Measures species diversity
   - Higher values = more diverse
   - Typical range: 1.5-3.5 for marine communities

2. **Simpson Index (1-D)**:
   - Probability two individuals are different species
   - Range: 0-1 (higher = more diverse)

3. **Species Richness**: 
   - Simple count of species
   - Foundation for other metrics

4. **Evenness (Pielou's J)**:
   - How evenly distributed are abundances
   - Range: 0-1 (1 = perfectly even)

5. **Chao1 Estimator**:
   - Estimates total species including unseen
   - Accounts for rare species

🔬 **Where to Calculate**:
- **eDNA Manager**: Automatic biodiversity metrics from detections
- **Analytics**: Aggregated diversity across surveys
- **Report Generator**: Biodiversity report templates

Would you like details on interpreting specific indices?"""
    
    def _distribution_response(self, message: str) -> str:
        """Generate distribution/habitat response."""
        return """I can help with species distribution and habitat analysis:

🗺️ **Niche Modeling (SDM)**:
Species Distribution Models predict where species can live based on environmental preferences.

**Available Methods**:
1. **MaxEnt**: Maximum entropy - best for presence-only data
2. **BIOCLIM**: Climate envelope approach
3. **Gower Distance**: Similarity-based prediction

📊 **Required Data**:
- Species occurrence records (latitude, longitude)
- Environmental variables (temperature, depth, salinity)

📈 **Model Outputs**:
- Habitat suitability map
- Variable importance ranking
- Environmental preference profiles
- Predicted hotspots

🎯 **Use Cases**:
- Predict species range under climate change
- Identify potential survey sites
- Assess habitat connectivity
- Conservation priority areas

Navigate to **Niche Modeling** to build a species distribution model."""
    
    def _help_response(self, message: str) -> str:
        """Generate help/tutorial response."""
        return """Welcome to the CMLRE Marine Data Platform! Here's how to get started:

🚀 **Quick Start Guide**:

1. **Data Ingestion** - Upload your data:
   - Supported: CSV, JSON, Excel, FASTA/FASTQ
   - Auto-detection of data type
   - Background processing with progress tracking

2. **Species Explorer** - Browse marine species:
   - Search by scientific/common name
   - View taxonomy, distribution, images
   - Check conservation status

3. **Oceanography Viewer** - Visualize environmental data:
   - Interactive maps with PostGIS
   - Time-series analysis
   - Multiple parameter layers

4. **Otolith Analysis** - Analyze fish ear stones:
   - Upload images for age estimation
   - Automated ring counting
   - Shape-based species ID

5. **eDNA Manager** - Process genetic sequences:
   - Upload FASTA/FASTQ files
   - Species detection pipeline
   - Biodiversity metrics

6. **Analytics** - Cross-domain insights:
   - Correlation analysis
   - Trend visualization
   - Export reports

📚 **API Documentation**: Available at /api-docs

What would you like to explore first?"""
    
    def _default_response(self, message: str) -> str:
        """Generate default response when topic is unclear."""
        return f"""I'm here to help with marine research questions. Based on your message, I can assist with:

🐟 **Species Information**: Identification, taxonomy, conservation status
🌊 **Oceanography**: Temperature, salinity, and other parameters
🧬 **eDNA Analysis**: Sequence processing and species detection
🔬 **Otolith Analysis**: Age estimation and morphometrics
📊 **Data Analysis**: Correlations, trends, and biodiversity metrics
🗺️ **Species Distribution**: Niche modeling and habitat prediction

Could you provide more details about what you'd like to know? For example:
- "Tell me about Thunnus albacares"
- "How do I analyze eDNA sequences?"
- "What's the Shannon diversity index?"
- "How to estimate fish age from otoliths?"

I'm also available to help with navigating the platform features."""


# Global service instance
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """Get or create the LLM service instance."""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service


async def chat_with_llm(
    message: str,
    context: Optional[Dict[str, Any]] = None,
    history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """
    Convenience function for chatting with the LLM.
    
    Args:
        message: User message
        context: Optional context dictionary
        history: Optional conversation history
        
    Returns:
        Response dictionary
    """
    service = get_llm_service()
    
    # Convert history dict to ChatMessage objects
    chat_history = None
    if history:
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in history
        ]
    
    return await service.chat(message, context, chat_history)
