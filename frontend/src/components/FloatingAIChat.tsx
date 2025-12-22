import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    MessageSquare, X, Send, Loader2, Bot, User, Maximize2,
    Plus, Trash2, ChevronLeft, History, MessageCircle
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

// Local storage key
const CHAT_STORAGE_KEY = 'cmlre-ai-chats';

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

// Create new chat session
const createNewChat = (): ChatSession => ({
    id: Date.now().toString(),
    title: 'New Chat',
    messages: [
        {
            id: '1',
            role: 'assistant',
            content: "Hi! I'm your marine research assistant. Ask me about species, oceanography, or data analysis.",
            timestamp: new Date(),
        }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
});

export default function FloatingAIChat() {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [chats, setChats] = useState<ChatSession[]>(() => {
        const loaded = loadChats();
        return loaded.length > 0 ? loaded : [createNewChat()];
    });
    const [activeChatId, setActiveChatId] = useState<string>(() => {
        const loaded = loadChats();
        return loaded.length > 0 ? loaded[0].id : createNewChat().id;
    });
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

    // Save chats when they change
    useEffect(() => {
        saveChats(chats);
    }, [chats]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [activeChat?.messages]);

    const updateChatTitle = (chatId: string, firstUserMessage: string) => {
        // Generate title from first user message
        const title = firstUserMessage.slice(0, 30) + (firstUserMessage.length > 30 ? '...' : '');
        setChats(prev => prev.map(chat =>
            chat.id === chatId ? { ...chat, title } : chat
        ));
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading || !activeChat) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date(),
        };

        // Update chat with user message
        setChats(prev => prev.map(chat =>
            chat.id === activeChatId
                ? {
                    ...chat,
                    messages: [...chat.messages, userMessage],
                    updatedAt: new Date()
                }
                : chat
        ));

        // Update title if this is the first user message
        if (activeChat.messages.filter(m => m.role === 'user').length === 0) {
            updateChatTitle(activeChatId, input);
        }

        setInput('');
        setIsLoading(true);

        try {
            const response = await aiService.chat(input);

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.response || "I'm sorry, I couldn't process that request.",
                timestamp: new Date(),
            };

            setChats(prev => prev.map(chat =>
                chat.id === activeChatId
                    ? {
                        ...chat,
                        messages: [...chat.messages, assistantMessage],
                        updatedAt: new Date()
                    }
                    : chat
            ));
        } catch (error) {
            console.error('AI chat error:', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "Sorry, I'm having trouble connecting. Make sure Ollama is running.",
                timestamp: new Date(),
            };
            setChats(prev => prev.map(chat =>
                chat.id === activeChatId
                    ? { ...chat, messages: [...chat.messages, errorMessage] }
                    : chat
            ));
        } finally {
            setIsLoading(false);
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

    const handleMaximize = () => {
        setIsOpen(false);
        navigate(`/ai-assistant?chatId=${activeChatId}`);
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

    // Floating button when closed
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-ocean-500 to-ocean-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 group"
                title="AI Assistant"
            >
                <MessageSquare className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[520px] transition-all duration-300 animate-in slide-in-from-bottom-4 fade-in">
            <Card className="h-full flex flex-col overflow-hidden border-ocean-200 shadow-2xl">
                {/* Header */}
                <CardHeader className="py-3 px-4 bg-gradient-to-r from-ocean-500 to-ocean-600 text-white flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {showHistory && (
                                <button
                                    onClick={() => setShowHistory(false)}
                                    className="p-1 hover:bg-white/20 rounded transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                            )}
                            <Bot className="w-5 h-5" />
                            <CardTitle className="text-sm font-medium">
                                {showHistory ? 'Chat History' : 'AI Assistant'}
                            </CardTitle>
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleNewChat}
                                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                title="New Chat"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setShowHistory(!showHistory)}
                                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                title="Chat History"
                            >
                                <History className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleMaximize}
                                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                title="Open Full View"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </CardHeader>

                {showHistory ? (
                    /* Chat History Panel */
                    <CardContent className="flex-1 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-900">
                        <div className="space-y-1">
                            {chats.map((chat) => (
                                <div
                                    key={chat.id}
                                    className={cn(
                                        "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                                        chat.id === activeChatId
                                            ? "bg-ocean-100 border border-ocean-200 dark:bg-ocean-900/30 dark:border-ocean-800"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-800"
                                    )}
                                    onClick={() => {
                                        setActiveChatId(chat.id);
                                        setShowHistory(false);
                                    }}
                                >
                                    <MessageCircle className="w-4 h-4 text-ocean-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                            {chat.title}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {formatTime(chat.updatedAt)} · {chat.messages.length} messages
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteChat(chat.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                                        title="Delete Chat"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                ) : (
                    <>
                        {/* Messages */}
                        <CardContent className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 dark:bg-gray-900">
                            {activeChat?.messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "flex gap-2",
                                        message.role === 'user' ? "justify-end" : "justify-start"
                                    )}
                                >
                                    {message.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-full bg-ocean-100 flex items-center justify-center flex-shrink-0">
                                            <Bot className="w-4 h-4 text-ocean-600" />
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                                            message.role === 'user'
                                                ? "bg-ocean-500 text-white"
                                                : "bg-white border border-gray-200 text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                        )}
                                    >
                                        {message.content}
                                    </div>
                                    {message.role === 'user' && (
                                        <div className="w-7 h-7 rounded-full bg-deep-100 flex items-center justify-center flex-shrink-0">
                                            <User className="w-4 h-4 text-deep-600" />
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-2 items-center">
                                    <div className="w-7 h-7 rounded-full bg-ocean-100 flex items-center justify-center">
                                        <Bot className="w-4 h-4 text-ocean-600" />
                                    </div>
                                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700">
                                        <Loader2 className="w-4 h-4 animate-spin text-ocean-500" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </CardContent>

                        {/* Input */}
                        <div className="p-3 border-t bg-white dark:bg-gray-950 dark:border-gray-800 flex-shrink-0">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Ask about species, data..."
                                    className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-ocean-400 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                                    disabled={isLoading}
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className="bg-ocean-500 hover:bg-ocean-600"
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}
