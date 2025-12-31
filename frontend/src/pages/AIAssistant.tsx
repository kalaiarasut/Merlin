import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Send, Mic, Paperclip, Bot, User, Copy, ThumbsUp,
  ThumbsDown, Lightbulb, ChevronRight, Brain, Loader,
  Plus, Trash2, MessageCircle, History, ChevronLeft,
  Wifi, WifiOff, Sparkles, Database, Globe, HelpCircle, ChevronDown, Square
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { aiService } from '@/services/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface ProgressState {
  stage: string;
  current: number;
  total: number;
  message: string;
  eta_seconds?: number;
}

// Shared localStorage key - SAME as FloatingAIChat
const CHAT_STORAGE_KEY = 'cmlre-ai-chats';
const FREQUENT_PROMPTS_KEY = 'cmlre-frequent-prompts';

// Load chats from localStorage
const loadChats = (): ChatSession[] => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
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
    console.error('Failed to load chats:', e);
  }
  return [];
};

// Save chats to localStorage
const saveChats = (chats: ChatSession[]) => {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  } catch (e) {
    console.error('Failed to save chats:', e);
  }
};

// Load frequent prompts from localStorage
const loadFrequentPrompts = (): { text: string; count: number }[] => {
  try {
    const stored = localStorage.getItem(FREQUENT_PROMPTS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load frequent prompts:', e);
  }
  return [];
};

// Save/update frequent prompts
const updateFrequentPrompts = (prompt: string) => {
  try {
    const prompts = loadFrequentPrompts();
    const existing = prompts.find(p => p.text.toLowerCase() === prompt.toLowerCase());

    if (existing) {
      existing.count++;
    } else {
      prompts.push({ text: prompt, count: 1 });
    }

    // Sort by count and keep top 10
    prompts.sort((a, b) => b.count - a.count);
    const top10 = prompts.slice(0, 10);

    localStorage.setItem(FREQUENT_PROMPTS_KEY, JSON.stringify(top10));
  } catch (e) {
    console.error('Failed to save frequent prompt:', e);
  }
};

// Create new chat session
const createNewChat = (): ChatSession => ({
  id: Date.now().toString(),
  title: 'New Chat',
  messages: [
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your AI assistant for marine research. I can help you explore species data, analyze oceanographic patterns, interpret eDNA sequences, and generate reports. What would you like to know?",
      timestamp: new Date(),
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
});

export default function AIAssistant() {
  const [searchParams] = useSearchParams();
  const chatIdFromUrl = searchParams.get('chatId');

  const [chats, setChats] = useState<ChatSession[]>(() => {
    const loaded = loadChats();
    return loaded.length > 0 ? loaded : [createNewChat()];
  });

  const [activeChatId, setActiveChatId] = useState<string>(() => {
    const loaded = loadChats();
    if (chatIdFromUrl && loaded.find(c => c.id === chatIdFromUrl)) {
      return chatIdFromUrl;
    }
    return loaded.length > 0 ? loaded[0].id : createNewChat().id;
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [frequentPrompts, setFrequentPrompts] = useState<{ text: string; count: number }[]>([]);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
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

  // Fetch AI system status
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => {
      try {
        const response = await fetch('http://localhost:8000/ai/status');
        return response.json();
      } catch {
        return { internet: false, ollama: false, groq: false, fishbase: false, active_provider: 'offline', mode: 'offline' };
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  // Load frequent prompts on mount
  useEffect(() => {
    setFrequentPrompts(loadFrequentPrompts());
  }, []);

  // Save chats when they change
  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  // Update activeChatId if URL param changes
  useEffect(() => {
    if (chatIdFromUrl && chats.find(c => c.id === chatIdFromUrl)) {
      setActiveChatId(chatIdFromUrl);
    }
  }, [chatIdFromUrl, chats]);

  const updateChatTitle = (chatId: string, firstUserMessage: string) => {
    const title = firstUserMessage.slice(0, 30) + (firstUserMessage.length > 30 ? '...' : '');
    setChats(prev => prev.map(chat =>
      chat.id === chatId ? { ...chat, title } : chat
    ));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !activeChat) return;

    // Track this prompt for frequently used
    updateFrequentPrompts(input.trim());
    setFrequentPrompts(loadFrequentPrompts());

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setChats(prev => prev.map(chat =>
      chat.id === activeChatId
        ? {
          ...chat,
          messages: [...chat.messages, userMessage],
          updatedAt: new Date()
        }
        : chat
    ));

    if (activeChat.messages.filter(m => m.role === 'user').length === 0) {
      updateChatTitle(activeChatId, input);
    }

    setInput('');
    setIsLoading(true);

    // Generate request ID for progress tracking
    const requestId = `chat-${Date.now()}`;
    setCurrentRequestId(requestId);

    // Start polling for progress
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/chat/progress-status/${requestId}`);
        const data = await res.json();
        if (data.stage && data.stage !== 'not_found') {
          setProgress(data);
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 500);

    try {
      // Try streaming first - create a temporary message that updates as tokens arrive
      let fullContent = '';
      const streamingMsgId = (Date.now() + 1).toString();

      // Add a temporary assistant message that we'll update
      setChats(prev => prev.map(chat =>
        chat.id === activeChatId
          ? {
            ...chat,
            messages: [...chat.messages, {
              id: streamingMsgId,
              role: 'assistant' as const,
              content: '',
              timestamp: new Date(),
            }],
            updatedAt: new Date()
          }
          : chat
      ));

      try {
        for await (const chunk of aiService.chatStream(input, undefined, requestId, selectedProvider)) {
          if (chunk.type === 'token') {
            fullContent += chunk.content;
            // Update the streaming message content in real-time
            setChats(prev => prev.map(chat =>
              chat.id === activeChatId
                ? {
                  ...chat,
                  messages: chat.messages.map(msg =>
                    msg.id === streamingMsgId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                }
                : chat
            ));
          } else if (chunk.type === 'done') {
            fullContent = chunk.content;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.content);
          }
        }
      } catch (streamError) {
        // Fallback to regular non-streaming chat if streaming fails
        console.warn('Streaming failed, falling back to regular chat:', streamError);
        const response = await aiService.chat(input, undefined, requestId, selectedProvider);
        fullContent = response.response || '';
      }

      // Final update with complete content
      setChats(prev => prev.map(chat =>
        chat.id === activeChatId
          ? {
            ...chat,
            messages: chat.messages.map(msg =>
              msg.id === streamingMsgId
                ? { ...msg, content: fullContent || "I'm sorry, I couldn't process that request." }
                : msg
            ),
            updatedAt: new Date()
          }
          : chat
      ));
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting. Make sure the AI service is running.",
        timestamp: new Date(),
      };
      setChats(prev => prev.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: [...chat.messages, errorMessage] }
          : chat
      ));
    } finally {
      clearInterval(pollInterval);
      setIsLoading(false);
      setProgress(null);
      setCurrentRequestId(null);
      setStreamingContent('');
    }
  };

  const handleCancel = async () => {
    if (!currentRequestId) return;

    try {
      await fetch(`http://localhost:8000/chat/cancel/${currentRequestId}`, {
        method: 'POST'
      });
      setIsLoading(false);
      setProgress(null);

      const cancelledMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Request cancelled.',
        timestamp: new Date(),
      };
      setChats(prev => prev.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: [...chat.messages, cancelledMessage] }
          : chat
      ));
    } catch (error) {
      console.error('Cancel error:', error);
    } finally {
      setCurrentRequestId(null);
      setStreamingContent('');
    }
  };

  const handleNewChat = () => {
    const newChat = createNewChat();
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setShowHistory(false);
  };

  const handleDeleteChat = (chatId: string) => {
    setChats(prev => {
      const filtered = prev.filter(c => c.id !== chatId);
      if (filtered.length === 0) {
        const newChat = createNewChat();
        return [newChat];
      }
      if (chatId === activeChatId) {
        setActiveChatId(filtered[0].id);
      }
      return filtered;
    });
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

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {showHistory && (
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="p-2 rounded-xl bg-gradient-to-br from-ocean-500 to-marine-600">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-deep-900 dark:text-white">AI Research Assistant</h1>
              <p className="text-sm text-deep-500 dark:text-gray-400">Powered by advanced marine language models</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" dot>Online</Badge>
            <Badge variant="outline" className="text-xs">llama3.2:1b</Badge>
            <button
              onClick={() => setShowHowItWorks(!showHowItWorks)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="How It Works"
            >
              <HelpCircle className="w-5 h-5 text-deep-600" />
            </button>
            <button
              onClick={handleNewChat}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="New Chat"
            >
              <Plus className="w-5 h-5 text-deep-600" />
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showHistory ? "bg-ocean-100 text-ocean-600" : "hover:bg-gray-100 text-deep-600"
              )}
              title="Chat History"
            >
              <History className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Status Bar */}
        <div className="mb-4 flex items-center gap-4 p-3 bg-gradient-to-r from-ocean-50 to-marine-50 dark:from-gray-900 dark:to-gray-800 rounded-xl border border-ocean-100 dark:border-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2">
            {aiStatus?.internet ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm font-medium">
              {aiStatus?.internet ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="h-4 w-px bg-gray-300" />
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-ocean-500" />
            <span className="text-sm">Provider:</span>
            <div className="relative group z-50">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/50 border border-gray-200 hover:border-ocean-300 transition-colors text-xs font-medium text-deep-700">
                {selectedProvider === 'auto' && 'Auto (Groq)'}
                {selectedProvider === 'groq' && 'Groq (Cloud)'}
                {selectedProvider === 'ollama' && 'Ollama (Local)'}
                {selectedProvider === 'ollama_agent' && 'Ollama (Agentic)'}
                <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </button>
              {/* Dropdown with padding bridge for hover stability */}
              <div className="absolute top-full left-0 pt-2 w-48 hidden group-hover:block z-50">
                <div className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                  <button onClick={() => { setSelectedProvider('auto'); localStorage.setItem('cmlre-llm-provider', 'auto'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <span className="font-medium">Auto (Groq)</span>
                    <span className="block text-[10px] text-gray-400">Best performance</span>
                  </button>
                  <button onClick={() => { setSelectedProvider('groq'); localStorage.setItem('cmlre-llm-provider', 'groq'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <span className="font-medium">Groq (Cloud)</span>
                    <span className="block text-[10px] text-gray-400">Fastest, uses internet</span>
                  </button>
                  <button onClick={() => { setSelectedProvider('ollama'); localStorage.setItem('cmlre-llm-provider', 'ollama'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <span className="font-medium">Ollama (Local)</span>
                    <span className="block text-[10px] text-gray-400">Offline, context-based</span>
                  </button>
                  <button onClick={() => { setSelectedProvider('ollama_agent'); localStorage.setItem('cmlre-llm-provider', 'ollama_agent'); }} className="w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors border-t border-gray-100">
                    <span className="font-medium">Ollama (Agentic)</span>
                    <span className="block text-[10px] text-emerald-500">Local tools (Experimental)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="h-4 w-px bg-gray-300" />
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-marine-500" />
            <span className="text-sm">Local DB</span>
            {aiStatus?.fishbase && (
              <>
                <span className="text-gray-400">+</span>
                <Globe className="w-4 h-4 text-coral-500" />
                <span className="text-sm">FishBase</span>
              </>
            )}
          </div>
          {aiStatus?.groq && (
            <>
              <div className="h-4 w-px bg-gray-300" />
              <div className="flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-purple-600 font-medium">Groq Active</span>
              </div>
            </>
          )}
        </div>

        {/* How It Works Panel */}
        {showHowItWorks && (
          <Card variant="glass" className="mb-4 animate-in slide-in-from-top-2">
            <CardHeader className="py-3 cursor-pointer" onClick={() => setShowHowItWorks(false)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-ocean-500" />
                  How the AI System Works
                </CardTitle>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <WifiOff className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                  <h4 className="font-medium text-sm">Offline Mode</h4>
                  <p className="text-xs text-gray-500 mt-1">Ollama (Local) + Your Database</p>
                  <Badge variant="outline" className="mt-2 text-xs">Always Available</Badge>
                </div>
                <div className="p-4 bg-ocean-50 rounded-xl border border-ocean-200">
                  <Wifi className="w-8 h-8 mx-auto mb-2 text-ocean-500" />
                  <h4 className="font-medium text-sm">Online Mode</h4>
                  <p className="text-xs text-gray-500 mt-1">Ollama + FishBase API</p>
                  <Badge variant="secondary" className="mt-2 text-xs">Enhanced Data</Badge>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                  <h4 className="font-medium text-sm">Premium Mode</h4>
                  <p className="text-xs text-gray-500 mt-1">Groq + Web Search</p>
                  <Badge className="mt-2 text-xs bg-purple-500">Best Quality</Badge>
                </div>
              </div>

              {/* Visual Flowchart */}
              <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
                <h5 className="text-xs font-semibold text-gray-700 mb-3 text-center">Decision Flow</h5>
                <div className="flex flex-col items-center gap-2 text-xs">
                  {/* Start */}
                  <div className="px-3 py-1.5 bg-ocean-100 text-ocean-700 rounded-full font-medium">
                    Your Query
                  </div>
                  <div className="w-px h-4 bg-gray-300" />

                  {/* First Decision */}
                  <div className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg border border-yellow-300">
                    Is Internet Online?
                  </div>

                  {/* Branches */}
                  <div className="flex items-start gap-8 mt-1">
                    {/* No Branch - Offline */}
                    <div className="flex flex-col items-center">
                      <span className="text-red-500 text-xs font-medium">No</span>
                      <div className="w-px h-3 bg-gray-300" />
                      <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg border">
                        <WifiOff className="w-3 h-3 inline mr-1" />
                        Ollama + Local DB
                      </div>
                    </div>

                    {/* Yes Branch */}
                    <div className="flex flex-col items-center">
                      <span className="text-green-500 text-xs font-medium">Yes</span>
                      <div className="w-px h-3 bg-gray-300" />
                      <div className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg border border-yellow-300">
                        Groq API Key Set?
                      </div>
                      <div className="flex items-start gap-6 mt-2">
                        {/* No Groq */}
                        <div className="flex flex-col items-center">
                          <span className="text-red-500 text-xs">No</span>
                          <div className="w-px h-2 bg-gray-300" />
                          <div className="px-2 py-1 bg-ocean-100 text-ocean-700 rounded-lg border text-xs">
                            <Wifi className="w-3 h-3 inline mr-1" />
                            Ollama + FishBase
                          </div>
                        </div>
                        {/* Yes Groq */}
                        <div className="flex flex-col items-center">
                          <span className="text-green-500 text-xs">Yes</span>
                          <div className="w-px h-2 bg-gray-300" />
                          <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg border text-xs">
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            Groq + Web
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600">
                  <strong>Current:</strong> {aiStatus?.groq ? '🟣 Premium Mode (Groq)' :
                    aiStatus?.internet ? '🔵 Online Mode (Ollama + FishBase)' : '⚪ Offline Mode (Local Only)'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* History Panel (Overlay like floating chat) */}
        {showHistory && (
          <Card variant="default" className="mb-4 max-h-80 overflow-hidden animate-in slide-in-from-top-2">
            <CardHeader className="py-3 px-4 border-b bg-gray-50">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <History className="w-4 h-4 text-ocean-500" />
                Chat History
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-60 p-2 space-y-1">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors",
                    chat.id === activeChatId
                      ? "bg-ocean-100 border border-ocean-200"
                      : "hover:bg-gray-100"
                  )}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setShowHistory(false);
                  }}
                >
                  <MessageCircle className="w-4 h-4 text-ocean-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {chat.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatTime(chat.updatedAt)} · {chat.messages.length} messages
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChat(chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 rounded transition-all"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Messages Container */}
        <Card variant="default" className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeChat?.messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-4",
                  message.role === 'user' ? "flex-row-reverse" : ""
                )}
              >
                <Avatar className={cn(
                  "w-10 h-10 flex-shrink-0",
                  message.role === 'assistant' ? "ring-2 ring-ocean-200" : "ring-2 ring-marine-200"
                )}>
                  {message.role === 'assistant' ? (
                    <AvatarFallback className="bg-gradient-to-br from-ocean-500 to-marine-600">
                      <Bot className="w-5 h-5 text-white" />
                    </AvatarFallback>
                  ) : (
                    <AvatarFallback className="bg-gradient-to-br from-marine-500 to-marine-600">
                      <User className="w-5 h-5 text-white" />
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className={cn(
                  "flex-1 max-w-2xl",
                  message.role === 'user' ? "text-right" : ""
                )}>
                  <div className={cn(
                    "inline-block p-4 rounded-2xl text-left",
                    message.role === 'assistant'
                      ? "bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                      : "bg-ocean-500 text-white"
                  )}>
                    <div className={cn(
                      "prose prose-sm max-w-none",
                      message.role === 'user' ? "prose-invert" : "dark:prose-invert"
                    )}>
                      {/* Show loading spinner if message is empty and we're loading */}
                      {message.role === 'assistant' && !message.content && isLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader className="w-4 h-4 animate-spin text-ocean-500" />
                          <span className="text-sm text-deep-500">
                            {progress?.stage === 'scraping_fishbase'
                              ? 'Fetching FishBase...'
                              : progress?.stage === 'processing_llm'
                                ? 'Processing with AI...'
                                : 'Analyzing your query...'}
                          </span>
                          <button
                            onClick={handleCancel}
                            className="ml-2 text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                          >
                            <Square className="w-3 h-3" />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        message.content.split('\n').map((line, i) => (
                          <p key={i} className={cn(
                            "mb-2 last:mb-0",
                            line.startsWith('**') && "font-semibold"
                          )}>
                            {line}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-2 text-deep-400">
                      <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
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
          </CardContent>

          <div className="border-t border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about species, oceanography, eDNA, or generate reports..."
                  className="min-h-[60px] max-h-[200px] pr-24 resize-none dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                  rows={1}
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <button className="p-2 text-deep-400 hover:text-deep-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-deep-400 hover:text-deep-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Mic className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                variant="premium"
                size="lg"
                className="h-[60px] px-6"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-xs text-deep-400 mt-2 text-center">
              AI responses are generated based on your marine database. Always verify critical findings.
            </p>
          </div>
        </Card>
      </div>

      {/* Right Side Panel */}
      <div className="hidden xl:block w-80 space-y-4">
        <Card variant="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-coral-500" />
              Frequently Used Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {frequentPrompts.length > 0 ? (
              frequentPrompts.slice(0, 8).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(prompt.text)}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-xl hover:bg-white/50 border border-transparent hover:border-gray-200 transition-all group"
                >
                  <div className="p-2 rounded-lg bg-gray-100 group-hover:bg-ocean-100 transition-colors">
                    <MessageCircle className="w-4 h-4 text-deep-500 group-hover:text-ocean-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-deep-700 truncate">{prompt.text}</p>
                    <p className="text-xs text-deep-400">Used {prompt.count} time{prompt.count > 1 ? 's' : ''}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-deep-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))
            ) : (
              <div className="text-center py-6 text-deep-400">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No prompts yet</p>
                <p className="text-xs mt-1">Your frequently used prompts will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
