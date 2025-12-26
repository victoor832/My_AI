'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Menu, 
  X, 
  Send, 
  Image as ImageIcon, 
  Paperclip, 
  Trash2, 
  Settings as SettingsIcon,
  ChevronRight,
  Cpu,
  Zap,
  Lock
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Message {
  role: 'user' | 'assistant' | 'system' | 'thinking';
  content: string;
  images?: string[];
  hadImages?: boolean;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  created: number;
}

interface Settings {
  stream: boolean;
  showThinking: boolean;
  temperature: number;
  systemPrompt: string;
  maxTokens: number;
}

// --- Components ---

export default function ChatInterface() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ type: 'image' | 'file', name: string, data?: string, content?: string }[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [settings, setSettings] = useState<Settings>({
    stream: true,
    showThinking: true,
    temperature: 0.7,
    systemPrompt: "Eres un asistente útil y conciso.",
    maxTokens: -1
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const savedChats = localStorage.getItem('ai_chat_history');
    const savedSettings = localStorage.getItem('ai_chat_settings');

    if (savedChats) setChats(JSON.parse(savedChats));
    if (savedSettings) setSettings(JSON.parse(savedSettings));

    // Check if already logged in (session-like)
    if (sessionStorage.getItem('isLoggedIn') === 'true') setIsLoggedIn(true);
  }, []);

  useEffect(() => {
    if (Object.keys(chats).length === 0) {
      createNewChat();
    } else if (!currentChatId) {
      const lastChatId = Object.keys(chats).sort((a, b) => chats[b].created - chats[a].created)[0];
      setCurrentChatId(lastChatId);
    }
  }, [chats]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchModels();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chats, currentChatId, isGenerating]);

  // --- Actions ---
  const handleLogin = async () => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        setIsLoggedIn(true);
        sessionStorage.setItem('isLoggedIn', 'true');
      } else {
        alert('Contraseña incorrecta');
      }
    } catch (error) {
      console.error('Error en el login:', error);
      alert('Error al conectar con el servidor');
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      if (data.data) {
        const modelIds = data.data.map((m: any) => m.id);
        setModels(modelIds);
        if (modelIds.length > 0 && !selectedModel) setSelectedModel(modelIds[0]);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  };

  const createNewChat = () => {
    const id = 'chat_' + Date.now();
    const newChat: Chat = { id, title: 'Nuevo chat', messages: [], created: Date.now() };
    setChats(prev => ({ ...prev, [id]: newChat }));
    setCurrentChatId(id);
    saveToLocalStorage({ ...chats, [id]: newChat });
  };

  const saveToLocalStorage = (updatedChats: Record<string, Chat>) => {
    // Optimize: don't save large base64 images in history to avoid localStorage limits
    const optimized = { ...updatedChats };
    Object.keys(optimized).forEach(id => {
      optimized[id] = {
        ...optimized[id],
        messages: optimized[id].messages.map(m => ({
          ...m,
          images: undefined,
          hadImages: m.images ? true : m.hadImages
        }))
      };
    });
    localStorage.setItem('ai_chat_history', JSON.stringify(optimized));
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newChats = { ...chats };
    delete newChats[id];
    setChats(newChats);
    if (currentChatId === id) {
      const remainingIds = Object.keys(newChats);
      setCurrentChatId(remainingIds.length > 0 ? remainingIds[0] : null);
    }
    saveToLocalStorage(newChats);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (type === 'image') {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setUploadedFiles(prev => [...prev, { type: 'image', name: file.name, data: ev.target?.result as string }]);
        };
        reader.readAsDataURL(file);
      } else {
        const text = await file.text();
        setUploadedFiles(prev => [...prev, { type: 'file', name: file.name, content: text.substring(0, 5000) }]);
      }
    }
    e.target.value = '';
  };

  const sendMessage = async () => {
    if ((!input.trim() && uploadedFiles.length === 0) || !currentChatId || isGenerating) return;

    const chat = chats[currentChatId];
    const newMessages: Message[] = [...chat.messages];

    // Add system prompt if first message
    if (newMessages.length === 0 && settings.systemPrompt) {
      newMessages.push({ role: 'system', content: settings.systemPrompt });
    }

    const userMsg: Message = {
      role: 'user',
      content: input,
      images: uploadedFiles.filter(f => f.type === 'image').map(f => f.data!)
    };

    // Append file contents to text
    const fileContents = uploadedFiles
      .filter(f => f.type === 'file')
      .map(f => `\n\n[Archivo: ${f.name}]\n${f.content}`)
      .join('');
    userMsg.content += fileContents;

    newMessages.push(userMsg);
    
    const updatedChat = { 
      ...chat, 
      messages: newMessages,
      title: chat.title === 'Nuevo chat' ? (input.substring(0, 30) || 'Imagen') : chat.title
    };

    setChats(prev => ({ ...prev, [currentChatId]: updatedChat }));
    setInput('');
    setUploadedFiles([]);
    setIsGenerating(true);

    // Prepare API messages
    const apiMessages = newMessages
      .filter(m => m.role !== 'thinking')
      .map(m => {
        if (m.role === 'user' && m.images && m.images.length > 0) {
          const content: any[] = [{ type: "text", text: m.content }];
          m.images.forEach(img => {
            content.push({ type: "image_url", image_url: { url: img } });
          });
          return { role: m.role, content };
        }
        return { role: m.role, content: m.content };
      });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens === -1 ? undefined : settings.maxTokens,
          stream: settings.stream
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      let assistantMsg: Message = { role: 'assistant', content: '' };
      let thinkingMsg: Message | null = null;
      
      const updatedMessages = [...newMessages, assistantMsg];
      setChats(prev => ({
        ...prev,
        [currentChatId]: { ...updatedChat, messages: updatedMessages }
      }));

      if (settings.stream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = ''; // Búfer para acumular fragmentos de líneas

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            
            // El último elemento de split() puede estar incompleto, lo guardamos para el siguiente chunk
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine || trimmedLine.startsWith(':')) continue; // Ignorar líneas vacías y pings (: ping)

              if (trimmedLine.startsWith('data: ')) {
                const dataStr = trimmedLine.substring(6);
                if (dataStr === '[DONE]') break;
                
                try {
                  const data = JSON.parse(dataStr);
                  
                  if (data.error) {
                    assistantMsg.content = `Error: ${data.error}. ${data.details || ''}`;
                    setChats(prev => ({
                      ...prev,
                      [currentChatId]: { ...updatedChat, messages: [...updatedMessages] }
                    }));
                    break;
                  }

                  const delta = data.choices?.[0]?.delta?.content || '';
                  fullText += delta;

                  // Lógica de pensamiento [THINK]
                  if (fullText.includes('[THINK]')) {
                    const parts = fullText.split(/\[THINK\]|\[\/THINK\]/);
                    if (parts.length > 1) {
                      if (!thinkingMsg) {
                        thinkingMsg = { role: 'thinking', content: '' };
                        updatedMessages.splice(updatedMessages.length - 1, 0, thinkingMsg);
                      }
                      thinkingMsg.content = parts[1];
                      assistantMsg.content = parts[2] || '';
                    }
                  } else {
                    assistantMsg.content = fullText;
                  }

                  setChats(prev => ({
                    ...prev,
                    [currentChatId]: { ...updatedChat, messages: [...updatedMessages] }
                  }));
                } catch (e) {
                  console.warn('Error parseando línea del stream:', trimmedLine);
                }
              }
            }
          }
        }
      } else {
        const data = await response.json();
        assistantMsg.content = data.choices[0].message.content;
        setChats(prev => ({
          ...prev,
          [currentChatId]: { ...updatedChat, messages: [...newMessages, assistantMsg] }
        }));
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMsg: Message = { role: 'assistant', content: `Error: ${error.message}. Revisa la conexión con LM Studio.` };
      setChats(prev => ({
        ...prev,
        [currentChatId]: { ...updatedChat, messages: [...newMessages, errorMsg] }
      }));
    } finally {
      setIsGenerating(false);
      saveToLocalStorage(chats);
    }
  };

  // --- Render Helpers ---
  if (!isLoggedIn) {
    return (
      <div className="fixed inset-0 z-100 bg-[#0d0d0d] flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <div className="w-16 h-16 bg-white/5 rounded-2xl mx-auto flex items-center justify-center mb-4 border border-white/10">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Acceso Privado</h1>
            <p className="text-sm text-neutral-500">Introduce la contraseña para continuar</p>
          </div>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full p-4 bg-neutral-900 border border-neutral-800 rounded-2xl text-white text-center focus:outline-none focus:border-neutral-600 transition-all"
            placeholder="Contraseña"
            autoFocus
          />
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-white text-black rounded-2xl font-semibold hover:bg-neutral-200 transition-all"
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  const currentChat = currentChatId ? chats[currentChatId] : null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#0d0d0d] text-neutral-200">
      {/* Sidebar Overlay */}
      <div 
        className={cn("sidebar-overlay", isSidebarOpen && "open")} 
        onClick={() => setIsSidebarOpen(false)} 
      />

      {/* Sidebar */}
      <aside className={cn("sidebar-mobile bg-[#171717] border-r border-neutral-800 flex flex-col h-full", isSidebarOpen && "open")}>
        <div className="p-4 flex items-center justify-between">
          <button 
            onClick={createNewChat}
            className="flex-1 py-2 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-sm font-medium text-white hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Nuevo Chat
          </button>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden ml-2 p-2 text-neutral-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {Object.values(chats).sort((a, b) => b.created - a.created).map(chat => (
            <div 
              key={chat.id}
              onClick={() => {
                setCurrentChatId(chat.id);
                setIsSidebarOpen(false);
              }}
              className={cn(
                "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                chat.id === currentChatId ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:bg-neutral-800/50"
              )}
            >
              <span className="truncate flex-1">{chat.title}</span>
              <button 
                onClick={(e) => deleteChat(chat.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-neutral-800 space-y-4 overflow-y-auto max-h-[50vh]">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
            <SettingsIcon size={12} /> Configuración
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Streaming</span>
              <button 
                onClick={() => setSettings(s => ({ ...s, stream: !s.stream }))}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-colors",
                  settings.stream ? "bg-white" : "bg-neutral-700"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-3 h-3 rounded-full transition-all",
                  settings.stream ? "right-1 bg-black" : "left-1 bg-white"
                )} />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-neutral-500 uppercase">
                <span>Temperatura</span>
                <span>{settings.temperature}</span>
              </div>
              <input 
                type="range" min="0" max="2" step="0.1" 
                value={settings.temperature}
                onChange={(e) => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            <div className="space-y-2">
              <div className="text-[10px] text-neutral-500 uppercase">System Prompt</div>
              <textarea 
                rows={2}
                value={settings.systemPrompt}
                onChange={(e) => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:border-neutral-500"
                placeholder="Instrucciones del sistema..."
              />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-neutral-800 flex items-center px-4 md:px-6 justify-between bg-[#0d0d0d]/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-neutral-400 hover:text-white">
              <Menu size={24} />
            </button>
            <h2 className="font-medium text-neutral-200 truncate max-w-37.5 sm:max-w-75">
              {currentChat?.title || 'Nuevo Chat'}
            </h2>
            <div className="h-4 w-px bg-neutral-800 hidden sm:block" />
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-xs text-neutral-500 border-none focus:ring-0 cursor-pointer hover:text-neutral-200 transition-colors max-w-37.5 sm:max-w-62.5 truncate outline-none"
            >
              {models.length > 0 ? (
                models.map(m => <option key={m} value={m} className="bg-neutral-900">{m}</option>)
              ) : (
                <option value="">Cargando modelos...</option>
              )}
            </select>
          </div>
          <div className="items-center gap-2 text-[10px] text-neutral-600 font-mono hidden xs:flex">
            <Zap size={10} /> LM STUDIO
          </div>
        </header>

        {/* Messages */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:space-y-8 scroll-smooth"
        >
          {currentChat?.messages.map((msg, i) => {
            if (msg.role === 'system') return null;
            if (msg.role === 'thinking' && !settings.showThinking) return null;

            return (
              <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                {msg.role === 'thinking' ? (
                  <div className="thinking-block max-w-2xl w-full">
                    {msg.content}
                  </div>
                ) : (
                  <div className={cn(
                    "max-w-3xl w-full",
                    msg.role === 'user' ? "message-user" : "message-assistant"
                  )}>
                    <div className="text-[10px] font-bold mb-2 text-neutral-500 uppercase tracking-widest">
                      {msg.role === 'user' ? 'Tú' : 'Asistente'}
                    </div>
                    
                    {msg.images && msg.images.map((img, idx) => (
                      <img key={idx} src={img} alt="Upload" className="max-w-sm rounded-lg mb-4 border border-neutral-800 shadow-lg" />
                    ))}
                    
                    {msg.hadImages && !msg.images && (
                      <div className="text-[10px] text-neutral-600 mb-2 italic">🖼️ Imagen de la sesión anterior</div>
                    )}

                    <div className="prose prose-invert prose-sm max-w-none text-neutral-300 leading-relaxed">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({node, inline, className, children, ...props}: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {isGenerating && (
            <div className="flex justify-start">
              <div className="flex gap-1 items-center text-neutral-500 text-xs animate-pulse">
                <div className="w-1 h-1 bg-neutral-500 rounded-full" />
                <div className="w-1 h-1 bg-neutral-500 rounded-full" />
                <div className="w-1 h-1 bg-neutral-500 rounded-full" />
                <span>Generando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-linear-to-t from-[#0d0d0d] via-[#0d0d0d] to-transparent">
          <div className="max-w-3xl mx-auto relative">
            {/* File Previews */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 px-2 py-1 rounded-lg text-[10px] text-neutral-300">
                    <span>{f.type === 'image' ? '🖼️' : '📄'} {f.name}</span>
                    <button 
                      onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-neutral-500 hover:text-red-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-neutral-800 rounded-2xl bg-[#1a1a1a] shadow-2xl focus-within:border-neutral-600 transition-all overflow-hidden">
              <textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Pregunta lo que quieras..."
                className="w-full p-4 bg-transparent border-none focus:ring-0 resize-none text-neutral-200 placeholder-neutral-600 text-sm md:text-base min-h-14 max-h-50 outline-none"
                rows={1}
              />
              
              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex gap-1">
                  <button 
                    onClick={() => imageInputRef.current?.click()}
                    className="p-2 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded-xl transition-all"
                  >
                    <ImageIcon size={20} />
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded-xl transition-all"
                  >
                    <Paperclip size={20} />
                  </button>
                </div>
                <button 
                  onClick={sendMessage}
                  disabled={(!input.trim() && uploadedFiles.length === 0) || isGenerating}
                  className="bg-white text-black px-4 py-2 rounded-xl font-semibold text-sm hover:bg-neutral-200 disabled:opacity-20 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {isGenerating ? '...' : <><Send size={16} /> Enviar</>}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-center text-neutral-700 mt-3 hidden md:block">
              LM Studio puede cometer errores. Revisa la información importante.
            </p>
          </div>
        </div>
      </main>

      {/* Hidden Inputs */}
      <input 
        type="file" ref={imageInputRef} accept="image/*" multiple className="hidden" 
        onChange={(e) => handleFileUpload(e, 'image')} 
      />
      <input 
        type="file" ref={fileInputRef} className="hidden" 
        onChange={(e) => handleFileUpload(e, 'file')} 
      />
    </div>
  );
}
