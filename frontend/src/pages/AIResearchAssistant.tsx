import { useState, useRef, useEffect } from 'react';
import {
  Brain, Send, Paperclip, Bot, User, Copy, ThumbsUp, ThumbsDown,
  RotateCcw, Lightbulb, BarChart3, Dna, FileText,
  BookOpen, Microscope, Globe, TrendingUp, GraduationCap,
  Download, Bookmark, ExternalLink, Sparkles,
  ChevronRight, ChevronDown, X, Loader2, CheckCircle,
  BookMarked, FlaskConical, Target, Compass, MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { aiService } from '@/services/api';

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
  };
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

const QUICK_RESEARCH_PROMPTS = [
  { icon: BookOpen, text: 'Find recent papers on coral reef bleaching in Indian Ocean', category: 'Literature' },
  { icon: Microscope, text: 'Suggest methodology for eDNA sampling in estuaries', category: 'Methods' },
  { icon: TrendingUp, text: 'Analyze fish population trends from my data', category: 'Analysis' },
  { icon: Lightbulb, text: 'Generate hypotheses for declining fish stocks', category: 'Hypothesis' },
  { icon: FileText, text: 'Help write abstract for marine biodiversity study', category: 'Writing' },
  { icon: Target, text: 'Identify gaps in mangrove ecosystem research', category: 'Review' },
  { icon: Dna, text: 'Interpret eDNA metabarcoding results', category: 'Analysis' },
  { icon: Globe, text: 'Compare species richness across study sites', category: 'Analysis' },
];

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

export default function AIResearchAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Welcome to the AI Research Assistant! I'm here to help with your marine research. I can:\n\n• **Search literature** - Find relevant papers and summarize findings\n• **Suggest methodologies** - Recommend techniques for your research questions\n• **Analyze data** - Help interpret your marine datasets\n• **Generate hypotheses** - Brainstorm research ideas based on your data\n• **Assist writing** - Help draft abstracts, methods sections, and more\n\nWhat would you like to explore today?",
      timestamp: new Date(),
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeMode, setActiveMode] = useState('general');
  const [showPaperPanel, setShowPaperPanel] = useState(false);
  const [savedPapers, setSavedPapers] = useState<Paper[]>([]);
  const [expandedSections, setExpandedSections] = useState<string[]>(['prompts']);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only scroll to bottom when new messages are added, not on initial load
  const prevMessagesLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      scrollToBottom();
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
    // Simulate different response types based on mode
    const baseId = (Date.now() + 1).toString();
    
    if (mode === 'literature' || query.toLowerCase().includes('paper') || query.toLowerCase().includes('literature') || query.toLowerCase().includes('find')) {
      return {
        id: baseId,
        role: 'assistant',
        content: `I found several relevant papers for your query. Here are the top results:\n\n📚 **Literature Search Results**\n\nBased on your query about "${query.slice(0, 50)}...", I've identified ${SAMPLE_PAPERS.length} highly relevant papers from recent marine science literature.`,
        timestamp: new Date(),
        type: 'literature',
        metadata: {
          papers: SAMPLE_PAPERS.map(p => ({
            ...p,
            relevance: Math.floor(Math.random() * 20) + 75
          }))
        }
      };
    }
    
    if (mode === 'methodology' || query.toLowerCase().includes('method') || query.toLowerCase().includes('how to')) {
      return {
        id: baseId,
        role: 'assistant',
        content: `## Recommended Methodology\n\nBased on your research question, here's a suggested approach:\n\n### 1. Study Design\n- **Type**: Comparative field study with temporal sampling\n- **Duration**: 12-month monitoring period recommended\n- **Replication**: Minimum 3 sites per habitat type\n\n### 2. Sampling Protocol\n- Collect water samples at 3 depths (surface, mid-water, benthic)\n- Use sterile 1L Nalgene bottles\n- Filter through 0.45μm membrane filters within 6 hours\n- Store at -20°C until DNA extraction\n\n### 3. Analysis Methods\n- DNA extraction: DNeasy PowerWater Kit\n- Amplification: COI and 12S rRNA markers\n- Sequencing: Illumina MiSeq paired-end 2×300bp\n- Bioinformatics: DADA2 pipeline with MIDORI2 database\n\n### 4. Statistical Analysis\n- Alpha diversity: Shannon, Simpson indices\n- Beta diversity: NMDS ordination, PERMANOVA\n- Environmental correlations: CCA/RDA\n\nWould you like me to elaborate on any of these steps or suggest alternative approaches?`,
        timestamp: new Date(),
        type: 'methodology',
        metadata: {
          suggestions: [
            'Add control sites for comparison',
            'Consider seasonal variation in sampling',
            'Include environmental metadata collection',
            'Plan for technical replicates'
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
      const response = await aiService.chat(query, { mode });
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
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await generateResearchResponse(input, activeMode);
      setMessages(prev => [...prev, response]);
    } catch (error) {
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errorResponse]);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
        {paper.citations && (
          <span className="text-xs text-deep-500 dark:text-gray-400">
            📖 {paper.citations} citations
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
          <button
            onClick={() => savePaper(paper)}
            className="ml-auto text-xs text-coral-600 hover:text-coral-700 dark:text-coral-400 flex items-center gap-1"
          >
            <Bookmark className="w-3 h-3" />
            Save
          </button>
        )}
      </div>
    </div>
  );

  const renderMessageContent = (message: Message) => {
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
            <button
              onClick={() => setShowPaperPanel(!showPaperPanel)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors",
                showPaperPanel 
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : "bg-gray-100 text-gray-700 dark:bg-deep-700 dark:text-gray-300 hover:bg-gray-200"
              )}
            >
              <BookMarked className="w-4 h-4" />
              Saved ({savedPapers.length})
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

        {/* Messages Container */}
        <div className="flex-1 bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 flex flex-col overflow-hidden">
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
            
            {isLoading && (
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="p-4 bg-gray-50 dark:bg-deep-700 rounded-2xl border border-gray-100 dark:border-deep-600">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <div>
                      <span className="text-sm text-deep-700 dark:text-gray-300">
                        {activeMode === 'literature' ? 'Searching literature databases...' :
                         activeMode === 'methodology' ? 'Generating methodology recommendations...' :
                         activeMode === 'analysis' ? 'Analyzing your query...' :
                         activeMode === 'hypothesis' ? 'Generating hypotheses...' :
                         activeMode === 'writing' ? 'Drafting content...' :
                         'Processing your request...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
              {QUICK_RESEARCH_PROMPTS.map((prompt, idx) => (
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
                    <p className="text-xs text-deep-400 dark:text-gray-500">{prompt.category}</p>
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
