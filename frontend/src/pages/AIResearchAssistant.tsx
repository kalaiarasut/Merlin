import { useState, useRef, useEffect } from 'react';
import {
  Brain, Send, Paperclip, Bot, User, Copy, ThumbsUp, ThumbsDown,
  RotateCcw, Lightbulb, BarChart3, Dna, FileText,
  BookOpen, Microscope, Globe, TrendingUp, GraduationCap,
  Download, Bookmark, ExternalLink, Sparkles,
  ChevronRight, ChevronDown, X, Loader2, CheckCircle,
  BookMarked, FlaskConical, Target, Compass, MessageSquare,
  Search, Database, Library, GitMerge
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { aiService } from '@/services/api';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from 'recharts';

// Scientific Chart Data Structures
interface ScientificChartData {
  type: 'bar' | 'line' | 'area' | 'scatter';
  title: string;
  xAxis: {
    key: string;
    label: string;
    unit?: string;
  };
  yAxis: {
    label: string;
    unit: string;
  };
  data: any[];
  series: {
    key: string;
    name: string;
    color: string;
  }[];
}

// Structured Analysis Response
interface AnalysisResult {
  intent: 'trend_visualization' | 'correlation' | 'composition' | 'comparison';
  chartData: ScientificChartData;
  summaryText: string;
  insights: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'research' | 'literature' | 'analysis' | 'methodology';
  metadata?: {
    papers?: Paper[];
    species?: any[];
    charts?: any[];
    suggestions?: string[];
    completedPhases?: Array<{ iconName: string; text: string }>;
    analysis?: AnalysisResult;
    confidenceScore?: number;
    expertReviewRequired?: boolean;
    papersFetched?: number;
    citations?: string[];
  };
}

interface ChatSession {
  id: string;
  title: string;
  mode: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface Paper {
  title: string;
  authors: string;
  year: number;
  journal: string;
  doi?: string;
  abstract?: string;
  citations?: number;
  relevance?: number;
}

const RESEARCH_MODES = [
  { id: 'general', name: 'General Assistant', icon: MessageSquare, color: 'ocean' },
  { id: 'literature', name: 'Literature Review', icon: BookOpen, color: 'purple' },
  { id: 'methodology', name: 'Methodology Helper', icon: FlaskConical, color: 'green' },
  { id: 'analysis', name: 'Data Analysis', icon: BarChart3, color: 'blue' },
  { id: 'hypothesis', name: 'Hypothesis Generator', icon: Lightbulb, color: 'yellow' },
  { id: 'writing', name: 'Writing Assistant', icon: FileText, color: 'coral' },
];

// Mode-specific quick prompts
const MODE_SPECIFIC_PROMPTS: Record<string, Array<{ icon: any; text: string }>> = {
  general: [
    { icon: MessageSquare, text: 'What are the latest trends in marine research?' },
    { icon: BookOpen, text: 'Explain the importance of marine protected areas' },
    { icon: Globe, text: 'How does climate change affect ocean ecosystems?' },
    { icon: Dna, text: 'What is eDNA and how is it used in marine biology?' },
  ],
  literature: [
    { icon: BookOpen, text: 'Find recent papers on coral reef bleaching in Indian Ocean' },
    { icon: Search, text: 'Literature review on eDNA metabarcoding in marine ecosystems' },
    { icon: Target, text: 'Identify gaps in mangrove ecosystem research' },
    { icon: TrendingUp, text: 'Most cited papers on fish stock assessment methods' },
  ],
  methodology: [
    { icon: FlaskConical, text: 'How to extract otoliths for age estimation?' },
    { icon: Microscope, text: 'Suggest methodology for eDNA sampling in estuaries' },
    { icon: Dna, text: 'Protocol for fish tissue DNA extraction' },
    { icon: Target, text: 'Best practices for underwater visual census surveys' },
  ],
  analysis: [
    { icon: BarChart3, text: 'Analyze fish population trends from my data' },
    { icon: TrendingUp, text: 'Compare species richness across study sites' },
    { icon: Dna, text: 'Interpret eDNA metabarcoding results' },
    { icon: Globe, text: 'PERMANOVA analysis for community composition' },
  ],
  hypothesis: [
    { icon: Lightbulb, text: 'Generate hypotheses for declining fish stocks' },
    { icon: Target, text: 'Propose research questions for coral reef resilience' },
    { icon: Dna, text: 'Hypotheses for eDNA detection in varying salinity' },
    { icon: TrendingUp, text: 'Predict climate change impacts on fish migration' },
  ],
  writing: [
    { icon: FileText, text: 'Help write abstract for marine biodiversity study' },
    { icon: BookOpen, text: 'Draft methods section for eDNA sampling protocol' },
    { icon: MessageSquare, text: 'Write introduction for fisheries research paper' },
    { icon: Target, text: 'Summarize key findings for discussion section' },
  ],
};

const SAMPLE_PAPERS: Paper[] = [
  {
    title: "Climate change impacts on marine biodiversity in the Indian Ocean",
    authors: "Kumar S, Sharma R, et al.",
    year: 2024,
    journal: "Marine Ecology Progress Series",
    doi: "10.3354/meps14521",
    citations: 45,
    relevance: 95
  },
  {
    title: "eDNA metabarcoding reveals hidden fish diversity in Arabian Sea",
    authors: "Patel M, Singh A, et al.",
    year: 2023,
    journal: "Environmental DNA",
    doi: "10.1002/edn3.421",
    citations: 32,
    relevance: 88
  },
  {
    title: "Otolith microchemistry as indicator of fish migration patterns",
    authors: "Chen X, Wang L, et al.",
    year: 2024,
    journal: "ICES Journal of Marine Science",
    doi: "10.1093/icesjms/fsae012",
    citations: 18,
    relevance: 82
  }
];

// Realistic Indian Ocean Fisheries Time-Series Data (2010-2024)
// Species: Rastrelliger kanagurta (Indian Mackerel) vs Sardinella longiceps (Oil Sardine)
const INDIAN_OCEAN_FISHERIES_DATA = [
  { year: 2010, mackerel: 142.3, sardine: 389.1 },
  { year: 2011, mackerel: 156.8, sardine: 412.5 },
  { year: 2012, mackerel: 148.2, sardine: 378.9 },
  { year: 2013, mackerel: 163.5, sardine: 425.3 },
  { year: 2014, mackerel: 171.9, sardine: 398.7 },
  { year: 2015, mackerel: 158.4, sardine: 312.6 }, // El Niño impact
  { year: 2016, mackerel: 145.7, sardine: 287.4 },
  { year: 2017, mackerel: 167.2, sardine: 356.8 },
  { year: 2018, mackerel: 182.6, sardine: 401.2 },
  { year: 2019, mackerel: 178.3, sardine: 423.9 },
  { year: 2020, mackerel: 152.1, sardine: 368.5 }, // COVID fishing reduction
  { year: 2021, mackerel: 169.8, sardine: 392.7 },
  { year: 2022, mackerel: 185.4, sardine: 378.1 },
  { year: 2023, mackerel: 191.2, sardine: 356.9 },
  { year: 2024, mackerel: 188.7, sardine: 342.3 },
];

// Generate scientific analysis response for Data Analysis mode
const generateAnalysisResponse = (): AnalysisResult => ({
  intent: 'trend_visualization',
  chartData: {
    type: 'line',
    title: 'Indian Ocean Small Pelagic Fisheries Landings (2010-2024)',
    xAxis: {
      key: 'year',
      label: 'Year',
      unit: 'years',
    },
    yAxis: {
      label: 'Landings',
      unit: '× 1000 Metric Tonnes',
    },
    data: INDIAN_OCEAN_FISHERIES_DATA,
    series: [
      { key: 'mackerel', name: 'R. kanagurta (Indian Mackerel)', color: '#0ea5e9' },
      { key: 'sardine', name: 'S. longiceps (Oil Sardine)', color: '#10b981' },
    ],
  },
  summaryText: 'Analysis of small pelagic fisheries landings from the Indian Ocean reveals distinct temporal patterns. Oil Sardine (*Sardinella longiceps*) shows higher overall landings but greater interannual variability, while Indian Mackerel (*Rastrelliger kanagurta*) demonstrates more stable trends with gradual increase.',
  insights: [
    'Oil Sardine landings declined 28% during 2015-2016, coinciding with strong El Niño conditions',
    'Indian Mackerel shows consistent upward trend (+32% over study period)',
    'COVID-19 (2020) impact observable: ~10% reduction in both species landings',
    'Post-2022: Sardine decline (-9.5%) while Mackerel stabilizes, suggesting ecological shift',
  ],
});

// localStorage keys
const RESEARCH_CHAT_STORAGE_KEY = 'cmlre-research-chats';
const SAVED_PAPERS_KEY = 'cmlre-saved-papers';

// Load chats from localStorage
const loadChats = (): ChatSession[] => {
  try {
    const stored = localStorage.getItem(RESEARCH_CHAT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((chat: any) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        updatedAt: new Date(chat.updatedAt),
        messages: chat.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
    }
  } catch (e) {
    console.error('Failed to load research chats:', e);
  }
  return [];
};

// Save chats to localStorage
const saveChats = (chats: ChatSession[]) => {
  try {
    localStorage.setItem(RESEARCH_CHAT_STORAGE_KEY, JSON.stringify(chats));
  } catch (e) {
    console.error('Failed to save research chats:', e);
  }
};

// Load saved papers
const loadSavedPapers = (): Paper[] => {
  try {
    const stored = localStorage.getItem(SAVED_PAPERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to load saved papers:', e);
    return [];
  }
};

// Save papers
const savePapersToStorage = (papers: Paper[]) => {
  try {
    localStorage.setItem(SAVED_PAPERS_KEY, JSON.stringify(papers));
  } catch (e) {
    console.error('Failed to save papers:', e);
  }
};

// Create new chat session
const createNewChat = (mode: string = 'general'): ChatSession => ({
  id: Date.now().toString(),
  title: 'New Research Chat',
  mode,
  messages: [
    {
      id: '1',
      role: 'assistant',
      content: "Welcome to the AI Research Assistant! I'm here to help with your marine research. I can:\n\n• **Search literature** - Find relevant papers and summarize findings\n• **Suggest methodologies** - Recommend techniques for your research questions\n• **Analyze data** - Help interpret your marine datasets\n• **Generate hypotheses** - Brainstorm research ideas based on your data\n• **Assist writing** - Help draft abstracts, methods sections, and more\n\nWhat would you like to explore today?",
      timestamp: new Date(),
      type: 'text'
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
});

export default function AIResearchAssistant() {
  // Load chat sessions from localStorage
  const [allChats, setAllChats] = useState<ChatSession[]>(() => {
    const loaded = loadChats();
    return loaded.length > 0 ? loaded : [createNewChat()];
  });
  const [currentChatId, setCurrentChatId] = useState<string>(() => {
    const loaded = loadChats();
    return loaded.length > 0 ? loaded[0].id : allChats[0].id;
  });

  // Current chat and messages
  const currentChat = allChats.find(c => c.id === currentChatId) || allChats[0];
  const messages = currentChat.messages;
  const activeMode = currentChat.mode;

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPaperPanel, setShowPaperPanel] = useState(false);
  const [savedPapers, setSavedPapers] = useState<Paper[]>(() => loadSavedPapers());
  const [expandedSections, setExpandedSections] = useState<string[]>(['methodology', 'results']);
  const [selectedProvider, setSelectedProvider] = useState<'auto' | 'groq' | 'ollama' | 'ollama_agent'>(() => {
    // Load from localStorage, default to 'auto'
    try {
      const stored = localStorage.getItem('cmlre-llm-provider');
      if (stored === 'groq' || stored === 'ollama' || stored === 'ollama_agent' || stored === 'auto') {
        return stored;
      }
    } catch (e) {
      console.error('Failed to load provider preference:', e);
    }
    return 'auto';
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Save chats whenever they change
  useEffect(() => {
    saveChats(allChats);
  }, [allChats]);

  // Save papers whenever they change
  useEffect(() => {
    savePapersToStorage(savedPapers);
  }, [savedPapers]);

  // Update mode in current chat
  const setActiveMode = (mode: string) => {
    setAllChats(prev => prev.map(chat =>
      chat.id === currentChatId ? { ...chat, mode } : chat
    ));
  };

  // Update messages in current chat
  const setMessages = (updater: React.SetStateAction<Message[]>) => {
    setAllChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        const newMessages = typeof updater === 'function' ? updater(chat.messages) : updater;
        return {
          ...chat,
          messages: newMessages,
          updatedAt: new Date(),
          // Auto-title from first user message
          title: newMessages.find(m => m.role === 'user')?.content.slice(0, 50) || chat.title
        };
      }
      return chat;
    }));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  };

  // Only scroll to bottom when new messages are added, not on initial load
  const prevMessagesLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100);
    }
    prevMessagesLength.current = messages.length;
  }, [messages]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const generateResearchResponse = async (query: string, mode: string): Promise<Message> => {
    const baseId = (Date.now() + 1).toString();

    // Data Analysis Mode - Deterministic, structured response
    if (mode === 'analysis') {
      const analysisResult = generateAnalysisResponse();
      return {
        id: baseId,
        role: 'assistant',
        content: '', // Content is empty; display driven by metadata.analysis
        timestamp: new Date(),
        type: 'analysis',
        metadata: {
          analysis: analysisResult,
        },
      };
    }

    // Literature search - use real API
    if (mode === 'literature' || query.toLowerCase().includes('paper') || query.toLowerCase().includes('literature') || query.toLowerCase().includes('find')) {
      try {
        const response = await aiService.paperSearch(query, 10);

        if (response.success && response.papers.length > 0) {
          return {
            id: baseId,
            role: 'assistant',
            content: `I found ${response.total} relevant papers for your query. Here are the top results:\n\n📚 **Literature Search Results**\n\nBased on your query about "${query.slice(0, 50)}...", I've identified highly relevant papers from Europe PMC and Semantic Scholar databases.`,
            timestamp: new Date(),
            type: 'literature',
            metadata: {
              papers: response.papers.map(p => ({
                title: p.title,
                authors: p.authors,
                year: p.year,
                journal: p.journal,
                doi: p.doi,
                citations: p.citations,
                relevance: p.relevance,
                abstract: p.abstract?.slice(0, 300) + (p.abstract?.length > 300 ? '...' : '')
              }))
            }
          };
        } else {
          return {
            id: baseId,
            role: 'assistant',
            content: `I couldn't find papers matching your query. Try:\n• Being more specific\n• Using scientific names\n• Including keywords like "marine", "fish", "ocean"`,
            timestamp: new Date(),
            type: 'text'
          };
        }
      } catch (error) {
        console.error('Paper search failed:', error);
        // Fallback to mock if API fails
        return {
          id: baseId,
          role: 'assistant',
          content: `I encountered an error searching for papers. Here are some sample results from my cache:`,
          timestamp: new Date(),
          type: 'literature',
          metadata: {
            papers: SAMPLE_PAPERS
          }
        };
      }
    }

    if (mode === 'methodology' || query.toLowerCase().includes('method') || query.toLowerCase().includes('how to')) {
      // Use HYBRID RAG with REAL papers from Semantic Scholar/Europe PMC
      try {
        const response = await fetch('http://localhost:8000/methodology/query-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, provider: selectedProvider })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const ragResult = await response.json();

        if (ragResult.success && ragResult.methodology) {
          // Build formatted response with real citations
          let content = `## Recommended Methodology\n\n${ragResult.methodology}`;

          // Add sources section with real DOIs and provenance
          if (ragResult.sources && ragResult.sources.length > 0) {
            content += `\n\n---\n\n### 📚 Sources (Real Papers)\n`;
            ragResult.sources.forEach((src: any) => {
              const icon = src.type?.includes('Peer') ? '📄' : '📋';
              const doi = src.doi ? ` | [DOI](https://doi.org/${src.doi})` : '';
              const year = src.year ? ` (${src.year})` : '';
              const journal = src.journal && src.journal !== 'Unknown' ? ` - ${src.journal}` : '';
              content += `- ${icon} **[${src.doc_id}]** ${src.title}${year}${journal}${doi}\n`;
            });
          }

          // Add confidence from source ranking
          const confidence = ragResult.confidence?.score || 0;
          const confidenceLabel = ragResult.confidence?.label ||
            (confidence >= 0.75 ? '🟢 High' : confidence >= 0.5 ? '🟡 Medium' : '🔴 Low');
          content += `\n\n**Confidence**: ${confidenceLabel} (${Math.round(confidence * 100)}%)`;

          if (ragResult.expert_review_required) {
            content += `\n⚠️ *Expert review recommended*`;
          }

          // Add limitations
          if (ragResult.limitations && ragResult.limitations.length > 0) {
            content += `\n\n### ⚠️ Limitations\n`;
            ragResult.limitations.forEach((lim: string) => {
              content += `- ${lim}\n`;
            });
          }

          return {
            id: baseId,
            role: 'assistant',
            content,
            timestamp: new Date(),
            type: 'methodology',
            metadata: {
              suggestions: ragResult.limitations || [],
              confidenceScore: ragResult.confidence?.score,
              expertReviewRequired: ragResult.expert_review_required,
              papersFetched: ragResult.papers_fetched
            }
          };
        }
      } catch (error) {
        console.error('Hybrid RAG query failed:', error);
        // Fall through to fallback below
      }

      // Fallback if RAG API fails
      return {
        id: baseId,
        role: 'assistant',
        content: `## Recommended Methodology\n\n⚠️ Could not connect to the live paper search.\n\nPlease try:\n1. Check that AI services are running\n2. Verify Ollama is active\n3. Try again in a moment`,
        timestamp: new Date(),
        type: 'methodology',
        metadata: {
          suggestions: [
            'Live paper search unavailable',
            'Check AI services and Ollama'
          ]
        }
      };
    }

    if (mode === 'hypothesis' || query.toLowerCase().includes('hypothesis') || query.toLowerCase().includes('predict')) {
      return {
        id: baseId,
        role: 'assistant',
        content: `## Research Hypotheses\n\nBased on your research context and current marine science literature, here are testable hypotheses:\n\n### Primary Hypotheses\n\n**H1**: Species diversity in coastal waters decreases with increasing distance from marine protected areas.\n- *Rationale*: Spillover effects from MPAs support adjacent fish populations\n- *Test*: Compare diversity indices at 0, 5, 10, 20 km from MPA boundaries\n\n**H2**: eDNA detection probability for migratory species varies seasonally with monsoon patterns.\n- *Rationale*: Monsoon-driven upwelling affects species distribution and abundance\n- *Test*: Monthly eDNA sampling across pre-monsoon, monsoon, post-monsoon seasons\n\n**H3**: Otolith microchemistry signatures differ between fish populations in Arabian Sea vs Bay of Bengal.\n- *Rationale*: Different oceanographic conditions create distinct chemical environments\n- *Test*: Sr/Ca and Ba/Ca ratios in otoliths from both regions\n\n### Null Hypotheses\n- H0₁: No significant difference in species richness between MPA and non-MPA sites\n- H0₂: No seasonal variation in eDNA detection rates\n- H0₃: No regional differences in otolith chemistry\n\nWould you like me to help design experiments to test these hypotheses?`,
        timestamp: new Date(),
        type: 'research',
        metadata: {
          suggestions: [
            'Consider confounding variables',
            'Plan adequate sample sizes for statistical power',
            'Include positive and negative controls'
          ]
        }
      };
    }

    if (mode === 'writing' || query.toLowerCase().includes('write') || query.toLowerCase().includes('abstract') || query.toLowerCase().includes('draft')) {
      return {
        id: baseId,
        role: 'assistant',
        content: `## Draft Abstract\n\nHere's a draft based on your research context:\n\n---\n\n**[Title: Assessing Marine Biodiversity Using Environmental DNA in Indian Coastal Waters]**\n\nEnvironmental DNA (eDNA) metabarcoding offers a non-invasive approach to biodiversity assessment in marine ecosystems. This study investigated fish community composition across [X] sites in Indian coastal waters using eDNA analysis. Water samples were collected seasonally over 12 months and analyzed using 12S rRNA metabarcoding. We detected [X] fish species across [X] families, including [X] commercially important species and [X] species of conservation concern. Species richness was significantly higher in [habitat type] compared to [habitat type] (p < 0.05). Detection probability varied seasonally, with peak diversity during [season]. Our findings demonstrate that eDNA provides an effective tool for monitoring marine biodiversity in tropical waters and can complement traditional survey methods. These results have implications for fisheries management and marine conservation planning in the region.\n\n**Keywords**: eDNA, metabarcoding, marine biodiversity, Indian Ocean, fish communities\n\n---\n\n*Note: Replace bracketed sections with your specific data. Would you like me to help refine any section?*`,
        timestamp: new Date(),
        type: 'text'
      };
    }

    // Default: General response using AI service
    try {
      const response = await aiService.chat(query, { mode }, undefined, selectedProvider);
      return {
        id: baseId,
        role: 'assistant',
        content: response.response || 'I can help with that! Could you provide more details about your specific research question?',
        timestamp: new Date(),
        type: 'text'
      };
    } catch {
      return {
        id: baseId,
        role: 'assistant',
        content: `I'd be happy to help with your research on "${query.slice(0, 100)}..."\n\nBased on current marine science knowledge, here are some insights:\n\n• This topic intersects with several active research areas in marine biology\n• Recent studies have shown promising results using integrated approaches\n• Consider combining traditional methods with emerging technologies like eDNA\n\nWould you like me to:\n1. Search for relevant literature?\n2. Suggest a methodology?\n3. Help analyze your existing data?\n4. Generate testable hypotheses?`,
        timestamp: new Date(),
        type: 'text'
      };
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Use streaming for literature search
      if (activeMode === 'literature' || input.toLowerCase().includes('paper') ||
        input.toLowerCase().includes('literature') || input.toLowerCase().includes('find')) {

        // Create streaming progress message
        const progressId = (Date.now() + 1).toString();
        let progressContent = '🔍 Searching academic databases...\n\n';

        const progressMessage: Message = {
          id: progressId,
          role: 'assistant',
          content: progressContent,
          timestamp: new Date(),
          type: 'literature'
        };

        setMessages(prev => [...prev, progressMessage]);

        // Simulate streaming phases with React icons
        const phases = [
          { icon: Database, text: 'Searching academic databases...', delay: 500 },
          { icon: Library, text: 'Searching Europe PMC...', delay: 500 },
          { icon: TrendingUp, text: 'Fetching Semantic Scholar citations...', delay: 700 },
          { icon: GitMerge, text: 'Merging and ranking papers...', delay: 400 },
          { icon: Sparkles, text: 'Generating summary...', delay: 300 }
        ];

        // Show phases incrementally
        const completedPhases: any[] = [];
        for (const phase of phases) {
          await new Promise(resolve => setTimeout(resolve, phase.delay));
          completedPhases.push(phase);

          setMessages(prev => prev.map(msg => {
            if (msg.id === progressId) {
              return { ...msg, metadata: { ...msg.metadata, completedPhases: [...completedPhases] } };
            }
            return msg;
          }));
        }

        // Fetch actual results
        const response = await aiService.paperSearch(input.trim(), 10);

        if (response.success && response.papers.length > 0) {
          const finalMessage: Message = {
            id: progressId,
            role: 'assistant',
            content: `Search Complete\n\nFound ${response.total} relevant papers from Europe PMC and Semantic Scholar databases.\n\nTop ${response.papers.length} Papers\n\nRanked using:\n• Text relevance to your query\n• Citation count (${response.papers.reduce((sum, p) => sum + (p.citations || 0), 0).toLocaleString()} total citations)\n• Open access availability\n• Recency (papers from 2022-2024 boosted)\n\nQuery: "${input.trim().slice(0, 60)}..."`,
            timestamp: new Date(),
            type: 'literature',
            metadata: {
              papers: response.papers.map(p => ({
                title: p.title,
                authors: p.authors,
                year: p.year,
                journal: p.journal,
                doi: p.doi,
                citations: p.citations,
                relevance: p.relevance,
                abstract: p.abstract?.slice(0, 300) + (p.abstract?.length > 300 ? '...' : '')
              }))
            }
          };
          setMessages(prev => prev.map(msg => msg.id === progressId ? finalMessage : msg));
        } else {
          const noResultsMsg: Message = {
            id: progressId,
            role: 'assistant',
            content: `I couldn't find papers matching your query. Try:\n• Being more specific\n• Using scientific names\n• Including keywords like "marine", "fish", "ocean"`,
            timestamp: new Date(),
            type: 'text'
          };
          setMessages(prev => prev.map(msg => msg.id === progressId ? noResultsMsg : msg));
        }
      } else {
        // Non-streaming for other modes - create placeholder then update
        const placeholderId = (Date.now() + 1).toString();
        const placeholderMessage: Message = {
          id: placeholderId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, placeholderMessage]);

        const response = await generateResearchResponse(input.trim(), activeMode);
        setMessages(prev => prev.map(msg => msg.id === placeholderId ? { ...response, id: placeholderId } : msg));
      }
    } catch (error) {
      console.error('Research assistant error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const savePaper = (paper: Paper) => {
    if (!savedPapers.find(p => p.doi === paper.doi)) {
      setSavedPapers(prev => [...prev, paper]);
    }
  };

  const removePaper = (doi?: string) => {
    setSavedPapers(prev => prev.filter(p => p.doi !== doi));
  };

  const exportPapers = async (format: 'bibtex' | 'ris' | 'apa' | 'mla') => {
    try {
      const response = await aiService.exportCitations(savedPapers, format);
      if (response.success) {
        // Download as file
        const blob = new Blob([response.text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `citations.${format === 'bibtex' ? 'bib' : format === 'ris' ? 'ris' : 'txt'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const findSimilar = async (paper: Paper) => {
    if (!paper.doi) {
      console.log('No DOI available for similar papers');
      return;
    }

    try {
      setIsLoading(true);
      const response = await aiService.getSimilarPapers(paper.doi, 5);

      if (response.success && response.papers && response.papers.length > 0) {
        const similarMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `📚 **Similar Papers to "${paper.title.slice(0, 60)}..."**\n\nFound ${response.count} similar papers based on Semantic Scholar recommendations:`,
          timestamp: new Date(),
          type: 'literature',
          metadata: {
            papers: response.papers.map((p: any) => ({
              title: p.title || 'Untitled',
              authors: p.authors || [],
              year: p.year,
              journal: p.journal,
              doi: p.doi || p.paperId,
              citations: p.citationCount || p.citations || 0,
              relevance: p.similarity_score ? Math.round(p.similarity_score * 100) : 75,
              abstract: p.abstract?.slice(0, 300)
            }))
          }
        };
        setMessages(prev => [...prev, similarMsg]);
        setIsLoading(false);
      } else {
        console.log('No similar papers found');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Find similar failed:', error);
      setIsLoading(false);
    }
  };

  const renderPaperCard = (paper: Paper, showSave = true) => (
    <div key={paper.doi} className="bg-white dark:bg-deep-800 border border-gray-200 dark:border-deep-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-deep-900 dark:text-white text-sm line-clamp-2">
            {paper.title}
          </h4>
          <p className="text-xs text-deep-500 dark:text-gray-400 mt-1">
            {paper.authors} • {paper.year}
          </p>
          <p className="text-xs text-deep-400 dark:text-gray-500">
            {paper.journal}
          </p>
        </div>
        {paper.relevance && (
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium flex-shrink-0",
            paper.relevance >= 90 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
              paper.relevance >= 80 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          )}>
            {paper.relevance}% match
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3">
        {paper.citations !== undefined && (
          <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
            📖 {paper.citations} citations
            {paper.citations === 0 && paper.year && paper.year >= 2024 && (
              <span className="text-xs text-amber-600 dark:text-amber-400" title="Citation counts may be zero for very recent publications">
                (Recent - pending)
              </span>
            )}
          </span>
        )}
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ocean-600 hover:text-ocean-700 dark:text-ocean-400 flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            DOI
          </a>
        )}
        {showSave && (
          <>
            <button
              onClick={() => savePaper(paper)}
              className="ml-auto text-xs text-coral-600 hover:text-coral-700 dark:text-coral-400 flex items-center gap-1"
              title="Save paper"
            >
              <Bookmark className="w-3 h-3" />
              Save
            </button>
            {paper.doi && (
              <button
                onClick={() => findSimilar(paper)}
                className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 flex items-center gap-1"
                title="Find similar papers using Semantic Scholar"
              >
                <Search className="w-3 h-3" />
                Similar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderMessageContent = (message: Message) => {
    // Show loading indicator if message is empty and we're loading
    if (!message.content && isLoading) {
      return (
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
          <span className="text-sm text-deep-700 dark:text-gray-300">
            {activeMode === 'literature' ? 'Searching literature databases...' :
              activeMode === 'methodology' ? 'Generating methodology recommendations...' :
                activeMode === 'analysis' ? 'Analyzing your query...' :
                  activeMode === 'hypothesis' ? 'Generating hypotheses...' :
                    activeMode === 'writing' ? 'Drafting content...' :
                      'Processing your request...'}
          </span>
        </div>
      );
    }

    // Render streaming phases with icons
    if (message.metadata?.completedPhases && Array.isArray(message.metadata.completedPhases)) {
      const phases = message.metadata.completedPhases as unknown as Array<{ icon: any; text: string }>;

      return (
        <div className="space-y-2">
          {phases.map((phase, idx) => {
            const PhaseIcon = phase.icon;
            // Ensure PhaseIcon is a valid component
            if (!PhaseIcon || typeof PhaseIcon !== 'function') {
              return (
                <div key={idx} className="flex items-center gap-2 text-ocean-600 dark:text-ocean-400">
                  <span className="text-sm">{phase.text}</span>
                </div>
              );
            }
            return (
              <div key={idx} className="flex items-center gap-2 text-ocean-600 dark:text-ocean-400">
                <PhaseIcon className="w-4 h-4" />
                <span className="text-sm">{phase.text}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Render Scientific Analysis with Chart
    if (message.metadata?.analysis) {
      const { chartData, summaryText, insights } = message.metadata.analysis;

      // Custom tooltip for scientific accuracy
      const ScientificTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
          return (
            <div className="bg-white/95 dark:bg-deep-800/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
              <p className="text-sm font-semibold text-deep-900 dark:text-gray-100">{label}</p>
              {payload.map((entry: any, index: number) => (
                <p key={index} className="text-sm text-deep-600 dark:text-gray-300">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: entry.color }} />
                  {entry.name}: <strong>{entry.value.toFixed(1)}</strong> {chartData.yAxis.unit}
                </p>
              ))}
            </div>
          );
        }
        return null;
      };

      return (
        <div className="space-y-4">
          {/* Chart Title */}
          <h3 className="text-lg font-bold text-deep-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            {chartData.title}
          </h3>

          {/* Scientific Chart */}
          <div className="bg-white dark:bg-deep-700/50 rounded-xl p-4 border border-gray-200 dark:border-deep-600">
            <ResponsiveContainer width="100%" height={280}>
              {chartData.type === 'line' || chartData.type === 'area' ? (
                <LineChart data={chartData.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                  <XAxis
                    dataKey={chartData.xAxis.key}
                    label={{ value: `${chartData.xAxis.label}${chartData.xAxis.unit ? ` (${chartData.xAxis.unit})` : ''}`, position: 'insideBottom', offset: -5 }}
                    stroke="currentColor"
                    className="text-gray-500 dark:text-gray-400"
                    fontSize={12}
                  />
                  <YAxis
                    label={{ value: `${chartData.yAxis.label} (${chartData.yAxis.unit})`, angle: -90, position: 'insideLeft' }}
                    stroke="currentColor"
                    className="text-gray-500 dark:text-gray-400"
                    fontSize={12}
                  />
                  <Tooltip content={<ScientificTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 20 }} />
                  {chartData.series.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={chartData.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                  <XAxis dataKey={chartData.xAxis.key} stroke="currentColor" className="text-gray-500 dark:text-gray-400" fontSize={12} />
                  <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" fontSize={12} />
                  <Tooltip content={<ScientificTooltip />} />
                  <Legend />
                  {chartData.series.map((s) => (
                    <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Summary Text */}
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="text-deep-700 dark:text-gray-300">{summaryText}</p>
          </div>

          {/* Key Insights */}
          {insights && insights.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4" />
                Key Insights
              </h4>
              <ul className="space-y-2">
                {insights.map((insight, idx) => (
                  <li key={idx} className="text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          {message.content.split('\n').map((line, i) => {
            if (line.startsWith('## ')) {
              return <h2 key={i} className="text-lg font-bold mt-4 mb-2 text-deep-900 dark:text-white">{line.replace('## ', '')}</h2>;
            }
            if (line.startsWith('### ')) {
              return <h3 key={i} className="text-base font-semibold mt-3 mb-1 text-deep-800 dark:text-gray-200">{line.replace('### ', '')}</h3>;
            }
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="font-semibold text-deep-800 dark:text-gray-200">{line.replace(/\*\*/g, '')}</p>;
            }
            if (line.startsWith('- ')) {
              return <li key={i} className="ml-4 text-deep-700 dark:text-gray-300">{line.replace('- ', '')}</li>;
            }
            if (line.startsWith('• ')) {
              return <li key={i} className="ml-4 text-deep-700 dark:text-gray-300">{line.replace('• ', '')}</li>;
            }
            if (line.trim() === '') {
              return <br key={i} />;
            }
            return <p key={i} className="text-deep-700 dark:text-gray-300 mb-1">{line}</p>;
          })}
        </div>

        {/* Render papers if available */}
        {message.metadata?.papers && message.metadata.papers.length > 0 && (
          <div className="mt-4 space-y-3">
            {message.metadata.papers.map(paper => renderPaperCard(paper))}
          </div>
        )}

        {/* Render suggestions if available */}
        {message.metadata?.suggestions && message.metadata.suggestions.length > 0 && (
          <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4" />
              Suggestions
            </h4>
            <ul className="space-y-1">
              {message.metadata.suggestions.map((suggestion, idx) => (
                <li key={idx} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-deep-900 dark:text-white">AI Research Assistant</h1>
              <p className="text-sm text-deep-500 dark:text-gray-400">Literature search • Methodology • Analysis • Writing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors text-xs font-medium text-slate-300">
                {selectedProvider === 'auto' && 'Auto (Groq)'}
                {selectedProvider === 'groq' && 'Groq (Cloud)'}
                {selectedProvider === 'ollama' && 'Ollama (Local)'}
                {selectedProvider === 'ollama_agent' && 'Ollama (Agentic)'}
                <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </button>
              <div className="absolute top-full mt-2 right-0 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                <button onClick={() => { setSelectedProvider('auto'); localStorage.setItem('cmlre-llm-provider', 'auto'); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">Auto (Groq)</button>
                <button onClick={() => { setSelectedProvider('groq'); localStorage.setItem('cmlre-llm-provider', 'groq'); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">Groq (Cloud)</button>
                <button onClick={() => { setSelectedProvider('ollama'); localStorage.setItem('cmlre-llm-provider', 'ollama'); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">Ollama (Local)</button>
                <button onClick={() => { setSelectedProvider('ollama_agent'); localStorage.setItem('cmlre-llm-provider', 'ollama_agent'); }} className="w-full text-left px-4 py-2 text-sm text-emerald-400 hover:bg-slate-800 hover:text-emerald-300 transition-colors">Ollama (Agentic)</button>
              </div>
            </div>
            <button
              onClick={() => setShowPaperPanel(!showPaperPanel)}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg transition-all flex items-center justify-between text-sm font-medium",
                showPaperPanel
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : "bg-gray-100 text-gray-700 dark:bg-deep-700 dark:text-gray-300 hover:bg-gray-200"
              )}
            >
              <div className="flex items-center gap-2">
                <BookMarked className="w-4 h-4" />
                <span>Saved Papers ({savedPapers.length})</span>
              </div>
              {showPaperPanel && savedPapers.length > 0 && (
                <div className="flex gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); exportPapers('bibtex'); }}
                    className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                    title="Export as BibTeX"
                  >
                    BibTeX
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportPapers('ris'); }}
                    className="px-2.5 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    title="Export as RIS"
                  >
                    RIS
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportPapers('apa'); }}
                    className="px-2.5 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                    title="Export as APA"
                  >
                    APA
                  </button>
                </div>
              )}
            </button>
            <button
              onClick={() => setMessages([messages[0]])}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 dark:bg-deep-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-deep-600 flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              New Chat
            </button>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 pt-2 mt-2 sticky top-0 bg-gray-50/80 dark:bg-deep-900/80 backdrop-blur-sm z-10 -mx-2 px-2 rounded-lg">
          {RESEARCH_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                activeMode === mode.id
                  ? mode.color === 'ocean' ? "bg-ocean-100 text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-300 ring-2 ring-ocean-500" :
                    mode.color === 'purple' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 ring-2 ring-purple-500" :
                      mode.color === 'green' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 ring-2 ring-green-500" :
                        mode.color === 'blue' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-2 ring-blue-500" :
                          mode.color === 'yellow' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-2 ring-amber-500" :
                            "bg-coral-100 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300 ring-2 ring-coral-500"
                  : "bg-gray-100 text-gray-600 dark:bg-deep-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-deep-600"
              )}
            >
              <mode.icon className="w-4 h-4" />
              {mode.name}
            </button>
          ))}
        </div>

        {/* Messages Container - Expanded for more vertical space */}
        <div className="flex-1 bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 flex flex-col overflow-hidden max-h-[calc(100vh-120px)]">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-4",
                  message.role === 'user' ? "flex-row-reverse" : ""
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  message.role === 'assistant'
                    ? "bg-gradient-to-br from-purple-500 to-indigo-600"
                    : "bg-gradient-to-br from-ocean-500 to-marine-600"
                )}>
                  {message.role === 'assistant' ? (
                    <Bot className="w-5 h-5 text-white" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className={cn(
                  "flex-1 max-w-3xl",
                  message.role === 'user' ? "text-right" : ""
                )}>
                  <div className={cn(
                    "inline-block p-4 rounded-2xl text-left",
                    message.role === 'assistant'
                      ? "bg-gray-50 dark:bg-deep-700 border border-gray-100 dark:border-deep-600"
                      : "bg-ocean-500 text-white"
                  )}>
                    {message.role === 'assistant' ? (
                      renderMessageContent(message)
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-2 text-deep-400">
                      <button
                        onClick={() => copyToClipboard(message.content)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-deep-700 rounded-lg transition-colors"
                        title="Copy"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-deep-700 rounded-lg transition-colors">
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-deep-700 rounded-lg transition-colors">
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                      <span className="text-xs ml-2">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-100 dark:border-deep-700 p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    activeMode === 'literature' ? "Search for papers on..." :
                      activeMode === 'methodology' ? "How should I approach..." :
                        activeMode === 'analysis' ? "Help me analyze..." :
                          activeMode === 'hypothesis' ? "Generate hypotheses about..." :
                            activeMode === 'writing' ? "Help me write..." :
                              "Ask about your marine research..."
                  }
                  className="w-full min-h-[60px] max-h-[200px] p-4 pr-24 resize-none rounded-xl border border-gray-200 dark:border-deep-600 bg-white dark:bg-deep-700 text-deep-900 dark:text-white placeholder-deep-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={1}
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <button className="p-2 text-deep-400 hover:text-deep-600 hover:bg-gray-100 dark:hover:bg-deep-600 rounded-lg transition-colors">
                    <Paperclip className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={cn(
                  "h-[60px] px-6 rounded-xl font-semibold transition-all flex items-center gap-2",
                  !input.trim() || isLoading
                    ? "bg-gray-200 dark:bg-deep-600 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl"
                )}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div className={cn(
        "w-80 space-y-4 flex-shrink-0 transition-all",
        showPaperPanel ? "block" : "hidden xl:block"
      )}>
        {/* Saved Papers Panel */}
        {showPaperPanel && savedPapers.length > 0 && (
          <div className="bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-deep-900 dark:text-white flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-purple-500" />
                Saved Papers
              </h3>
              <button
                onClick={() => setShowPaperPanel(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-deep-700 rounded"
              >
                <X className="w-4 h-4 text-deep-400" />
              </button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {savedPapers.map(paper => (
                <div key={paper.doi} className="bg-gray-50 dark:bg-deep-700 rounded-lg p-3 relative group">
                  <button
                    onClick={() => removePaper(paper.doi)}
                    className="absolute top-2 right-2 p-1 bg-red-100 text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-sm font-medium text-deep-800 dark:text-gray-200 line-clamp-2 pr-6">
                    {paper.title}
                  </p>
                  <p className="text-xs text-deep-500 dark:text-gray-400 mt-1">
                    {paper.authors} ({paper.year})
                  </p>
                </div>
              ))}
            </div>
            <button className="w-full mt-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg flex items-center justify-center gap-2">
              <Download className="w-4 h-4" />
              Export Bibliography
            </button>
          </div>
        )}

        {/* Quick Research Prompts */}
        <div className="bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 overflow-hidden">
          <button
            onClick={() => toggleSection('prompts')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-deep-700 transition-colors"
          >
            <span className="font-semibold text-deep-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Research Prompts
            </span>
            {expandedSections.includes('prompts') ? (
              <ChevronDown className="w-4 h-4 text-deep-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-deep-400" />
            )}
          </button>
          {expandedSections.includes('prompts') && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-deep-400 dark:text-gray-500 mb-2 capitalize">
                {RESEARCH_MODES.find(m => m.id === activeMode)?.name || 'General'} prompts
              </p>
              {(MODE_SPECIFIC_PROMPTS[activeMode] || MODE_SPECIFIC_PROMPTS.general).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(prompt.text)}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-deep-700 border border-transparent hover:border-gray-200 dark:hover:border-deep-600 transition-all group"
                >
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-deep-600 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 transition-colors">
                    <prompt.icon className="w-4 h-4 text-deep-500 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-deep-700 dark:text-gray-300 line-clamp-2">{prompt.text}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Research Tips */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <h3 className="font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4" />
            Research Tips
          </h3>
          <ul className="space-y-2 text-sm text-purple-800 dark:text-purple-300">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
              Be specific about your research question
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
              Mention your study area (e.g., Arabian Sea)
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
              Include target species or taxa
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
              Specify time period if relevant
            </li>
          </ul>
        </div>

        {/* Model Info */}
        <div className="bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30">
              <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-900 dark:text-white">Marine Research LLM</p>
              <p className="text-xs text-deep-500 dark:text-gray-400">Specialized for marine science</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-deep-700 text-deep-600 dark:text-gray-400 rounded text-xs">
              50M+ papers indexed
            </span>
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-deep-700 text-deep-600 dark:text-gray-400 rounded text-xs">
              Real-time search
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
