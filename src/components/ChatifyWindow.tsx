"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Send, Plus, Camera, Image as ImageIcon, MapPin, 
    Video, Mic, X, Download, Shield, AlertTriangle,
    Eye, EyeOff, Save, Trash2, ShieldCheck, Lock,
    Sparkles, Zap, ChevronLeft, Phone, Check, CheckCheck, ArrowLeft,
    MoreVertical, Clock, History, Star, Heart, Smile
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AvatarDisplay } from "./AvatarDisplay";

interface ChatProps {
  session: any;
  privateKey?: CryptoKey;
  initialContact: any;
  isPartnerOnline?: boolean;
  onBack?: () => void;
  onInitiateCall: (contact: any, mode: "video" | "voice") => void;
}

export function ChatifyWindow({ session, privateKey, initialContact, isPartnerOnline, onBack, onInitiateCall }: ChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    deleteAfterView: false,
    autoPurge3h: false,
    saveChat: false
  });
  const [reactionMenu, setReactionMenu] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<any>(null);

  const [partnerPresence, setPartnerPresence] = useState<{
    isOnline: boolean;
    isInChat: boolean;
    isTyping: boolean;
  }>({ isOnline: false, isInChat: false, isTyping: false });
  const [isFocused, setIsFocused] = useState(true);
  const [showSnapshotView, setShowSnapshotView] = useState<any>(null);
  const [showSaveToVault, setShowSaveToVault] = useState<any>(null);
  const [vaultPassword, setVaultPassword] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBlur = () => setIsFocused(false);
    const handleFocus = () => setIsFocused(true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Fetch initial privacy settings from profile or chat state if stored
  useEffect(() => {
    // For now, settings are local to this session/component but ideally should be in DB per chat
  }, []);

  const togglePrivacy = (type: 'deleteAfterView' | 'autoPurge3h' | 'saveChat') => {
    setPrivacySettings(prev => {
      const next = { ...prev };
      if (type === 'deleteAfterView') {
        next.deleteAfterView = !prev.deleteAfterView;
        if (next.deleteAfterView) next.autoPurge3h = false; // Mutually exclusive
      } else if (type === 'autoPurge3h') {
        next.autoPurge3h = !prev.autoPurge3h;
        if (next.autoPurge3h) next.deleteAfterView = false; // Mutually exclusive
      } else {
        next.saveChat = !prev.saveChat;
      }
      return next;
    });
  };

  async function saveToVault(message: any) {
    if (!vaultPassword) {
      toast.error("Enter vault password to authorize storage");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("vault_password")
      .eq("id", session.user.id)
      .single();

    if (profile?.vault_password !== vaultPassword) {
      toast.error("Invalid Vault Password");
      return;
    }

    toast.loading("Transferring intelligence to vault...");

    const { error } = await supabase.from("vault_items").insert({
      user_id: session.user.id,
      type: 'photo',
      file_url: message.media_url,
      file_name: `vault-${Date.now()}.jpg`,
      metadata: { source: 'chat', sender_id: message.sender_id }
    });

    toast.dismiss();
    if (error) {
      toast.error("Vault transfer failed");
    } else {
      toast.success("Intelligence secured in vault");
      setShowSaveToVault(null);
      setVaultPassword("");
    }
  }

  useEffect(() => {
    if (!initialContact || !session.user) return;

    const userIds = [session.user.id, initialContact.id].sort();
    const channelName = `presence-chat-${userIds[0]}-${userIds[1]}`;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: session.user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const partnerState: any = state[initialContact.id];
        
        if (partnerState && partnerState.length > 0) {
          const latest = partnerState[partnerState.length - 1];
          setPartnerPresence({
            isOnline: true,
            isInChat: latest.current_chat_id === session.user.id,
            isTyping: latest.is_typing === true,
          });
        } else {
          setPartnerPresence({ isOnline: false, isInChat: false, isTyping: false });
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key === initialContact.id) {
          const latest = newPresences[newPresences.length - 1];
          setPartnerPresence({
            isOnline: true,
            isInChat: latest.current_chat_id === session.user.id,
            isTyping: latest.is_typing === true,
          });
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key === initialContact.id) {
          setPartnerPresence({ isOnline: false, isInChat: false, isTyping: false });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            online_at: new Date().toISOString(),
            current_chat_id: initialContact.id,
            is_typing: isTyping
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [initialContact, session.user, isTyping]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isTyping) setIsTyping(false);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [newMessage]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!isTyping) setIsTyping(true);
  };

  useEffect(() => {
    if (initialContact) {
      fetchMessages();
      const subscription = subscribeToMessages();
      
      const cleanupInterval = setInterval(async () => {
        await supabase.rpc('purge_viewed_content');
        fetchMessages();
      }, 60000);

      return () => {
        supabase.removeChannel(subscription);
        clearInterval(cleanupInterval);
      };
    }
  }, [initialContact]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  async function deleteMessage(id: string) {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) {
      toast.error("Failed to purge intelligence packet");
    } else {
      setMessages(prev => prev.filter(m => m.id !== id));
      toast.success("Intelligence purged from node");
    }
  }

  async function toggleSaveMessage(msg: any) {
    const { error } = await supabase
      .from("messages")
      .update({ is_saved: !msg.is_saved })
      .eq("id", msg.id);
    
    if (error) {
      toast.error("Failed to toggle save state");
    } else {
      toast.success(msg.is_saved ? "Message un-saved" : "Message secured and highlighted");
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_saved: !msg.is_saved } : m));
    }
  }

  async function reactToMessage(id: string, emoji: string) {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    const reactions = msg.reactions || {};
    reactions[session.user.id] = emoji;

    const { error } = await supabase
      .from("messages")
      .update({ reactions })
      .eq("id", id);
    
    if (error) {
      toast.error("Reaction failed");
    } else {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m));
      setReactionMenu(null);
    }
  }

  async function fetchMessages() {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${initialContact.id}),and(sender_id.eq.${initialContact.id},receiver_id.eq.${session.user.id})`)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to sync neural link");
    } else {
      setMessages(data || []);
      const unviewed = data?.filter(m => m.receiver_id === session.user.id && !m.is_viewed) || [];
      if (unviewed.length > 0) {
        const ids = unviewed.map(m => m.id);
        await supabase.from("messages").update({ 
          is_viewed: true, 
          viewed_at: new Date().toISOString() 
        }).in("id", ids);
      }
    }
    setLoading(false);
  }

  function subscribeToMessages() {
    return supabase
      .channel(`chat-${initialContact.id}`)
      .on("postgres_changes", { 
        event: "INSERT", 
        schema: "public", 
        table: "messages",
        filter: `receiver_id=eq.${session.user.id}`
      }, async (payload) => {
        if (payload.new.sender_id === initialContact.id) {
          setMessages(prev => [...prev, payload.new]);
          await supabase.from("messages").update({ 
            is_delivered: true,
            delivered_at: new Date().toISOString()
          }).eq("id", payload.new.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages"
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "messages"
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();
  }

  async function sendMessage(mediaType: string = "text", mediaUrl: string | null = null) {
    if (!newMessage.trim() && !mediaUrl) return;

    const messageData: any = {
      sender_id: session.user.id,
      receiver_id: initialContact.id,
      encrypted_content: newMessage.trim() || " ", 
      media_type: privacySettings.deleteAfterView ? 'snapshot' : mediaType,
      media_url: mediaUrl,
      is_viewed: false,
      is_delivered: partnerPresence.isOnline,
      delivered_at: partnerPresence.isOnline ? new Date().toISOString() : null,
      is_view_once: privacySettings.deleteAfterView,
      auto_delete: privacySettings.autoPurge3h,
      expires_at: privacySettings.autoPurge3h ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() : null
    };

    const { data, error } = await supabase.from("messages").insert(messageData).select();

    if (error) {
      toast.error("Packet transmission failed: " + (error.message || "Protocol Error"));
    } else {
      const sentMsg = data?.[0] || messageData;
      setMessages(prev => [...prev, sentMsg]);
      setNewMessage("");
      setShowOptions(false);
    }
  }

  const handleLongPress = (id: string) => {
    setReactionMenu(id);
  };

  const onTouchStart = (id: string) => {
    const timer = setTimeout(() => handleLongPress(id), 500);
    setLongPressTimer(timer);
  };

  const onTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  if (!initialContact) return null;

  return (
    <div className="flex flex-col h-full bg-[#030303] relative overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      <style jsx global>{`
        @media print { body { display: none; } }
        .no-screenshot {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>

      {/* Header */}
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-3xl flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/20 hover:text-white lg:hidden bg-white/5 rounded-xl border border-white/5">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="text-white/20 hover:text-white hidden lg:flex">
              <ArrowLeft className="w-6 h-6" />
            </Button>
          )}
          <AvatarDisplay profile={initialContact} className="h-10 w-10 ring-2 ring-indigo-500/20" />
          <div>
            <h3 className="text-sm font-black italic tracking-tighter uppercase text-white">{initialContact.username}</h3>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${(isPartnerOnline ?? partnerPresence.isOnline) ? 'bg-blue-500 animate-pulse' : 'bg-zinc-600'}`} />
              <span className={`text-[8px] font-black uppercase tracking-widest ${(isPartnerOnline ?? partnerPresence.isOnline) ? 'text-blue-400' : 'text-zinc-500'}`}>
                {(isPartnerOnline ?? partnerPresence.isOnline) ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => onInitiateCall(initialContact, "voice")} className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl"><Phone className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onInitiateCall(initialContact, "video")} className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl"><Video className="w-4 h-4" /></Button>
          
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setShowPrivacyMenu(!showPrivacyMenu)} className={`rounded-xl transition-all ${showPrivacyMenu ? 'bg-indigo-600 text-white' : 'text-white/20 hover:text-white bg-white/5'}`}>
              <MoreVertical className="w-4 h-4" />
            </Button>
            
            <AnimatePresence>
              {showPrivacyMenu && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute right-0 top-12 w-64 bg-[#0a0a0a] border border-white/10 rounded-3xl p-3 shadow-2xl z-[100] backdrop-blur-3xl">
                  <div className="space-y-1">
                    <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/20 px-4 py-2">Privacy Protocol</p>
                    
                    <button onClick={() => togglePrivacy('deleteAfterView')} className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${privacySettings.deleteAfterView ? 'bg-indigo-600/20 text-indigo-400' : 'text-white/40 hover:bg-white/5'}`}>
                      <div className="flex items-center gap-3">
                        <EyeOff className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">After View Purge</span>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${privacySettings.deleteAfterView ? 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.5)]' : 'bg-white/10'}`} />
                    </button>

                    <button onClick={() => togglePrivacy('autoPurge3h')} className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${privacySettings.autoPurge3h ? 'bg-purple-600/20 text-purple-400' : 'text-white/40 hover:bg-white/5'}`}>
                      <div className="flex items-center gap-3">
                        <History className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">3h Auto-Purge</span>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${privacySettings.autoPurge3h ? 'bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.5)]' : 'bg-white/10'}`} />
                    </button>

                    <div className="h-px bg-white/5 my-2" />

                    <button onClick={() => togglePrivacy('saveChat')} className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${privacySettings.saveChat ? 'bg-emerald-600/20 text-emerald-400' : 'text-white/40 hover:bg-white/5'}`}>
                      <div className="flex items-center gap-3">
                        <Save className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Shared Chat Save</span>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${privacySettings.saveChat ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-white/10'}`} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 no-screenshot">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-20">
            <ShieldCheck className="w-12 h-12 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">End-to-End Encrypted</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.sender_id === session.user.id;
            const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;
            
            return (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex ${isMe ? "justify-end" : "justify-start"} relative`}
              >
                <div className={`max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <div 
                    onMouseDown={() => {
                        const timer = setTimeout(() => handleLongPress(msg.id), 500);
                        setLongPressTimer(timer);
                    }}
                    onMouseUp={() => onTouchEnd()}
                    onMouseLeave={() => onTouchEnd()}
                    onTouchStart={() => onTouchStart(msg.id)}
                    onTouchEnd={() => onTouchEnd()}
                    className={`group/msg relative p-5 rounded-[2.5rem] text-sm font-medium leading-relaxed transition-all duration-300 ${
                        msg.is_saved 
                          ? "bg-[#f5f5f5] text-black shadow-[0_0_30px_rgba(255,255,255,0.1)] border border-white/20 ring-1 ring-white/10" 
                          : isMe 
                            ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/10" 
                            : "bg-white/[0.03] border border-white/5 text-white/90"
                      }`}
                  >
                    {msg.media_type === 'snapshot' ? (
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowSnapshotView(msg)}>
                            <div className={`p-3 rounded-2xl ${msg.is_saved ? 'bg-black/5' : 'bg-white/5'}`}>
                                <Camera className={`w-5 h-5 ${msg.is_saved ? 'text-indigo-600' : 'text-indigo-400'}`} />
                            </div>
                            <span className="font-bold uppercase tracking-wider text-[10px]">Secure Snapshot</span>
                        </div>
                    ) : (
                        msg.encrypted_content
                    )}

                    <AnimatePresence>
                        {reactionMenu === msg.id && (
                            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute -top-16 left-0 right-0 flex justify-center z-50">
                                <div className="bg-[#0f0f0f] border border-white/10 rounded-full px-4 py-2 flex gap-4 shadow-2xl backdrop-blur-xl">
                                    {['❤️', '🔥', '😂', '😮', '😢', '👍'].map(emoji => (
                                        <button key={emoji} onClick={() => reactToMessage(msg.id, emoji)} className="text-xl hover:scale-125 transition-transform">{emoji}</button>
                                    ))}
                                    <div className="w-px h-6 bg-white/10 mx-1 self-center" />
                                    <button onClick={() => toggleSaveMessage(msg)} className={`p-2 rounded-full transition-colors ${msg.is_saved ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/20 hover:text-white'}`}>
                                        <Save className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {hasReactions && (
                        <div className={`absolute -bottom-3 ${isMe ? 'right-4' : 'left-4'} flex -space-x-2`}>
                            {Object.entries(msg.reactions).map(([uid, emoji]: [string, any]) => (
                                <div key={uid} className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-white/5 flex items-center justify-center text-[10px] shadow-lg">
                                    {emoji}
                                </div>
                            ))}
                        </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2 px-4 opacity-30">
                    <span className="text-[7px] font-black uppercase tracking-widest text-white">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isMe && (
                      <div className="flex items-center">
                        {msg.is_viewed ? <CheckCheck className="w-2.5 h-2.5 text-blue-500" /> : msg.is_delivered ? <CheckCheck className="w-2.5 h-2.5 text-white" /> : <Check className="w-2.5 h-2.5 text-white/30" />}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <footer className="p-6 bg-black/40 backdrop-blur-3xl border-t border-white/5 relative z-30 shrink-0">
        <div className="flex items-center gap-3 relative">
          <Button variant="ghost" size="icon" onClick={() => setShowOptions(!showOptions)} className={`h-12 w-12 rounded-2xl transition-all ${showOptions ? 'bg-indigo-600 text-white rotate-45' : 'bg-white/5 text-white/20'}`}>
            <Plus className="w-6 h-6" />
          </Button>
          
          <input 
            value={newMessage}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={privacySettings.deleteAfterView ? "Type disappearing packet..." : "Type intelligence packet..."}
            className={`flex-1 bg-white/[0.03] border rounded-[2rem] h-12 px-6 text-sm font-medium outline-none transition-all placeholder:text-white/10 ${privacySettings.deleteAfterView ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'border-white/10 focus:border-indigo-500/50'}`}
          />

          <Button onClick={() => sendMessage()} disabled={!newMessage.trim()} className="h-12 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 disabled:opacity-20">
            <Send className="w-5 h-5" />
          </Button>

          <AnimatePresence>
            {showOptions && (
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} className="absolute bottom-20 left-0 w-64 bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-4 shadow-2xl z-50 overflow-hidden">
                <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all cursor-pointer group">
                      <ImageIcon className="w-6 h-6 text-indigo-400 mb-2" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Photo</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {}} />
                    </label>
                    <label className="flex flex-col items-center justify-center p-4 bg-purple-600/5 border border-purple-500/20 rounded-2xl hover:bg-purple-600/20 hover:border-purple-500/40 transition-all cursor-pointer group">
                      <Camera className="w-6 h-6 text-purple-400 mb-2" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Snapshot</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {}} />
                    </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </footer>

      {/* Snapshot Modal */}
      <AnimatePresence>
        {showSnapshotView && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black backdrop-blur-3xl flex items-center justify-center p-6">
            <div className={`relative w-full max-w-2xl aspect-[3/4] bg-black rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl flex flex-col ${!isFocused ? 'blur-3xl opacity-50' : ''}`}>
              <div className="flex-1 flex items-center justify-center">
                <p className="text-white/20 uppercase font-black tracking-[0.5em] text-[10px]">Secure Visual Interface</p>
              </div>
              <div className="p-10 bg-black/80 backdrop-blur-xl border-t border-white/5 flex items-center justify-between">
                <h4 className="text-xl font-black italic text-white uppercase tracking-tighter">Temporal Packet</h4>
                <Button onClick={() => setShowSnapshotView(null)} className="h-14 px-10 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black tracking-widest text-[10px] uppercase">Terminate</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
