"""
LLM Chat Service Module

Provides intelligent chat capabilities using Ollama (local, free).
Specialized for marine research domain with context-aware responses.
"""

import os
import json
import httpx
import logging
import asyncio
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from chat.search_service import SearchService

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Try to find .env in parent directories
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()  # Try default locations
except ImportError:
    pass  # dotenv not installed, use existing env vars

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
    provider: str = "ollama"  # Ollama Only (Privacy First)
    model: str = "llama3.2:1b"  # Default Ollama model
    temperature: float = 0.7
    max_tokens: int = 2048
    ollama_url: str = "http://localhost:11434"


# Marine research system prompt - Balanced version for accuracy + helpfulness
MARINE_SYSTEM_PROMPT = """You are a helpful AI assistant for the CMLRE Marine Data Platform.

GUIDELINES:
1. Use the DATABASE CONTEXT provided below as your primary source of information.
2. When users ask about species, oceanography, or marine data - use the database context to answer.
3. You can list all species from the database when asked.
4. For questions that require external/internet information (news, trends, recent research), use the web search context if provided.
5. Be helpful, informative, and accurate.

You specialize in:
- Marine Biology: Species info, taxonomy, ecology
- Oceanography: Temperature, salinity, depth data
- Conservation: Species status, habitat info
- Research: eDNA analysis, otolith studies

When asked to list species, generate reports, or summarize data - use the information from the === LIVE DATABASE === sections below.

You have access to a marine database with species records, oceanographic data, eDNA samples, and otolith images."""


async def get_dynamic_system_prompt(message: str = "", request_id: Optional[str] = None) -> str:
    """Get system prompt with REAL database context from MongoDB Atlas AND PostgreSQL."""
    
    # Fast path: skip DB calls if configured (for debugging/performance)
    if os.getenv("SKIP_DB_CONTEXT", "").lower() in ("1", "true", "yes"):
        logger.info("Skipping DB context (SKIP_DB_CONTEXT=true)")
        return MARINE_SYSTEM_PROMPT + "\n\nNote: Database context not loaded (fast mode)."
    
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
            db_context = f"\n\n=== LIVE DATABASE SPECIES (EXACTLY {count} species from MongoDB Atlas + FishBase enrichment) ===\n"
            
            # Try to enrich with FishBase data
            fishbase_data = {}
            try:
                from database.fishbase_service import get_fishbase_service
                import asyncio
                
                # Get all scientific names
                all_sci_names = [sp.get('scientificName', '') for sp in species_list if sp.get('scientificName')]
                
                # Filter for ON-DEMAND enrichment (Scalability)
                target_species = []
                message_lower = message.lower() if message else ""
                
                # Check for detailed queries that need FishBase enrichment
                # Simple "list all species" queries don't need FishBase - only detailed ones do
                fishbase_limit = os.getenv("FISHBASE_LIMIT", "")  # Empty = no limit
                
                # Keywords that indicate user wants DETAILED FishBase data (not just listing)
                detail_keywords = ["habitat", "diet", "color", "depth", "size", "length", 
                                   "details", "information", "info about", "tell me about",
                                   "what is", "describe", "characteristics"]
                needs_fishbase = any(k in message_lower for k in detail_keywords)
                
                if needs_fishbase and any(k in message_lower for k in ["list all", "all species", "entire database"]):
                    if fishbase_limit and fishbase_limit.isdigit():
                        target_species = all_sci_names[:int(fishbase_limit)]
                        logger.info(f"FishBase enrichment limited to {fishbase_limit} species (FISHBASE_LIMIT env)")
                    else:
                        target_species = all_sci_names  # No limit - enrich ALL species
                        logger.info(f"FishBase enrichment for ALL {len(all_sci_names)} species (detailed query)")
                elif not needs_fishbase and any(k in message_lower for k in ["list all", "all species", "entire database"]):
                    # Simple listing - no FishBase needed
                    logger.info("Simple species listing query - skipping FishBase enrichment")
                else:
                    # Only enrich species mentioned in the query
                    for name in all_sci_names:
                        # Check scientific match
                        if name.lower() in message_lower:
                            target_species.append(name)
                            continue
                        
                        # Check common name match
                        sp_obj = next((s for s in species_list if s.get('scientificName') == name), None)
                        if sp_obj:
                            common = sp_obj.get('commonName', '').lower()
                            if common and common in message_lower:
                                target_species.append(name)
                
                logger.info(f"Identified relevant species for enrichment: {target_species}")

                # Run async FishBase enrichment - now works properly since function is async
                if target_species:
                    try:
                        service = get_fishbase_service()
                        fishbase_data = await service.enrich_species_list(target_species, request_id=request_id)
                        logger.info(f"FishBase enriched {len(fishbase_data)} species")
                    except Exception as e:
                        logger.warning(f"FishBase enrichment failed: {e}")
                else:
                    logger.info("No target species for FishBase enrichment")
            except ImportError as e:
                logger.warning(f"FishBase service not available: {e}")
            
            for sp in sorted(species_list, key=lambda x: x.get('scientificName', '')):
                sci = sp.get('scientificName', 'Unknown')
                common = sp.get('commonName', '')
                
                # Get FishBase enriched data if available
                fb = fishbase_data.get(sci, {})
                
                # Use FishBase data if available, otherwise fall back to database
                habitat = fb.get('habitat') or sp.get('habitat', 'Unknown habitat')
                color = fb.get('color', 'Color unknown')
                depth_min = fb.get('depth_min', '')
                depth_max = fb.get('depth_max', '')
                depth_str = f"{depth_min}-{depth_max}m" if depth_min or depth_max else "Depth unknown"
                diet = fb.get('diet') or fb.get('feeding_type') or sp.get('diet', 'Diet unknown')
                max_length = fb.get('max_length', '')
                status = fb.get('iucn_status') or sp.get('conservationStatus', 'Status unknown')
                
                db_context += f"- {sci} ({common})\n"
                db_context += f"   Habitat: {habitat} | Depth: {depth_str} | Color: {color}\n"
                db_context += f"   Diet: {diet} | Max Length: {max_length}cm | IUCN: {status}\n"
            
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
        
        # Initialize Search Service
        self.search_service = SearchService()
        
        # Hard check: If explicitly set to base "llama3.2" but that's not installed/working,
        # fallback to the specialized 1b version we know is installed
        if self.config.model == "llama3.2":
            logger.info("Model 'llama3.2' detected, forcing 'llama3.2:1b' for compatibility")
            self.config.model = "llama3.2:1b"
        
        # Determine best available provider
        self._active_provider = self._detect_provider()
        logger.info(f"LLM Service initialized with provider: {self._active_provider.value}, model: {self.config.model}")
    
    def _detect_provider(self) -> LLMProvider:
        """Detect available provider (Ollama Only - Privacy First)."""
        try:
            import httpx
            with httpx.Client(timeout=2.0) as client:
                response = client.get(f"{self.config.ollama_url}/api/tags")
                if response.status_code == 200:
                    logger.info("Ollama detected and active.")
                    return LLMProvider.OLLAMA
        except Exception as e:
            logger.warning(f"Ollama not reachable: {e}")
        
        # Fallback
        return LLMProvider.FALLBACK
    
    async def _check_ollama_availability(self) -> bool:
        """Check if Ollama is available for fallback."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.config.ollama_url}/api/tags")
                return response.status_code == 200
        except:
            return False
    
    async def chat(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[ChatMessage]] = None,
        request_id: Optional[str] = None  # For progress tracking
    ) -> Dict[str, Any]:
        """
        Process a chat message with Privacy-First logic and Redis caching.
        
        Flow:
        1. Check cache for existing response
        2. Detect Internet Search Intent -> Fetch Tavily results (cached)
        3. Execute Chat via Ollama (Local)
        4. Store response in cache
        """
        import hashlib
        
        # Generate cache key (based on message only, not context for simplicity)
        message_hash = hashlib.md5(message.lower().strip().encode()).hexdigest()[:16]
        cache_key = f"chat_response:{message_hash}"
        
        # 1. Check cache first
        try:
            from utils.redis_cache import cache_get, cache_set
            cached = cache_get(cache_key)
            if cached:
                logger.info(f"CHAT CACHE HIT for: '{message[:40]}...'")
                return cached
        except Exception as e:
            logger.debug(f"Cache check failed: {e}")
        
        # 2. Internet Search Integration (also cached in SearchService)
        search_context = ""
        if self.search_service.is_search_query(message):
            search_context = self.search_service.search_web(message)
            logger.info("Injected Web Search Context")

        # 3. Build Context
        full_message = message
        if search_context:
            full_message = f"{message}\n\n{search_context}"

        enhanced_message = self._enhance_with_context(full_message, context)
        response_text = ""

        try:
            # 4. Execution (Ollama Only)
            if self._active_provider == LLMProvider.OLLAMA:
                logger.info("Executing via Ollama")
                skip_db = bool(search_context)
                response_text = await self._chat_ollama(enhanced_message, conversation_history, skip_db_context=skip_db, request_id=request_id)
            else:
                logger.warning("Ollama not available. Using static fallback.")
                response_text = self._generate_fallback_response(message, context)

            result = {
                "response": response_text,
                "confidence": 0.95 if self._active_provider == LLMProvider.OLLAMA else 0.5,
                "provider": self._active_provider.value,
                "model": self.config.model
            }
            
            # 5. Store in cache (10 minute TTL)
            try:
                cache_set(cache_key, result, ttl_seconds=600)
                logger.info(f"Chat response cached (TTL: 600s)")
            except Exception as e:
                logger.debug(f"Cache store failed: {e}")
            
            return result
            
        except Exception as e:
            import traceback
            logger.error(f"Chat error: {str(e)}\n{traceback.format_exc()}")
            
            return {
                "response": self._generate_fallback_response(message, context),
                "confidence": 0.0,
                "provider": "fallback",
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
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None  # For progress tracking
    ) -> str:
        """Chat using Ollama local LLM."""
        # Skip heavy DB context loading if search results are already in message
        if skip_db_context:
            system_prompt = MARINE_SYSTEM_PROMPT + "\n\n(Using web search results instead of database context)"
            logger.info("Skipping DB context (search-mode)")
        else:
            system_prompt = await get_dynamic_system_prompt(message, request_id=request_id)
        messages = [{"role": "system", "content": system_prompt}]
        
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
            content = result.get("message", {}).get("content", "I apologize, I couldn't generate a response.")
            logger.info(f"Ollama Raw Response: {content[:200]}...")  # Debug log
            return content
    
    async def _chat_ollama_stream(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None
    ):
        """
        Chat using Ollama with STREAMING output (yields tokens as they're generated).
        
        Yields:
            str: Chunks of text as they're generated by the LLM
        """
        # Skip heavy DB context loading if search results are already in message
        if skip_db_context:
            system_prompt = MARINE_SYSTEM_PROMPT + "\n\n(Using web search results instead of database context)"
            logger.info("Skipping DB context (search-mode)")
        else:
            system_prompt = await get_dynamic_system_prompt(message, request_id=request_id)
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history
        if history:
            for msg in history[-10:]:
                messages.append({"role": msg.role, "content": msg.content})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                f"{self.config.ollama_url}/api/chat",
                json={
                    "model": self.config.model,
                    "messages": messages,
                    "stream": True,  # Enable streaming
                    "options": {
                        "temperature": self.config.temperature,
                        "num_predict": self.config.max_tokens
                    }
                }
            ) as response:
                if response.status_code != 200:
                    raise Exception(f"Ollama streaming error: {response.status_code}")
                
                async for line in response.aiter_lines():
                    if line:
                        try:
                            import json
                            data = json.loads(line)
                            content = data.get("message", {}).get("content", "")
                            if content:
                                yield content
                            if data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
    
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

Tip: Try asking about specific species like "Tell me about yellowfin tuna" or "List species in the database"."""
    
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
