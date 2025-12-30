"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Send, Plus, Camera, Image as ImageIcon, MapPin, 
    Video, Mic, X, Download, Shield, AlertTriangle,
    Eye, EyeOff, Save, Trash2, ShieldCheck, Lock,
    Sparkles, Zap, ChevronLeft, Phone, Check, CheckCheck, ArrowLeft,
    MoreVertical, Trash, Clock as ClockIcon, Smile, Bookmark
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AvatarDisplay } from "./AvatarDisplay";
import { 
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [isTyping, setIsTyping] = useState(false);
  const [privacyProtocol, setPrivacyProtocol] = useState<'none' | 'after-view' | '3h-purge'>('none');
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [longPressedMessage, setLongPressedMessage] = useState<any>(null);
  const [partnerPresence, setPartnerPresence] = useState<{
    isOnline: boolean;
    isInChat: boolean;
    isTyping: boolean;
  }>({ isOnline: false, isInChat: false, isTyping: false });
  const [isFocused, setIsFocused] = useState(true);
  const [showSnapshotView, setShowSnapshotView] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`saved_messages_${session.user.id}_${initialContact.id}`);
    if (saved) {
        setSavedMessageIds(new Set(JSON.parse(saved)));
    }
    
    const protocol = localStorage.getItem(`privacy_protocol_${session.user.id}_${initialContact.id}`);
    if (protocol) {
        setPrivacyProtocol(protocol as any);
    }
  }, [initialContact.id]);

  const togglePrivacyProtocol = (protocol: 'after-view' | '3h-purge') => {
    const newProtocol = privacyProtocol === protocol ? 'none' : protocol;
    setPrivacyProtocol(newProtocol);
    localStorage.setItem(`privacy_protocol_${session.user.id}_${initialContact.id}`, newProtocol);
    toast.info(`Privacy Mode: ${newProtocol === 'none' ? 'Standard' : newProtocol === 'after-view' ? 'Delete after View' : '3h Auto-Purge'}`);
  };

  const toggleSaveMessage = (id: string) => {
    const newSaved = new Set(savedMessageIds);
    if (newSaved.has(id)) {
        newSaved.delete(id);
        toast.info("Message removed from saved");
    } else {
        newSaved.add(id);
        toast.success("Message secured in saved items");
    }
    setSavedMessageIds(newSaved);
    localStorage.setItem(`saved_messages_${session.user.id}_${initialContact.id}`, JSON.stringify(Array.from(newSaved)));
    setLongPressedMessage(null);
  };

  const handleLongPressStart = (message: any) => {
    pressTimer.current = setTimeout(() => {
        setLongPressedMessage(message);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

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

  useEffect(() => {
    if (!initialContact || !session.user) return;
    const userIds = [session.user.id, initialContact.id].sort();
    const channelName = `presence-chat-${userIds[0]}-${userIds[1]}`;
    const channel = supabase.channel(channelName, { config: { presence: { key: session.user.id } } });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const partnerState: any = state[initialContact.id];
        if (partnerState && partnerState.length > 0) {
          const latest = partnerState[partnerState.length - 1];
          setPartnerPresence({ isOnline: true, isInChat: latest.current_chat_id === session.user.id, isTyping: latest.is_typing === true });
        } else {
          setPartnerPresence({ isOnline: false, isInChat: false, isTyping: false });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString(), current_chat_id: initialContact.id, is_typing: isTyping });
        }
      });

    return () => { channel.unsubscribe(); };
  }, [initialContact, session.user, isTyping]);

  useEffect(() => {
    if (initialContact) {
      fetchMessages();
      const subscription = subscribeToMessages();
      const cleanupInterval = setInterval(async () => {
        if (privacyProtocol === '3h-purge') {
            await supabase.rpc('purge_viewed_content');
            fetchMessages();
        }
      }, 60000);
      return () => { supabase.removeChannel(subscription); clearInterval(cleanupInterval); };
    }
  }, [initialContact, privacyProtocol]);

  useEffect(() => { scrollToBottom(); }, [messages]);
  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };

  async function fetchMessages() {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${initialContact.id}),and(sender_id.eq.${initialContact.id},receiver_id.eq.${session.user.id})`)
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages(data || []);
      const unviewed = data?.filter(m => m.receiver_id === session.user.id && !m.is_viewed) || [];
      if (unviewed.length > 0) {
        await supabase.from("messages").update({ is_viewed: true, viewed_at: new Date().toISOString() }).in("id", unviewed.map(m => m.id));
      }
    }
    setLoading(false);
  }

  function subscribeToMessages() {
    return supabase.channel(`chat-${initialContact.id}`).on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload: any) => {
        fetchMessages();
    }).subscribe();
  }

  async function sendMessage(mediaType: string = "text", mediaUrl: string | null = null) {
    if (!newMessage.trim() && !mediaUrl) return;
    const { data, error } = await supabase.from("messages").insert({
      sender_id: session.user.id,
      receiver_id: initialContact.id,
      encrypted_content: newMessage.trim() || " ",
      media_type: mediaType,
      media_url: mediaUrl,
      is_viewed: false,
      is_delivered: partnerPresence.isOnline
    }).select();

    if (!error) {
      setNewMessage("");
      setShowOptions(false);
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isSnapshot: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filePath = `chat/${session.user.id}/${Math.random()}.${file.name.split(".").pop()}`;
    toast.loading("Transmitting...");
    const { error } = await supabase.storage.from("chat-media").upload(filePath, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(filePath);
      await sendMessage(isSnapshot ? "snapshot" : "image", publicUrl);
      toast.dismiss();
      toast.success("Intelligence shared");
    } else {
        toast.dismiss();
        toast.error("Transmission failed");
    }
  };

  const openSnapshot = async (message: any) => {
    if (message.is_viewed && message.sender_id !== session.user.id) return toast.error("Packet expired");
    setShowSnapshotView(message);
    if (message.receiver_id === session.user.id) {
      await supabase.from("messages").update({ is_viewed: true }).eq("id", message.id);
    }
  };

  const closeSnapshot = async () => {
    if (showSnapshotView?.receiver_id === session.user.id) {
      await supabase.from("messages").delete().eq("id", showSnapshotView.id);
    }
    setShowSnapshotView(null);
  };

  if (!initialContact) return null;

  return (
    <div className="flex flex-col h-full bg-[#030303] relative overflow-hidden">
      {/* Header */}
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-3xl flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/20 hover:text-white lg:hidden"><ArrowLeft className="w-6 h-6" /></Button>
          <AvatarDisplay profile={initialContact} className="h-10 w-10 ring-2 ring-indigo-500/20" />
          <div>
            <h3 className="text-sm font-black italic uppercase text-white">{initialContact.username}</h3>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${partnerPresence.isOnline ? 'bg-blue-500 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">{partnerPresence.isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => onInitiateCall(initialContact, "voice")} className="text-white/20 hover:text-white"><Phone className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onInitiateCall(initialContact, "video")} className="text-white/20 hover:text-white"><Video className="w-4 h-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white/20 hover:text-white"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#0a0a0a] border-white/10 rounded-2xl w-56 p-2">
              <DropdownMenuItem onClick={() => togglePrivacyProtocol('after-view')} className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer ${privacyProtocol === 'after-view' ? 'bg-indigo-600/20 text-indigo-400' : 'text-white/60 hover:bg-white/5'}`}>
                <EyeOff className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest flex-1">Delete After View</span>
                {privacyProtocol === 'after-view' && <Check className="w-3 h-3" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => togglePrivacyProtocol('3h-purge')} className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer ${privacyProtocol === '3h-purge' ? 'bg-indigo-600/20 text-indigo-400' : 'text-white/60 hover:bg-white/5'}`}>
                <ClockIcon className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest flex-1">3h Auto-Purge</span>
                {privacyProtocol === '3h-purge' && <Check className="w-3 h-3" />}
              </DropdownMenuItem>
              <div className="h-px bg-white/5 my-2" />
              <DropdownMenuItem className="text-white/60 hover:bg-white/5 gap-3 rounded-xl py-3 px-4 cursor-pointer"><Bookmark className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Saved Items</span></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((msg) => {
          const isMe = msg.sender_id === session.user.id;
          const isSaved = savedMessageIds.has(msg.id);
          return (
            <motion.div 
              key={msg.id} 
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              onMouseDown={() => handleLongPressStart(msg)}
              onMouseUp={handleLongPressEnd}
              onTouchStart={() => handleLongPressStart(msg)}
              onTouchEnd={handleLongPressEnd}
            >
              <div className={`max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div className={`relative p-4 rounded-[2rem] text-sm font-medium transition-all ${
                  isSaved ? "bg-amber-400/20 border-2 border-amber-400/50 text-white shadow-[0_0_20px_rgba(251,191,36,0.2)] scale-[1.02]" :
                  isMe ? "bg-indigo-600 text-white shadow-lg" : "bg-white/[0.03] border border-white/5 text-white"
                }`}>
                  {isSaved && <Bookmark className="absolute -top-2 -right-1 w-4 h-4 text-amber-400 fill-amber-400" />}
                  {msg.media_type === 'snapshot' ? (
                    <button onClick={() => openSnapshot(msg)} className="flex items-center gap-3">
                      <Camera className="w-5 h-5 text-purple-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Temporal Packet</span>
                    </button>
                  ) : msg.media_type === 'image' ? (
                    <img src={msg.media_url} className="rounded-2xl max-h-60" />
                  ) : msg.media_type === 'location' ? (
                      <div onClick={() => window.open(msg.media_url, '_blank')} className="flex items-center gap-3 cursor-pointer">
                          <MapPin className="w-5 h-5 text-emerald-400" />
                          <span className="text-[10px] font-black uppercase tracking-widest underline">Location Uplink</span>
                      </div>
                  ) : (
                    msg.encrypted_content
                  )}
                </div>
                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/10 mt-2 px-2">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {longPressedMessage && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLongPressedMessage(null)}>
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }} 
                className="bg-[#0a0a0a] border border-white/10 p-6 rounded-[2.5rem] w-full max-w-xs space-y-4"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-around py-2">
                    {['❤️', '🔥', '😂', '😮', '👍'].map(emoji => (
                        <button key={emoji} className="text-2xl hover:scale-125 transition-transform" onClick={() => { toast.success(`Reacted ${emoji}`); setLongPressedMessage(null); }}>{emoji}</button>
                    ))}
                </div>
                <div className="h-px bg-white/5" />
                <Button 
                    className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-[10px] gap-3"
                    onClick={() => toggleSaveMessage(longPressedMessage.id)}
                >
                    <Bookmark className="w-4 h-4 fill-black" />
                    {savedMessageIds.has(longPressedMessage.id) ? 'Unsave Message' : 'Save Message'}
                </Button>
                <Button 
                    variant="ghost"
                    className="w-full h-14 rounded-2xl text-red-500 hover:bg-red-500/10 font-black uppercase tracking-widest text-[10px] gap-3"
                    onClick={() => { supabase.from("messages").delete().eq("id", longPressedMessage.id).then(() => { fetchMessages(); setLongPressedMessage(null); }); }}
                >
                    <Trash className="w-4 h-4" />
                    Purge Intel
                </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="p-6 bg-black/40 backdrop-blur-3xl border-t border-white/5 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setShowOptions(!showOptions)} className={`h-12 w-12 rounded-2xl ${showOptions ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/20'}`}><Plus className="w-6 h-6" /></Button>
        <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Transmit packet..." className="flex-1 bg-white/[0.03] border-white/10 rounded-[2rem] h-12 px-6" />
        <Button onClick={() => sendMessage()} disabled={!newMessage.trim()} className="h-12 w-12 rounded-2xl bg-indigo-600"><Send className="w-5 h-5" /></Button>
        
        <AnimatePresence>
          {showOptions && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-24 left-6 bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-4 grid grid-cols-2 gap-2 shadow-2xl">
              <label className="p-4 bg-white/5 rounded-2xl flex flex-col items-center cursor-pointer hover:bg-white/10"><ImageIcon className="w-6 h-6 text-indigo-400 mb-1" /><span className="text-[8px] font-black uppercase text-white/40">Photo</span><input type="file" className="hidden" onChange={e => handleFileUpload(e)} /></label>
              <label className="p-4 bg-white/5 rounded-2xl flex flex-col items-center cursor-pointer hover:bg-white/10"><Camera className="w-6 h-6 text-purple-400 mb-1" /><span className="text-[8px] font-black uppercase text-white/40">Snap</span><input type="file" className="hidden" onChange={e => handleFileUpload(e, true)} /></label>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>

      {/* Snapshot View */}
      {showSnapshotView && (
        <div className="fixed inset-0 z-[100] bg-black backdrop-blur-3xl flex items-center justify-center p-6" onClick={closeSnapshot}>
            <div className={`relative max-w-2xl w-full aspect-[3/4] transition-all duration-500 ${!isFocused ? 'blur-3xl scale-95 opacity-50' : ''}`}>
                <img src={showSnapshotView.media_url} className="w-full h-full object-contain rounded-[3rem]" />
                <div className="absolute top-8 left-8 p-4 bg-black/60 rounded-2xl border border-white/5"><p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400">Temporal Intel Active</p></div>
            </div>
        </div>
      )}
    </div>
  );
}
