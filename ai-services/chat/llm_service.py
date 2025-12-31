# -*- coding: utf-8 -*-
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
    # Fix .env loading path - search in ai-services first
    ai_services_dir = Path(__file__).parent.parent
    env_path = ai_services_dir / ".env"
    
    if env_path.exists():
        load_dotenv(env_path)
        # print(f"Loaded .env from {env_path}")
    else:
        # Try root directory
        root_path = ai_services_dir.parent / ".env"
        if root_path.exists():
            load_dotenv(root_path)
        else:
            load_dotenv()  # Fallback to default
except ImportError:
    pass  # dotenv not installed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class LLMProvider(Enum):
    """Available LLM providers"""
    GROQ = "groq"      # Cloud API (fast, free tier, no local resources)
    OLLAMA = "ollama"  # Local (private, requires local install, context-injection)
    OLLAMA_AGENT = "ollama_agent" # Local (agentic, native tools, experimental)
    FALLBACK = "fallback"


@dataclass
class ChatMessage:
    """A chat message"""
    role: str  # system, user, assistant
    content: str


@dataclass
class ChatConfig:
    """Configuration for LLM chat"""
    provider: str = "auto"  # "auto", "groq", or "ollama"
    # Groq settings (cloud)
    groq_model: str = "llama-3.3-70b-versatile"  # High-performance Groq model
    groq_api_key: str = ""  # Will be loaded from env
    # Ollama settings (local)
    ollama_model: str = "llama3.2:1b"  # Default local Ollama model
    ollama_url: str = "http://localhost:11434"
    # Common settings
    temperature: float = 0.7
    max_tokens: int = 2048
    # Legacy compatibility
    model: str = "llama3.2:1b"  # Will be overwritten based on active provider



# Marine research system prompt - Balanced version for accuracy + helpfulness
MARINE_SYSTEM_PROMPT = (
    "You are a helpful AI assistant for the CMLRE Marine Data Platform.\n"
    "\n"
    "GUIDELINES:\n"
    "1. Use the DATABASE CONTEXT provided below as your primary source of information.\n"
    "2. When users ask about species, oceanography, or marine data - use the database context to answer.\n"
    "3. You can list all species from the database when asked.\n"
    "4. For questions that require external/internet information (news, trends, recent research), use the web search context if provided.\n"
    "5. Be helpful, informative, and accurate.\n"
    "\n"
    "You specialize in:\n"
    "- Marine Biology: Species info, taxonomy, ecology\n"
    "- Oceanography: Temperature, salinity, depth data\n"
    "- Conservation: Species status, habitat info\n"
    "- Research: eDNA analysis, otolith studies\n"
    "\n"
    "When asked to list species, generate reports, or summarize data - use the information from the === LIVE DATABASE === sections below.\n"
    "\n"
    "You have access to a marine database with species records, oceanographic data, eDNA samples, and otolith images.\n"
    "\n"
    "IMPORTANT: The local database context may have missing details (e.g., 'Unknown' habitat, diet, or depth).\n"
    "If you see 'Unknown' fields for a species, and you have the ability to use tools, you MUST use the `enrich_species_data` tool to fetch this missing information before answering. Do not simply report 'unknown' if the tool can retrieve it.\n"
)

# Tool Definitions
FISHBASE_TOOL_DEF = {
    "type": "function",
    "function": {
        "name": "enrich_species_data",
        "description": "MANDATORY: Use this tool whenever species data (Habitat, Diet, Max Length, Color, Depth) is missing ('unknown') in the context. Fetches detailed biological data from FishBase. Input is a list of scientific names.",
        "parameters": {
            "type": "object",
            "properties": {
                "scientific_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of scientific names to fetch data for (e.g. ['Thunnus albacares', 'Caranx ignobilis'])"
                }
            },
            "required": ["scientific_names"]
        }
    }
}

async def get_dynamic_system_prompt(message: str = "", request_id: Optional[str] = None, skip_enrichment: bool = False) -> str:
    # Get System Prompt
    
    # Fast path: skip DB calls if configured
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
            db_context = f"\n\n=== LIVE DATABASE SPECIES (EXACTLY {count} species from MongoDB Atlas) ===\n"
            
            # Legacy Rule-Based Enrichment (Only run if NOT skipping)
            fishbase_data = {}
            if not skip_enrichment:
                try:
                    from database.fishbase_service import get_fishbase_service
                    
                    # Get all scientific names
                    all_sci_names = [sp.get('scientificName', '') for sp in species_list if sp.get('scientificName')]
                    
                    # Filter for ON-DEMAND enrichment
                    target_species = []
                    message_lower = message.lower() if message else ""
                    
                    # Helper for legacy logic
                    is_list_query = any(k in message_lower for k in ["list all", "all species", "entire database"])
                    detail_keywords = ["habitat", "diet", "color", "depth", "size", "length", 
                                       "details", "information", "info about", "tell me about",
                                       "what is", "describe", "characteristics"]
                    needs_fishbase = any(k in message_lower for k in detail_keywords)
                    
                    # Auto-enrich for small datasets (< 20 species)
                    if is_list_query and len(species_list) <= 20:
                        needs_fishbase = True
                    
                    if needs_fishbase:
                        # Simple logic: if detailing, check limits
                        fishbase_limit = os.getenv("FISHBASE_LIMIT", "")
                        if fishbase_limit and fishbase_limit.isdigit():
                            target_species = all_sci_names[:int(fishbase_limit)]
                        else:
                            # If explicit detail requested or small DB, enrich all relevant or mentioned
                            if is_list_query:
                                target_species = all_sci_names
                            else:
                                # Match specific names
                                for name in all_sci_names:
                                    if name.lower() in message_lower:
                                        target_species.append(name)
                    
                    if target_species:
                        try:
                            service = get_fishbase_service()
                            fishbase_data = await service.enrich_species_list(target_species, request_id=request_id)
                            logger.info(f"Legacy Logic: FishBase enriched {len(fishbase_data)} species")
                        except Exception as e:
                            logger.warning(f"FishBase legacy enrichment failed: {e}")
                            
                except ImportError:
                    pass
            else:
                logger.info("Skipping legacy FishBase enrichment (Agentic Tools Active)")
            
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
    # LLM Service Class
    
    def __init__(self, config: Optional[ChatConfig] = None, preferred_provider: Optional[str] = None):
        # Init
        self.config = config or ChatConfig()
        
        # Override from environment
        self.config.ollama_url = os.getenv("OLLAMA_URL", self.config.ollama_url)
        self.config.groq_api_key = os.getenv("GROQ_API_KEY", self.config.groq_api_key)
        self.config.ollama_model = os.getenv("OLLAMA_MODEL", self.config.ollama_model)
        self.config.groq_model = os.getenv("GROQ_MODEL", self.config.groq_model)
        
        # Handle preferred provider override
        if preferred_provider:
            self.config.provider = preferred_provider
        
        # Initialize Search Service
        self.search_service = SearchService()
        
        # Legacy model compatibility
        if self.config.ollama_model == "llama3.2":
            self.config.ollama_model = "llama3.2:1b"
        
        # Determine best available provider
        self._active_provider = self._detect_provider()
        
        # Set active model based on provider
        if self._active_provider == LLMProvider.GROQ:
            self.config.model = self.config.groq_model
        else:
            self.config.model = self.config.ollama_model
            
        logger.info(f"LLM Service initialized with provider: {self._active_provider.value}, model: {self.config.model}")
    
    def _detect_provider(self) -> LLMProvider:
        # Detect Provider
        
        # If explicitly set to groq
        if self.config.provider == "groq":
            if self.config.groq_api_key:
                logger.info("Using Groq (explicitly requested)")
                return LLMProvider.GROQ
            else:
                logger.warning("Groq requested but no API key found. Falling back.")
        
        # If explicitly set to ollama
        elif self.config.provider == "ollama":
            if self._check_ollama_sync():
                logger.info("Using Ollama (explicitly requested)")
                return LLMProvider.OLLAMA
            else:
                logger.warning("Ollama requested but not available. Falling back.")

        # If explicitly set to ollama_agent
        elif self.config.provider == "ollama_agent":
            if self._check_ollama_sync():
                logger.info("Using Ollama Agent (explicitly requested)")
                return LLMProvider.OLLAMA_AGENT
            else:
                logger.warning("Ollama Agent requested but not available. Falling back.")
        
        # Auto-detect: Try Groq first (better for cloud), then Ollama
        elif self.config.provider == "auto":
            # Check Groq first (preferred for cloud hosting)
            if self.config.groq_api_key:
                logger.info("Auto-detect: Groq API key found, using Groq")
                return LLMProvider.GROQ
            
            # Then check Ollama
            if self._check_ollama_sync():
                logger.info("Auto-detect: Ollama available, using Ollama")
                return LLMProvider.OLLAMA
        
        # Fallback
        logger.warning("No LLM provider available. Using static fallback.")
        return LLMProvider.FALLBACK
    
    def _check_ollama_sync(self) -> bool:
        # Ollama Sync Check
        try:
            import httpx
            with httpx.Client(timeout=5.0) as client:
                response = client.get(f"{self.config.ollama_url}/api/tags")
                return response.status_code == 200
        except:
            return False
    
    async def _check_ollama_availability(self) -> bool:
        # Helper response
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.config.ollama_url}/api/tags")
                return response.status_code == 200
        except:
            return False
    
    def _check_groq_availability(self) -> bool:
        # Helper response
        return bool(self.config.groq_api_key)
    
    async def chat(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[ChatMessage]] = None,
        request_id: Optional[str] = None  # For progress tracking
    ) -> Dict[str, Any]:
        # Chat Method
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
            # 4. Execution based on provider
            skip_db = bool(search_context)
            
            if self._active_provider == LLMProvider.GROQ:
                logger.info("Executing via Groq Cloud API")
                response_text = await self._chat_groq(enhanced_message, conversation_history, skip_db_context=skip_db, request_id=request_id)
            elif self._active_provider == LLMProvider.OLLAMA:
                logger.info("Executing via Ollama")
                response_text = await self._chat_ollama(enhanced_message, conversation_history, skip_db_context=skip_db, request_id=request_id)
            elif self._active_provider == LLMProvider.OLLAMA_AGENT:
                logger.info("Executing via Ollama Agent")
                response_text = await self._chat_ollama_agent(enhanced_message, conversation_history, skip_db_context=skip_db, request_id=request_id)
            else:
                logger.warning("No LLM provider available. Using static fallback.")
                response_text = self._generate_fallback_response(message, context)

            result = {
                "response": response_text,
                "confidence": 0.95 if self._active_provider in [LLMProvider.GROQ, LLMProvider.OLLAMA] else 0.5,
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

    async def chat_stream(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None
    ):
        # Helper response
        if self._active_provider == LLMProvider.GROQ:
            try:
                # Try Groq
                async for token in self._chat_groq_stream(message, history, skip_db_context, request_id):
                    yield token
            except Exception as e:
                logger.error(f"Groq streaming failed: {e}")
                # Fallback to Ollama if configured
                if self.config.ollama_available:
                     logger.info("Falling back to Ollama streaming")
                     async for token in self._chat_ollama_stream(message, history, skip_db_context, request_id):
                        yield token
                else:
                    yield f"Error: Groq failed and Ollama is unavailable. ({str(e)})"
                    
        elif self._active_provider == LLMProvider.OLLAMA:
             async for token in self._chat_ollama_stream(message, history, skip_db_context, request_id):
                 yield token
        elif self._active_provider == LLMProvider.OLLAMA_AGENT:
             async for token in self._chat_ollama_agent_stream(message, history, skip_db_context, request_id):
                 yield token
        else:
             yield "System is offline or no provider available."

    def _enhance_with_context(self, message: str, context: Optional[Dict[str, Any]]) -> str:
        # Helper response
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
        # Helper response
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
    
    async def _chat_groq(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None
    ) -> str:
        # Groq Chat
        try:
            from groq import Groq
        except ImportError:
            logger.error("Groq package not installed. Run: pip install groq")
            raise Exception("Groq package not installed")
        
        # Skip heavy DB context loading if search results are already in message
        if skip_db_context:
            system_prompt = MARINE_SYSTEM_PROMPT + "\n\n(Using web search results instead of database context)"
            logger.info("Skipping DB context (search-mode)")
        else:
            # Tell system prompt to SKIP legacy enrichment, because we are providing TOOLS
            system_prompt = await get_dynamic_system_prompt(message, request_id=request_id, skip_enrichment=True)
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history
        if history:
            for msg in history[-10:]:
                messages.append({"role": msg.role, "content": msg.content})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        try:
            client = Groq(api_key=self.config.groq_api_key)
            
            # 1. First Call: Allow Tools
            completion = client.chat.completions.create(
                messages=messages,
                model=self.config.groq_model,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                tools=[FISHBASE_TOOL_DEF],
                tool_choice="auto"
            )
            
            response_msg = completion.choices[0].message
            
            # 2. Check for Tool Calls
            if response_msg.tool_calls:
                logger.info(f"Groq decided to use tools: {len(response_msg.tool_calls)}")
                messages.append(response_msg)  # Add the assistant's request to history
                
                # Execute all tools
                for tool_call in response_msg.tool_calls:
                    tool_result_messages = await self._execute_tool_call(tool_call, request_id)
                    if tool_result_messages:
                        messages.extend(tool_result_messages)
                
                # 3. Second Call: Get Final Answer
                completion = client.chat.completions.create(
                    messages=messages,
                    model=self.config.groq_model,
                    temperature=self.config.temperature,
                )
                response_msg = completion.choices[0].message
            
            content = response_msg.content
            logger.info(f"Groq Response: {content[:200]}...")
            return content
            
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            # Try fallback to Ollama if available
            if await self._check_ollama_availability():
                logger.info("Falling back to Ollama...")
                return await self._chat_ollama(message, history, skip_db_context, request_id)
            raise

    async def _execute_tool_call(self, tool_call: Any, request_id: Optional[str] = None) -> Optional[List[Dict]]:
        # Execute Tool Call
        try:
            function_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)
            
            logger.info(f"Executing tool: {function_name} with args: {args}")
            
            if function_name == "enrich_species_data":
                from database.fishbase_service import get_fishbase_service
                service = get_fishbase_service()
                
                species_list = args.get("scientific_names", [])
                if not species_list:
                     return [{
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": "No scientific names provided for enrichment."
                    }]
                    
                data = await service.enrich_species_list(species_list, request_id=request_id)
                
                # Format result
                result_text = "FishBase Data Retrieved:\n"
                for sci, details in data.items():
                    result_text += f"\nSpecies: {sci}\n"
                    result_text += f"Habitat: {details.get('habitat', 'Unknown')}\n"
                    result_text += f"Diet: {details.get('diet', 'Unknown')}\n"
                    result_text += f"Max Length: {details.get('max_length', 'Unknown')} cm\n"
                    result_text += f"Color: {details.get('color', 'Unknown')}\n"
                    result_text += f"IUCN Status: {details.get('iucn_status', 'Unknown')}\n"
                
                return [{
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result_text if data else "No data found for these species."
                }]
                
        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            return [{
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": f"Error executing tool: {str(e)}"
            }]
        return [{
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": f"Error: Tool name '{function_name}' not recognized."
        }]

    async def _chat_ollama_stream(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None
    ):
        # Ollama Streaming Output
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
    
    async def _chat_groq_stream(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None
    ):
        # Agentic Groq Streaming
        try:
            from groq import Groq
        except ImportError:
            logger.error("Groq package not installed. Run: pip install groq")
            raise Exception("Groq package not installed")
        
        # Skip heavy DB context loading if search results are already in message
        if skip_db_context:
            system_prompt = MARINE_SYSTEM_PROMPT + "\n\n(Using web search results instead of database context)"
            logger.info("Skipping DB context (search-mode)")
        else:
            # SKIP manual enrichment -> Agentic Mode
            system_prompt = await get_dynamic_system_prompt(message, request_id=request_id, skip_enrichment=True)
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history
        if history:
            for msg in history[-10:]:
                messages.append({"role": msg.role, "content": msg.content})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        try:
            client = Groq(api_key=self.config.groq_api_key)
            
            # Strategy: FORCE tool use if query implies species listing or details
            # This overcomes "lazy agent" behavior where it relies on the summary
            msg_lower = message.lower()
            force_tool = any(k in msg_lower for k in ["list", "species", "fish", "marine", "detail", "info", "what is"])
            
            forced_tool_choice = "auto"
            if force_tool and "enrich_species_data" in str(FISHBASE_TOOL_DEF):
                forced_tool_choice = {"type": "function", "function": {"name": "enrich_species_data"}}
                logger.info("Forcing Tool Use: enrich_species_data")

            # 1. Start Stream with Tools
            stream = client.chat.completions.create(
                messages=messages,
                model=self.config.groq_model,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                stream=True,
                tools=[FISHBASE_TOOL_DEF],
                tool_choice=forced_tool_choice
            )
            
            tool_calls_buffer = {}
            
            for chunk in stream:
                if not chunk.choices:
                    continue
                    
                delta = chunk.choices[0].delta
                
                # Check for Content (yield immediately)
                if delta.content:
                    yield delta.content
                    
                # Check for Tool Calls (buffer them)
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.index not in tool_calls_buffer:
                            tool_calls_buffer[tc.index] = {"id": tc.id, "name": tc.function.name, "args": ""}
                        # Append arguments fragment
                        if tc.function.arguments:
                            tool_calls_buffer[tc.index]["args"] += tc.function.arguments
            
            # 2. If Tools Were Called
            if tool_calls_buffer:
                logger.info(f"Groq Stream - Tools Triggered: {len(tool_calls_buffer)}")
                
                # Reconstruct Tool Calls for History
                full_tool_calls = []
                for idx in sorted(tool_calls_buffer.keys()):
                    entry = tool_calls_buffer[idx]
                    full_tool_calls.append({
                        "id": entry["id"],
                        "type": "function",
                        "function": {
                            "name": entry["name"],
                            "arguments": entry["args"]
                        }
                    })
                
                # Append Assistant's Tool Call Request
                messages.append({
                    "role": "assistant",
                    "tool_calls": full_tool_calls
                })
                
                # Execute Tools
                for tc in full_tool_calls:
                    # Create a Mock object to reuse _execute_tool_call
                    class ToolCallMock:
                        def __init__(self, d):
                            self.id = d['id']
                            self.function = type('obj', (object,), {
                                'name': d['function']['name'], 
                                'arguments': d['function']['arguments']
                            })
                    
                    result_msgs = await self._execute_tool_call(ToolCallMock(tc), request_id)
                    if result_msgs:
                        messages.extend(result_msgs)
                
                # 3. Stream Final Response
                stream_final = client.chat.completions.create(
                    messages=messages,
                    model=self.config.groq_model,
                    temperature=self.config.temperature,
                    stream=True
                )
                
                for chunk in stream_final:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"Groq streaming error: {e}")
            # Try fallback to Ollama streaming if available
            if await self._check_ollama_availability():
                logger.info("Falling back to Ollama streaming...")
                async for token in self._chat_ollama_stream(message, history, skip_db_context, request_id):
                    yield token
            else:
                raise
    
    async def _chat_ollama_agent(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None
    ) -> str:
        # Agentic Ollama Chat
        if skip_db_context:
            system_prompt = MARINE_SYSTEM_PROMPT + "\n\n(Using web search results instead of database context)"
            logger.info("Skipping DB context (search-mode)")
        else:
            # SKIP manual enrichment -> Agentic Mode
            system_prompt = await get_dynamic_system_prompt(message, request_id=request_id, skip_enrichment=True)
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if history:
            for msg in history[-10:]:
                messages.append({"role": msg.role, "content": msg.content})
        
        messages.append({"role": "user", "content": message})
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                # 1. First Call: Allow Tools
                response = await client.post(
                    f"{self.config.ollama_url}/api/chat",
                    json={
                        "model": self.config.model,
                        "messages": messages,
                        "stream": False,
                        "tools": [FISHBASE_TOOL_DEF],
                        "options": {"temperature": self.config.temperature}
                    }
                )
                
                if response.status_code != 200:
                    raise Exception(f"Ollama Agent error: {response.text}")
                    
                result = response.json()
                response_msg = result.get("message", {})
                
                # 2. Check for Tool Calls
                tool_calls = response_msg.get("tool_calls", [])
                
                if tool_calls:
                    logger.info(f"Ollama decided to use tools: {len(tool_calls)}")
                    # Add assistant message with tool calls
                    messages.append(response_msg)
                    
                    # Execute all tools
                    for tool_call in tool_calls:
                        # Translate Ollama dict to object-like for _execute_tool_call
                        class ToolCallWrapper:
                            def __init__(self, tc):
                                self.id = "local_call" # Ollama might not provide ID
                                self.function = type('obj', (object,), {
                                    'name': tc['function']['name'], 
                                    'arguments': json.dumps(tc['function']['arguments']) # Expects str
                                })
                        
                        tool_result_messages = await self._execute_tool_call(ToolCallWrapper(tool_call), request_id)
                        if tool_result_messages:
                            messages.extend(tool_result_messages)
                    
                    # 3. Second Call: Get Final Answer
                    response = await client.post(
                        f"{self.config.ollama_url}/api/chat",
                        json={
                            "model": self.config.model,
                            "messages": messages,
                            "stream": False,
                            "options": {"temperature": self.config.temperature}
                        }
                    )
                    
                    if response.status_code != 200:
                        raise Exception(f"Ollama Agent final response error: {response.text}")
                        
                    result = response.json()
                    response_msg = result.get("message", {})
                
                content = response_msg.get("content", "")
                logger.info(f"Ollama Agent Response: {content[:200]}...")
                return content

        except Exception as e:
            logger.error(f"Ollama Agent error: {e}")
            raise

    async def _chat_ollama_agent_stream(
        self,
        message: str,
        history: Optional[List[ChatMessage]] = None,
        skip_db_context: bool = False,
        request_id: Optional[str] = None
    ):
        # Agentic Ollama Streaming
        # Note: True Agentic Streaming is complex because we need to buffer tool calls.
        # For version 1, we will implement it as:
        # 1. Non-streaming Check for tools (fast)
        # 2. If tools used -> Execute -> Stream final response
        # 3. If no tools -> Stream response
        
        # This hybrid approach avoids complex stream parsing logic for tool calls
        
        # ... Reuse logic from _chat_ollama_agent to prepare messages ...
        if skip_db_context:
            system_prompt = MARINE_SYSTEM_PROMPT + "\n\n(Using web search results instead of database context)"
        else:
            system_prompt = await get_dynamic_system_prompt(message, request_id=request_id, skip_enrichment=True)
            
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for msg in history[-10:]:
                messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": message})
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                # 1. Non-streaming probe for tools
                response = await client.post(
                    f"{self.config.ollama_url}/api/chat",
                    json={
                        "model": self.config.model,
                        "messages": messages,
                        "stream": False,
                        "tools": [FISHBASE_TOOL_DEF],
                        "options": {"temperature": self.config.temperature}
                    }
                )
                
                if response.status_code != 200:
                    yield f"Error: {response.text}"
                    return

                result = response.json()
                response_msg = result.get("message", {})
                tool_calls = response_msg.get("tool_calls", [])
                
                if tool_calls:
                    yield "[Agent: Detected capability requirement. Using tools...]\n\n"
                    # Add assistant message
                    messages.append(response_msg)
                    
                    # Execute tools
                    for tool_call in tool_calls:
                        class ToolCallWrapper:
                            def __init__(self, tc):
                                self.id = "local_call"
                                self.function = type('obj', (object,), {
                                    'name': tc['function']['name'], 
                                    'arguments': json.dumps(tc['function']['arguments'])
                                })
                        
                        tool_result_messages = await self._execute_tool_call(ToolCallWrapper(tool_call), request_id)
                        if tool_result_messages:
                            messages.extend(tool_result_messages)
                            
                    # Stream Final Response
                    async with client.stream(
                        "POST",
                        f"{self.config.ollama_url}/api/chat",
                        json={
                            "model": self.config.model,
                            "messages": messages,
                            "stream": True,
                            "options": {"temperature": self.config.temperature}
                        }
                    ) as stream_resp:
                        async for line in stream_resp.aiter_lines():
                            if line:
                                try:
                                    data = json.loads(line)
                                    content = data.get("message", {}).get("content", "")
                                    if content: yield content
                                except: continue
                                
                else:
                    # No tools used, yield the content we already got (or stream it again if preferred, but we have it)
                    content = response_msg.get("content", "")
                    if content:
                        yield content
                    else:
                        # Fallback if empty response
                         yield "I couldn't generate a response."

        except Exception as e:
            logger.error(f"Ollama Agent Stream error: {e}")
            yield f"Error: {str(e)}"
    
    def _generate_fallback_response(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        # Helper response
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
        # Helper response
        if context and context.get("selected_species"):
            species = context["selected_species"]
            return f"Based on the selected species **{species}**, I can help with: Taxonomy, Distribution, Conservation Status, and Related Analysis (Otolith/eDNA)."
        
        # Check for specific species questions
        message_lower = message.lower()
        
        # Common marine species knowledge base for fallback
        species_info = {}
        
        # Try to match species names
        for species_key, info in species_info.items():
            if species_key in message_lower:
                return info["description"]
        
        # Generic species response
        return "I can help you explore marine species. Browse our database for taxonomy, distribution, and conservation status. Try asking 'Tell me about [species]'."
    
    def _oceanography_response(self, message: str) -> str:
        # Helper response
        return "I can help you explore oceanographic data: Temperature, Salinity, Chlorophyll-a, Oxygen, pH, Currents. Use the Viewer or Analytics tools."
    
    def _edna_response(self, message: str) -> str:
        # Helper response
        return "I can help with eDNA analysis: Sequence upload, Quality Control, BLAST detection, Biodiversity metrics. Navigate to eDNA Manager to start."
    
    def _otolith_response(self, message: str) -> str:
        # Helper response
        return "I can help with Otolith analysis: Image upload, Shape analysis, Age estimation, Species ID. Go to Otolith Analysis to upload images."
    
    def _analysis_response(self, message: str) -> str:
        # Helper response
        return "I can help with data analysis: Analytics Dashboard, Correlation, Temporal Trends, Spatial Patterns, Niche Modeling, Report Generation. Visit Analytics or Niche Modeling tools."

    def _biodiversity_response(self, message: str) -> str:
        # Helper response
        return "I can help with biodiversity assessment: Shannon Index, Simpson Index, Species Richness, Chao1 Estimator. View in eDNA Manager or Analytics."

    def _distribution_response(self, message: str) -> str:
        # Helper response
        return "I can help with species distribution: Niche Modeling (MaxEnt, BIOCLIM), Habitat Suitability. Use the Niche Modeling tool."
    
    def _help_response(self, message: str) -> str:
        # Helper response
        return "Welcome to the CMLRE Marine Data Platform! Get started with: Data Ingestion (CSV/Excel), Species Explorer (Taxonomy), Oceanography Viewer (Maps), Otolith Analysis (Images), eDNA Manager (Sequences), Analytics (Reports)."

    def _default_response(self, message: str) -> str:
        # Helper response
        return "I'm here to help with marine research questions: Species Info, Oceanography, eDNA, Otoliths, Data Analysis. Please ask a specific question like 'Tell me about Thunnus albacares' or 'How to analyze eDNA'."


# Global service instance
_llm_service: Optional[LLMService] = None
_current_provider: Optional[str] = None


def get_llm_service(preferred_provider: Optional[str] = None) -> LLMService:
    global _llm_service, _current_provider
    
    # Check if we need to force re-init because we are stuck in fallback
    # but the user is requesting a specific provider (e.g. they just started Ollama)
    force_reinit = False
    if _llm_service and preferred_provider:
        # If we asked for Ollama before, got Fallback, and are asking for Ollama again...
        if preferred_provider in ["ollama", "ollama_agent"]:
            if _llm_service._active_provider == LLMProvider.FALLBACK:
                force_reinit = True
                logger.info("Forcing LLM service re-init (stuck in fallback)")

    # If a specific provider is requested and different from current, OR forced
    if (preferred_provider and preferred_provider != _current_provider) or force_reinit:
        logger.info(f"Switching LLM provider to: {preferred_provider}")
        _llm_service = LLMService(preferred_provider=preferred_provider)
        _current_provider = preferred_provider
    elif _llm_service is None:
        _llm_service = LLMService(preferred_provider=preferred_provider)
        _current_provider = preferred_provider or "auto"
    
    return _llm_service


async def chat_with_llm(
    message: str,
    context: Optional[Dict[str, Any]] = None,
    history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    # Docstring removed to fix syntax error
    service = get_llm_service()
    
    # Convert history dict to ChatMessage objects
    chat_history = None
    if history:
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in history
        ]
    
    return await service.chat(message, context, chat_history)
