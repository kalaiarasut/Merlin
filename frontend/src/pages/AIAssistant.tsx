import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sparkles, Send, Mic, Paperclip, Bot, User, Copy, ThumbsUp,
  ThumbsDown, RotateCcw, Lightbulb, Database, Fish, Map, BarChart3,
  Dna, Droplets, Zap, ChevronRight, Brain, Loader
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { aiService } from '@/services/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  { icon: Fish, text: 'Species distribution in Arabian Sea', category: 'Species' },
  { icon: Droplets, text: 'Water quality trends last 6 months', category: 'Oceanography' },
  { icon: Dna, text: 'eDNA analysis for coral reefs', category: 'eDNA' },
  { icon: BarChart3, text: 'Generate biodiversity report', category: 'Analytics' },
  { icon: Map, text: 'Show endangered species hotspots', category: 'Mapping' },
  { icon: Database, text: 'Compare survey data across sites', category: 'Data' },
];

const SAMPLE_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: "Hello! I'm your AI assistant for marine research. I can help you explore species data, analyze oceanographic patterns, interpret eDNA sequences, and generate reports. What would you like to know?",
    timestamp: new Date(Date.now() - 60000),
  },
];

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      // Call real AI service
      const response = await aiService.chat(input, {
        recentMessages: messages.slice(-5).map(m => ({ role: m.role, content: m.content }))
      });
      
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response || 'I apologize, but I could not generate a response. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('AI chat error:', error);
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again or check your connection.',
        timestamp: new Date(),
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

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-ocean-500 to-marine-600">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-deep-900">AI Research Assistant</h1>
              <p className="text-sm text-deep-500">Powered by advanced marine language models</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" dot>Online</Badge>
            <Button variant="outline" size="sm">
              <RotateCcw className="w-4 h-4 mr-1" />
              New Chat
            </Button>
          </div>
        </div>

        {/* Messages Container */}
        <Card variant="default" className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((message) => (
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
                    <>
                      <AvatarFallback className="bg-gradient-to-br from-ocean-500 to-marine-600">
                        <Bot className="w-5 h-5 text-white" />
                      </AvatarFallback>
                    </>
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
                      ? "bg-gray-50 border border-gray-100" 
                      : "bg-ocean-500 text-white"
                  )}>
                    <div className={cn(
                      "prose prose-sm max-w-none",
                      message.role === 'user' && "prose-invert"
                    )}>
                      {message.content.split('\n').map((line, i) => (
                        <p key={i} className={cn(
                          "mb-2 last:mb-0",
                          line.startsWith('**') && "font-semibold"
                        )}>
                          {line}
                        </p>
                      ))}
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
            
            {isLoading && (
              <div className="flex gap-4">
                <Avatar className="w-10 h-10 ring-2 ring-ocean-200">
                  <AvatarFallback className="bg-gradient-to-br from-ocean-500 to-marine-600">
                    <Bot className="w-5 h-5 text-white" />
                  </AvatarFallback>
                </Avatar>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2">
                    <Loader className="w-4 h-4 animate-spin text-ocean-500" />
                    <span className="text-sm text-deep-500">Analyzing your query...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input Area */}
          <div className="border-t border-gray-100 p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about species, oceanography, eDNA, or generate reports..."
                  className="min-h-[60px] max-h-[200px] pr-24 resize-none"
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

      {/* Side Panel */}
      <div className="hidden xl:block w-80 space-y-4">
        {/* Quick Prompts */}
        <Card variant="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-coral-500" />
              Quick Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickPrompt(prompt.text)}
                className="w-full flex items-center gap-3 p-3 text-left rounded-xl hover:bg-white/50 border border-transparent hover:border-gray-200 transition-all group"
              >
                <div className="p-2 rounded-lg bg-gray-100 group-hover:bg-ocean-100 transition-colors">
                  <prompt.icon className="w-4 h-4 text-deep-500 group-hover:text-ocean-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-deep-700 truncate">{prompt.text}</p>
                  <p className="text-xs text-deep-400">{prompt.category}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-deep-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Capabilities */}
        <Card variant="default">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-ocean-500" />
              Capabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-marine-500 mt-0.5" />
                <span className="text-deep-600">Natural language data queries</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-marine-500 mt-0.5" />
                <span className="text-deep-600">Automated report generation</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-marine-500 mt-0.5" />
                <span className="text-deep-600">Species identification help</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-marine-500 mt-0.5" />
                <span className="text-deep-600">eDNA sequence interpretation</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-marine-500 mt-0.5" />
                <span className="text-deep-600">Trend analysis & predictions</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Model Info */}
        <Card variant="bordered">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-ocean-100 to-marine-100">
                <Brain className="w-5 h-5 text-ocean-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-deep-900">Marine LLM v2.1</p>
                <p className="text-xs text-deep-500">Trained on 50M+ marine records</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
