"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Send, Plus, Camera, Image as ImageIcon, MapPin, 
    Video, Mic, X, Download, Shield, AlertTriangle,
    Eye, EyeOff, Save, Trash2, ShieldCheck, Lock,
    Sparkles, Zap, ChevronLeft, Phone, Check, CheckCheck, ArrowLeft, ArrowLeft as BackIcon,
    MoreVertical, Info, Clock, Trash, Heart, Smile, ThumbsUp, ThumbsDown, MessageSquare
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
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

export function Chat({ session, privateKey, initialContact, isPartnerOnline, onBack, onInitiateCall }: ChatProps) {
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
  const [lastReadTimestamp, setLastReadTimestamp] = useState<string | null>(null);
  const [chatSettings, setChatSettings] = useState<any>({
    delete_after_view: false,
    delete_after_3_hours: false,
    is_saved: false
  });
  const [reactionMenuFor, setReactionMenuFor] = useState<string | null>(null);
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

  useEffect(() => {
    if (initialContact) fetchChatSettings();
  }, [initialContact]);

  async function fetchChatSettings() {
    const { data } = await supabase
      .from("chat_settings")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("contact_id", initialContact.id)
      .single();

    if (data) {
      setChatSettings(data);
    } else {
      const { data: newSettings } = await supabase.from("chat_settings").insert({
        user_id: session.user.id,
        contact_id: initialContact.id,
        delete_after_view: false,
        delete_after_3_hours: false,
        is_saved: false
      }).select().single();
      if (newSettings) setChatSettings(newSettings);
    }
  }

  async function updateChatSettings(updates: any) {
    const newSettings = { ...chatSettings, ...updates };
    setChatSettings(newSettings);
    await supabase
      .from("chat_settings")
      .update(updates)
      .eq("user_id", session.user.id)
      .eq("contact_id", initialContact.id);
    toast.success("Settings synced");
  }

  async function toggleMessageSave(message: any) {
    const { error } = await supabase
      .from("messages")
      .update({ is_saved: !message.is_saved })
      .eq("id", message.id);
    
    if (!error) {
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_saved: !m.is_saved } : m));
      toast.success(message.is_saved ? "Intelligence unsaved" : "Intelligence secured");
    }
  }

  async function addReaction(messageId: string, emoji: string) {
    const message = messages.find(m => m.id === messageId);
    const reactions = message.reactions || {};
    reactions[session.user.id] = emoji;
    const { error } = await supabase
      .from("messages")
      .update({ reactions })
      .eq("id", messageId);
    if (!error) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    }
    setReactionMenuFor(null);
  }

  useEffect(() => {
    if (!isFocused && showSnapshotView) {
      toast.error("Security Alert: Unauthorized access attempt detected. Snapshot obscured.");
    }
  }, [isFocused, showSnapshotView]);

  async function saveToVault(message: any) {
    if (!vaultPassword) {
      toast.error("Enter vault password to authorize storage");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("vault_password").eq("id", session.user.id).single();
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
      config: { presence: { key: session.user.id } },
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
    return () => { channel.unsubscribe(); };
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
      let filteredData = data || [];
      if (chatSettings.delete_after_view) {
        const toDelete = filteredData.filter(m => m.receiver_id === session.user.id && m.is_viewed && !m.is_saved);
        if (toDelete.length > 0) {
          const ids = toDelete.map(m => m.id);
          await supabase.from("messages").delete().in("id", ids);
          filteredData = filteredData.filter(m => !ids.includes(m.id));
        }
      }
      setMessages(filteredData);
      const unviewed = filteredData.filter(m => m.receiver_id === session.user.id && !m.is_viewed);
      if (unviewed.length > 0) {
        const ids = unviewed.map(m => m.id);
        await supabase.from("messages").update({ is_viewed: true, viewed_at: new Date().toISOString() }).in("id", ids);
      }
    }
    setLoading(false);
  }

  function subscribeToMessages() {
    return supabase
      .channel(`chat-${initialContact.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${session.user.id}` }, async (payload) => {
        if (payload.new.sender_id === initialContact.id) {
          setMessages(prev => [...prev, payload.new]);
          await supabase.from("messages").update({ is_delivered: true, delivered_at: new Date().toISOString() }).eq("id", payload.new.id);
          if (payload.new.media_type === 'snapshot') {
            toast.info("Secure Snapshot Received", { icon: <Camera className="w-4 h-4 text-purple-500" /> });
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .subscribe();
  }

  useEffect(() => {
    if (partnerPresence.isOnline) {
      const markDelivered = async () => {
        const undelivered = messages.filter(m => m.sender_id === session.user.id && !m.is_delivered);
        if (undelivered.length > 0) {
          const ids = undelivered.map(m => m.id);
          await supabase.from("messages").update({ is_delivered: true, delivered_at: new Date().toISOString() }).in("id", ids);
        }
      };
      markDelivered();
    }
  }, [partnerPresence.isOnline, messages.length]);

  async function sendMessage(mediaType: string = "text", mediaUrl: string | null = null) {
    if (!newMessage.trim() && !mediaUrl) return;
    const expiresAt = chatSettings.delete_after_3_hours ? new Date(Date.now() + 3 * 3600 * 1000).toISOString() : null;
    const messageData = {
      sender_id: session.user.id,
      receiver_id: initialContact.id,
      encrypted_content: newMessage.trim() || " ", 
      media_type: mediaType,
      media_url: mediaUrl,
      is_viewed: false,
      is_delivered: partnerPresence.isOnline,
      delivered_at: partnerPresence.isOnline ? new Date().toISOString() : null,
      expires_at: expiresAt,
      is_saved: chatSettings.is_saved
    };
    const { data, error } = await supabase.from("messages").insert(messageData).select();
    if (error) {
      toast.error("Packet transmission failed");
    } else {
      setMessages(prev => [...prev, data?.[0] || messageData]);
      setNewMessage("");
      setShowOptions(false);
    }
  }

  const handleLiveLocation = async () => {
    navigator.geolocation.getCurrentPosition(async (position) => {
      await sendMessage("location", `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isSnapshot: boolean = false, type: "image" | "video" | "audio" = "image") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filePath = `chat/${session.user.id}/${Math.random()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("chat-media").upload(filePath, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(filePath);
      await sendMessage(isSnapshot ? "snapshot" : type, publicUrl);
    }
  };

  const openSnapshot = async (message: any) => {
    if (message.is_viewed && message.sender_id !== session.user.id) return;
    setShowSnapshotView(message);
    if (message.receiver_id === session.user.id) await supabase.from("messages").update({ is_viewed: true }).eq("id", message.id);
  };

  const saveToDevice = async (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `chatify-${Date.now()}`;
    link.click();
  };

  if (!initialContact) return null;

  return (
    <div className="flex flex-col h-full bg-[#030303] relative overflow-hidden select-none">
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-3xl flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/20 hover:text-white mr-1 lg:hidden bg-white/5 rounded-xl"><ArrowLeft className="w-6 h-6" /></Button>
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
          <Popover>
            <PopoverTrigger asChild><Button variant="ghost" size="icon" className="text-white/20 hover:text-white hover:bg-white/5 rounded-xl"><MoreVertical className="w-4 h-4" /></Button></PopoverTrigger>
            <PopoverContent className="w-64 bg-[#0a0a0a] border-white/5 p-4 rounded-[2rem] shadow-2xl backdrop-blur-3xl z-[100]">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><Save className="w-4 h-4 text-indigo-400" /><span className="text-[10px] font-black uppercase tracking-widest text-white">Save Chat</span></div>
                  <Switch checked={chatSettings.is_saved} onCheckedChange={(checked) => updateChatSettings({ is_saved: checked })} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><EyeOff className="w-4 h-4 text-purple-400" /><span className="text-[10px] font-black uppercase tracking-widest text-white">Delete View</span></div>
                  <Switch checked={chatSettings.delete_after_view} onCheckedChange={(checked) => updateChatSettings({ delete_after_view: checked })} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><Clock className="w-4 h-4 text-orange-400" /><span className="text-[10px] font-black uppercase tracking-widest text-white">3h Auto Purge</span></div>
                  <Switch checked={chatSettings.delete_after_3_hours} onCheckedChange={(checked) => updateChatSettings({ delete_after_3_hours: checked })} />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {messages.map((msg, i) => {
          const isMe = msg.sender_id === session.user.id;
          const isSaved = msg.is_saved;
          return (
            <motion.div key={msg.id} initial={{ opacity: 0, x: isMe ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div 
                  onClick={() => setReactionMenuFor(msg.id)}
                  className={`group relative p-5 rounded-[2rem] text-sm font-medium transition-all cursor-pointer ${
                    isSaved ? "bg-white/10 backdrop-blur-md border border-white/20 text-white/90" : 
                    isMe ? "bg-indigo-600 text-white shadow-xl" : "bg-white/[0.03] border border-white/5 text-white/90"
                  }`}
                >
                  {msg.media_type === 'snapshot' ? "Snapshot (Click to view)" : msg.media_type === 'image' ? <img src={msg.media_url} className="max-h-60 rounded-xl" /> : msg.encrypted_content}
                  
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="absolute -bottom-3 right-2 flex gap-1">
                      {Object.values(msg.reactions).map((emoji: any, i) => <span key={i} className="text-xs bg-black/40 px-1 rounded-full">{emoji}</span>)}
                    </div>
                  )}

                  <div className="absolute -top-8 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onClick={() => toggleMessageSave(msg)} className="p-1.5 bg-black/60 rounded-full hover:bg-indigo-500"><Save className={`w-3 h-3 ${isSaved ? 'text-indigo-400' : 'text-white'}`} /></button>
                  </div>
                </div>
                
                {reactionMenuFor === msg.id && (
                  <div className="flex gap-2 p-2 bg-black/80 backdrop-blur-xl rounded-full border border-white/10 mt-2">
                    {["❤️", "👍", "🔥", "😂", "😮"].map(emoji => (
                      <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="hover:scale-125 transition-transform">{emoji}</button>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center gap-2 mt-2 px-2">
                  <span className="text-[7px] font-black uppercase tracking-widest text-white/10">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {isMe && <CheckCheck className={`w-2.5 h-2.5 ${msg.is_viewed ? 'text-blue-500' : 'text-white/20'}`} />}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-6 bg-black/40 backdrop-blur-3xl border-t border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setShowOptions(!showOptions)} className="h-12 w-12 rounded-2xl bg-white/5"><Plus className="w-6 h-6" /></Button>
          <input value={newMessage} onChange={handleTyping} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Type message..." className="flex-1 bg-white/[0.03] border border-white/10 rounded-[2rem] h-12 px-6 text-sm outline-none focus:border-indigo-500/50" />
          <Button onClick={() => sendMessage()} disabled={!newMessage.trim()} className="h-12 w-12 rounded-2xl bg-indigo-600"><Send className="w-5 h-5" /></Button>
        </div>
        {showOptions && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="p-4 bg-white/5 rounded-2xl flex flex-col items-center cursor-pointer"><ImageIcon className="w-6 h-6 mb-2" /><span className="text-[8px] font-black uppercase">Photo</span><input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e)} /></label>
            <label className="p-4 bg-white/5 rounded-2xl flex flex-col items-center cursor-pointer"><Camera className="w-6 h-6 mb-2" /><span className="text-[8px] font-black uppercase">Snapshot</span><input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, true)} /></label>
          </div>
        )}
      </footer>

      <AnimatePresence>
        {showSnapshotView && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-6">
            <div className="relative max-w-2xl w-full aspect-[3/4] bg-black rounded-[3rem] overflow-hidden border border-white/10">
              <img src={showSnapshotView.media_url} className="w-full h-full object-contain" />
              <Button onClick={() => setShowSnapshotView(null)} className="absolute top-8 right-8 bg-indigo-600 rounded-full h-12 w-12"><X /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
