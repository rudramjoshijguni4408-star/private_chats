"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Send, Plus, Camera, Image as ImageIcon, MapPin, 
    Video, Mic, X, Download, Shield, AlertTriangle,
    Eye, EyeOff, Save, Trash2, ShieldCheck, Lock,
    Sparkles, Zap, ChevronLeft, Phone, Check, CheckCheck, ArrowLeft,
    MoreVertical, Trash, Clock, ShieldAlert, Heart, ThumbsUp, Flame, Laugh, Surprise
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AvatarDisplay } from "./AvatarDisplay";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

interface ChatifyWindowProps {
  session: any;
  privateKey?: CryptoKey;
  initialContact: any;
  isPartnerOnline?: boolean;
  onBack?: () => void;
  onInitiateCall: (contact: any, mode: "video" | "voice") => void;
}

export function ChatifyWindow({ session, privateKey, initialContact, isPartnerOnline, onBack, onInitiateCall }: ChatifyWindowProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerPresence, setPartnerPresence] = useState<{
    isOnline: boolean;
    isInChat: boolean;
    isTyping: boolean;
  }>({ isOnline: false, isInChat: false, isTyping: false });
  const [isFocused, setIsFocused] = useState(true);
  const [showSnapshotView, setShowSnapshotView] = useState<any>(null);
  const [showSaveToVault, setShowSaveToVault] = useState<any>(null);
  const [vaultPassword, setVaultPassword] = useState("");
  const [selectedMsgForReactions, setSelectedMsgForReactions] = useState<string | null>(null);

  // Privacy Settings
  const [deleteAfterView, setDeleteAfterView] = useState(false);
  const [threeHourPurge, setThreeHourPurge] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);

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
    if (!isFocused && showSnapshotView) {
      toast.error("Security Alert: Unauthorized access attempt detected. Chatify blurred.");
    }
  }, [isFocused, showSnapshotView]);

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
        // Custom 3h purge logic if enabled
        if (threeHourPurge) {
          const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
          await supabase.from("messages")
            .delete()
            .lt("created_at", threeHoursAgo)
            .eq("is_saved", false);
        }
        fetchMessages();
      }, 60000);

      return () => {
        supabase.removeChannel(subscription);
        clearInterval(cleanupInterval);
      };
    }
  }, [initialContact, threeHourPurge]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        const ids = unviewed.map(m => m.id);
        await supabase.from("messages").update({ 
          is_viewed: true, 
          viewed_at: new Date().toISOString() 
        }).in("id", ids);

        // Immediate deletion if deleteAfterView is on
        if (deleteAfterView) {
          setTimeout(async () => {
            await supabase.from("messages")
              .delete()
              .in("id", ids)
              .eq("is_saved", false);
            fetchMessages();
          }, 2000);
        }
      }
    }
    setLoading(false);
  }

  function subscribeToMessages() {
    return supabase
      .channel(`chatify-${initialContact.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        fetchMessages();
      })
      .subscribe();
  }

  async function sendMessage(mediaType: string = "text", mediaUrl: string | null = null) {
    if (!newMessage.trim() && !mediaUrl) return;

    const messageData = {
      sender_id: session.user.id,
      receiver_id: initialContact.id,
      encrypted_content: newMessage.trim() || " ", 
      media_type: mediaType,
      media_url: mediaUrl,
      is_viewed: false,
      is_delivered: partnerPresence.isOnline,
      delivered_at: partnerPresence.isOnline ? new Date().toISOString() : null,
      is_saved: autoSaveEnabled
    };

    const { error } = await supabase.from("messages").insert(messageData);
    if (error) {
      toast.error("Transmission failed");
    } else {
      setNewMessage("");
      setShowOptions(false);
    }
  }

  async function toggleSaveMessage(msgId: string, currentState: boolean) {
    const { error } = await supabase
      .from("messages")
      .update({ is_saved: !currentState })
      .eq("id", msgId);
    
    if (!error) {
      toast.success(!currentState ? "Message Secured" : "Message Unlocked");
      fetchMessages();
    }
  }

  async function handleReaction(msgId: string, emoji: string) {
    const msg = messages.find(m => m.id === msgId);
    const reactions = msg.reactions || {};
    reactions[session.user.id] = emoji;

    const { error } = await supabase
      .from("messages")
      .update({ reactions })
      .eq("id", msgId);
    
    if (!error) {
      setSelectedMsgForReactions(null);
      fetchMessages();
    }
  }

  const reactionsList = [
    { emoji: "❤️", icon: Heart },
    { emoji: "👍", icon: ThumbsUp },
    { emoji: "🔥", icon: Flame },
    { emoji: "😂", icon: Laugh },
    { emoji: "😮", icon: Surprise },
  ];

  return (
    <div className="flex flex-col h-full bg-[#030303] relative overflow-hidden select-none">
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-3xl flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/20 hover:text-white mr-1 lg:hidden bg-white/5 rounded-xl border border-white/5">
            <ArrowLeft className="w-6 h-6" />
          </Button>
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
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-[#0a0a0a] border-white/10 text-white rounded-2xl backdrop-blur-xl">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-500 px-4 py-3">Privacy Protocols</DropdownMenuLabel>
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between px-3 py-2 hover:bg-white/5 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <Trash className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold uppercase tracking-tighter">Delete after View</span>
                  </div>
                  <Switch checked={deleteAfterView} onCheckedChange={setDeleteAfterView} />
                </div>
                <div className="flex items-center justify-between px-3 py-2 hover:bg-white/5 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold uppercase tracking-tighter">3h Auto-Purge</span>
                  </div>
                  <Switch checked={threeHourPurge} onCheckedChange={setThreeHourPurge} />
                </div>
                <div className="flex items-center justify-between px-3 py-2 hover:bg-white/5 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <Save className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-tighter">Save Chat</span>
                  </div>
                  <Switch checked={autoSaveEnabled} onCheckedChange={setAutoSaveEnabled} />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === session.user.id;
            const isSaved = msg.is_saved;
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"} relative group`}>
                  <div 
                    onClick={() => setSelectedMsgForReactions(selectedMsgForReactions === msg.id ? null : msg.id)}
                    className={`relative p-4 rounded-[2rem] text-sm font-medium transition-all cursor-pointer ${
                    isSaved 
                      ? "bg-white/10 border border-white/20 backdrop-blur-md shadow-[0_0_20px_rgba(255,255,255,0.05)] text-zinc-100" 
                      : isMe ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/10" : "bg-white/[0.03] border border-white/5 text-white/90"
                  }`}>
                    {msg.media_type === 'image' ? (
                      <img src={msg.media_url} alt="" className="max-w-full max-h-80 rounded-2xl object-cover" />
                    ) : (
                      msg.encrypted_content
                    )}

                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="absolute -bottom-2 -right-2 flex -space-x-1">
                        {Object.values(msg.reactions).map((emoji: any, i) => (
                          <span key={i} className="text-xs bg-black/80 border border-white/10 rounded-full w-5 h-5 flex items-center justify-center backdrop-blur-sm">{emoji}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {selectedMsgForReactions === msg.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className={`absolute z-50 ${isMe ? 'right-0' : 'left-0'} top-full mt-2 p-2 bg-[#111] border border-white/10 rounded-3xl shadow-2xl backdrop-blur-2xl flex flex-col gap-2 min-w-[150px]`}
                      >
                        <div className="flex gap-1 justify-around px-2 py-1">
                          {reactionsList.map((r) => (
                            <button key={r.emoji} onClick={() => handleReaction(msg.id, r.emoji)} className="text-xl hover:scale-125 transition-transform p-1">{r.emoji}</button>
                          ))}
                        </div>
                        <div className="h-px bg-white/5 mx-2" />
                        <button 
                          onClick={() => toggleSaveMessage(msg.id, msg.is_saved)}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors rounded-2xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-400"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {msg.is_saved ? "Remove Secure" : "Save Message"}
                        </button>
                        <button 
                          onClick={async () => {
                            await supabase.from("messages").delete().eq("id", msg.id);
                            fetchMessages();
                          }}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-red-500/10 transition-colors rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-500/50 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Purge Packet
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-center gap-2 mt-2 px-2">
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/10">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isMe && (
                      <div className="flex items-center">
                        {msg.is_viewed ? <CheckCheck className="w-2.5 h-2.5 text-blue-500" /> : <Check className="w-2.5 h-2.5 text-zinc-600" />}
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

      <footer className="p-6 bg-black/40 backdrop-blur-3xl border-t border-white/5 relative z-30 shrink-0">
        <div className="flex items-center gap-3 relative">
          <Button variant="ghost" size="icon" onClick={() => setShowOptions(!showOptions)} className={`h-12 w-12 rounded-2xl transition-all ${showOptions ? 'bg-indigo-600 text-white rotate-45' : 'bg-white/5 text-white/20'}`}>
            <Plus className="w-6 h-6" />
          </Button>
          <input value={newMessage} onChange={handleTyping} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Secure transmission..." className="flex-1 bg-white/[0.03] border border-white/10 rounded-[2rem] h-12 px-6 text-sm font-medium outline-none focus:border-indigo-500/50 transition-all placeholder:text-white/10" />
          <Button onClick={() => sendMessage()} disabled={!newMessage.trim()} className="h-12 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 disabled:opacity-20"><Send className="w-5 h-5" /></Button>

          <AnimatePresence>
            {showOptions && (
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} className="absolute bottom-20 left-0 w-64 bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-4 shadow-2xl z-50 overflow-hidden">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all cursor-pointer group">
                    <ImageIcon className="w-6 h-6 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Photo</span>
                    <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fileName = `${Math.random()}.jpg`;
                      const { data } = await supabase.storage.from("chat-media").upload(`chat/${session.user.id}/${fileName}`, file);
                      if (data) {
                        const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(`chat/${session.user.id}/${fileName}`);
                        sendMessage("image", publicUrl);
                      }
                    }} />
                  </label>
                  <button onClick={async () => {
                    navigator.geolocation.getCurrentPosition(async (pos) => {
                      const url = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
                      sendMessage("location", url);
                    });
                  }} className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all group">
                    <MapPin className="w-6 h-6 text-red-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Location</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}
