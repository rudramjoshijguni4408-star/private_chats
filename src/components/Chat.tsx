"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Send, Plus, Camera, Image as ImageIcon, MapPin, 
    Video, Mic, X, Download, Shield, AlertTriangle,
    Eye, EyeOff, Save, Trash2, ShieldCheck, Lock,
    Sparkles, Zap, ChevronLeft, Phone, Check, CheckCheck, ArrowLeft, ArrowLeft as BackIcon
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
      if (!isFocused && showSnapshotView) {
        toast.error("Security Alert: Unauthorized access attempt detected. Snapshot obscured.");
      }
    }, [isFocused, showSnapshotView]);

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

    // Update typing status with debounce
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
        
          // Auto-delete cleanup (3 hours post-view)
          const cleanupInterval = setInterval(async () => {
            // Call the database function for comprehensive cleanup
            await supabase.rpc('purge_viewed_content');
            
            fetchMessages();
          }, 60000); // Check every minute

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
        setMessages(data || []);
        
        // Mark unread messages as viewed
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
            
            // Mark as delivered immediately upon receipt
            await supabase.from("messages").update({ 
              is_delivered: true,
              delivered_at: new Date().toISOString()
            }).eq("id", payload.new.id);

            if (payload.new.media_type === 'snapshot') {
              toast.info("Secure Snapshot Received", {
                description: "A one-time view intelligence packet has arrived.",
                icon: <Camera className="w-4 h-4 text-purple-500" />
              });
            }
          }
        })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages"
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .subscribe();
  }

    // Mark undelivered messages as delivered when partner comes online
    useEffect(() => {
      if (partnerPresence.isOnline) {
        const markDelivered = async () => {
          const undelivered = messages.filter(m => m.sender_id === session.user.id && !m.is_delivered);
          if (undelivered.length > 0) {
            const ids = undelivered.map(m => m.id);
            await supabase.from("messages").update({ 
              is_delivered: true, 
              delivered_at: new Date().toISOString() 
            }).in("id", ids);
          }
        };
        markDelivered();
      }
    }, [partnerPresence.isOnline, messages.length]);

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
        delivered_at: partnerPresence.isOnline ? new Date().toISOString() : null
      };
  
      const { data, error } = await supabase.from("messages").insert(messageData).select();
  
      if (error) {
        console.error("Transmission error:", error);
        toast.error("Packet transmission failed: " + (error.message || "Protocol Error"));
      } else {
        const sentMsg = data?.[0] || messageData;
        setMessages(prev => [...prev, sentMsg]);
        setNewMessage("");
        setShowOptions(false);
      }
    }

  const handleLiveLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your node");
      return;
    }

    toast.loading("Establishing high-accuracy satellite link...");
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const locationUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        
        await sendMessage("location", locationUrl);
        toast.dismiss();
        toast.success("Live Location Shared");
      },
      (error) => {
        toast.dismiss();
        toast.error("Failed to establish satellite link: " + error.message);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isSnapshot: boolean = false, type: "image" | "video" | "audio" = "image") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `chat/${session.user.id}/${fileName}`;

    toast.loading(isSnapshot ? "Securing snapshot..." : `Uploading ${type} packet...`);

    const { error: uploadError } = await supabase.storage
      .from("chat-media")
      .upload(filePath, file);

    if (uploadError) {
      toast.dismiss();
      toast.error("Upload failed");
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("chat-media")
      .getPublicUrl(filePath);

    toast.dismiss();
    await sendMessage(isSnapshot ? "snapshot" : type, publicUrl);
    toast.success(isSnapshot ? "Snapshot deployed" : `${type.charAt(0).toUpperCase() + type.slice(1)} transmitted`);
  };

    const openSnapshot = async (message: any) => {
      if (message.is_viewed && message.sender_id !== session.user.id) {
        toast.error("Snapshot expired: Data purged");
        return;
      }
      setShowSnapshotView(message);
      
      if (message.receiver_id === session.user.id) {
        // Mark as viewed and trigger deletion after a short delay or when closed
        await supabase.from("messages").update({ is_viewed: true }).eq("id", message.id);
      }
    };

    const toggleSaveSnapshot = async (message: any) => {
      const newSavedState = !message.is_saved;
      const { error } = await supabase
        .from("messages")
        .update({ is_saved: newSavedState })
        .eq("id", message.id);

      if (error) {
        toast.error("Failed to update intelligence status");
      } else {
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_saved: newSavedState } : m));
        setShowSnapshotView(prev => prev?.id === message.id ? { ...prev, is_saved: newSavedState } : prev);
        toast.success(newSavedState ? "Intelligence secured in node" : "Intelligence set to self-destruct");
      }
    };

    const closeSnapshot = async () => {
      if (showSnapshotView && showSnapshotView.receiver_id === session.user.id) {
        if (!showSnapshotView.is_saved) {
          // Purge immediately upon closing if NOT saved
          await supabase.from("messages").delete().eq("id", showSnapshotView.id);
          setMessages(prev => prev.filter(m => m.id !== showSnapshotView.id));
        }
      }
      setShowSnapshotView(null);
    };

  const saveToDevice = async (url: string, name: string = "nexus-media") => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${name}-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Intelligence saved to device");
    } catch (err) {
      toast.error("Download failed: Protocol error");
    }
  };

  if (!initialContact) return null;

  return (
    <div className="flex flex-col h-full bg-[#030303] relative overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* Screenshot protection overlay (CSS only) */}
      <style jsx global>{`
        @media print {
          body { display: none; }
        }
        .no-screenshot {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          -khtml-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
      `}</style>

          {/* Header */}
          <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-3xl flex items-center justify-between px-6 z-20 shrink-0">
              <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={onBack} 
                    className="text-white/20 hover:text-white mr-1 lg:hidden bg-white/5 rounded-xl border border-white/5"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </Button>
                  {onBack && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={onBack} 
                      className="text-white/20 hover:text-white mr-2 hidden lg:flex"
                    >
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
            return (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {msg.media_type === 'snapshot' ? (
                      <button 
                        onClick={() => openSnapshot(msg)}
                        className={`group relative p-4 rounded-[2rem] border transition-all ${
                          msg.is_saved 
                            ? "bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                            : msg.is_viewed && !isMe 
                            ? "bg-zinc-900/50 border-white/5 opacity-50 cursor-not-allowed" 
                            : "bg-purple-600/10 border-purple-500/30 hover:bg-purple-600/20"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${msg.is_saved ? "bg-yellow-500/20" : "bg-purple-500/20"}`}>
                            {msg.is_saved ? <Save className="w-5 h-5 text-yellow-500" /> : (msg.is_viewed && !isMe ? <EyeOff className="w-5 h-5 text-purple-400" /> : <Camera className="w-5 h-5 text-purple-400" />)}
                          </div>
                          <div className="text-left">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${msg.is_saved ? "text-yellow-500" : "text-white"}`}>
                              {msg.is_saved ? "Secured Intelligence" : "Snapshot"}
                            </p>
                            <p className={`text-[8px] font-bold uppercase tracking-tighter ${msg.is_saved ? "text-yellow-500/60" : "text-purple-400"}`}>
                              {msg.is_saved ? "Permanent Access" : (msg.is_viewed && !isMe ? "Already Viewed" : "One-Time Intelligence")}
                            </p>
                          </div>
                          {msg.is_saved && (
                            <div className="absolute -top-1 -right-1">
                              <Sparkles className="w-4 h-4 text-yellow-500 animate-pulse" />
                            </div>
                          )}
                        </div>
                      </button>
                    ) : msg.media_type === 'image' ? (

                        <div className="group relative rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl">
                          <img src={msg.media_url} alt="" className="max-w-full max-h-80 object-cover" />
                          <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => toggleSaveSnapshot(msg)}
                              className={`p-3 backdrop-blur-md rounded-2xl transition-all ${msg.is_saved ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-black/60 text-white hover:bg-indigo-600'}`}
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setShowSaveToVault(msg)}
                              className="p-3 bg-black/60 backdrop-blur-md rounded-2xl text-white hover:bg-indigo-600"
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => saveToDevice(msg.media_url, "nexus-intel")}
                              className="p-3 bg-black/60 backdrop-blur-md rounded-2xl text-white hover:bg-indigo-600"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>


                    ) : msg.media_type === 'location' ? (
                      <div className={`p-5 rounded-[2rem] border transition-all ${
                        isMe ? "bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-600/20" : "bg-white/[0.03] border-white/5"
                      }`}>
                        <div className="flex items-center gap-4">
                          <MapPin className="w-6 h-6 text-white animate-pulse" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white">Live Satellite Link</p>
                            <Button 
                              variant="link" 
                              onClick={() => window.open(msg.media_url, '_blank')}
                              className="text-white font-bold p-0 h-auto underline text-[10px] uppercase tracking-tighter"
                            >
                              Open Satellite View
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                          <div className={`group/msg relative p-5 rounded-[2rem] text-sm font-medium leading-relaxed transition-all ${
                          msg.is_saved 
                            ? "bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.1)]"
                            : isMe 
                            ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/10" 
                            : "bg-white/[0.03] border border-white/5 text-white/90"
                        }`}>
                          {msg.encrypted_content}
                          <div className={`absolute ${isMe ? '-left-16' : '-right-16'} top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all`}>
                            <button 
                              onClick={() => toggleSaveSnapshot(msg)}
                              className={`p-2 rounded-xl transition-all ${msg.is_saved ? 'text-yellow-500 bg-yellow-500/10' : 'text-white/20 hover:text-white'}`}
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteMessage(msg.id)}
                              className="p-2 text-white/10 hover:text-red-500 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {msg.is_saved && (
                            <div className="absolute -top-1 -right-1">
                              <Sparkles className="w-3 h-3 text-yellow-500 animate-pulse" />
                            </div>
                          )}
                        </div>

                    )}
                      <div className="flex items-center gap-2 mt-2 px-2">
                        <span className="text-[7px] font-black uppercase tracking-widest text-white/10">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                            {isMe && (
                              <div className="flex items-center">
                                {msg.is_viewed ? (
                                  <CheckCheck className="w-2.5 h-2.5 text-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                ) : msg.is_delivered ? (
                                  <CheckCheck className="w-2.5 h-2.5 text-white/90" />
                                ) : (
                                  <Check className="w-2.5 h-2.5 text-zinc-600" />
                                )}
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

        {/* Real-time Indicators */}
        <div className="absolute bottom-24 left-6 flex flex-col gap-4 pointer-events-none z-40">
          <AnimatePresence>
            {partnerPresence.isInChat && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="relative flex items-center gap-3"
              >
                {/* The "blur circle" requested by user */}
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 blur-xl animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400">Partner in Chat</span>
                  <span className="text-[7px] font-bold uppercase tracking-widest text-white/30 leading-none">Uplink Synced</span>
                </div>
              </motion.div>
            )}
            
            {partnerPresence.isTyping && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-3 ml-2"
              >
                <div className="flex items-center justify-center w-8 h-8">
                  {/* The "ball up down" requested by user */}
                  <motion.div 
                    animate={{ 
                      y: [-12, 12, -12],
                    }}
                    transition={{ 
                      duration: 0.6, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }}
                    className="w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  />
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400 animate-pulse">Typing...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
      <footer className="p-6 bg-black/40 backdrop-blur-3xl border-t border-white/5 relative z-30 shrink-0">
        <div className="flex items-center gap-3 relative">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowOptions(!showOptions)}
            className={`h-12 w-12 rounded-2xl transition-all ${showOptions ? 'bg-indigo-600 text-white rotate-45' : 'bg-white/5 text-white/20'}`}
          >
            <Plus className="w-6 h-6" />
          </Button>
          
            <input 
              value={newMessage}
              onChange={handleTyping}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type intelligence packet..."
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-[2rem] h-12 px-6 text-sm font-medium outline-none focus:border-indigo-500/50 transition-all placeholder:text-white/10"
            />

          <Button 
            onClick={() => sendMessage()}
            disabled={!newMessage.trim()}
            className="h-12 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 disabled:opacity-20"
          >
            <Send className="w-5 h-5" />
          </Button>

          <AnimatePresence>
            {showOptions && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute bottom-20 left-0 w-64 bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-4 shadow-2xl z-50 overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all cursor-pointer group">
                      <ImageIcon className="w-6 h-6 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Photo</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, false, "image")} />
                    </label>
                    
                    <label className="flex flex-col items-center justify-center p-4 bg-purple-600/5 border border-purple-500/20 rounded-2xl hover:bg-purple-600/20 hover:border-purple-500/40 transition-all cursor-pointer group">
                      <Camera className="w-6 h-6 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Snapshot</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, true, "image")} />
                    </label>

                    <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all cursor-pointer group">
                      <Video className="w-6 h-6 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Video</span>
                      <input type="file" className="hidden" accept="video/*" onChange={(e) => handleFileUpload(e, false, "video")} />
                    </label>

                    <label className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all cursor-pointer group">
                      <Mic className="w-6 h-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Audio</span>
                      <input type="file" className="hidden" accept="audio/*" onChange={(e) => handleFileUpload(e, false, "audio")} />
                    </label>

                    <button 
                      onClick={handleLiveLocation}
                      className="col-span-2 flex items-center justify-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all group"
                    >
                      <MapPin className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/60">Broadcast Live Satellite Link</span>
                    </button>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </footer>

        {/* Save to Vault Modal */}
        <AnimatePresence>
          {showSaveToVault && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-10 rounded-[3rem] space-y-8">
                <div className="text-center space-y-2">
                  <Shield className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-black uppercase italic">Vault Authorization</h3>
                  <p className="text-zinc-500 text-sm">Secure this intelligence packet in your private vault. Enter vault password to proceed.</p>
                </div>
                <div className="space-y-4">
                  <Input 
                    type="password"
                    placeholder="Enter Vault Password"
                    value={vaultPassword}
                    onChange={(e) => setVaultPassword(e.target.value)}
                    className="h-14 bg-zinc-800 border-zinc-700 rounded-2xl px-6 text-center tracking-widest"
                  />
                  <div className="flex gap-4">
                    <Button variant="ghost" onClick={() => setShowSaveToVault(null)} className="flex-1 h-14 rounded-2xl uppercase font-bold text-[10px]">Cancel</Button>
                    <Button onClick={() => saveToVault(showSaveToVault)} className="flex-1 h-14 rounded-2xl bg-indigo-600 uppercase font-bold text-[10px]">Secure Intel</Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Snapshot Modal */}

      <AnimatePresence>
        {showSnapshotView && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black backdrop-blur-3xl flex items-center justify-center p-6"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-purple-950/20 to-black pointer-events-none" />
            <div className={`relative w-full max-w-2xl aspect-[3/4] md:aspect-[4/3] bg-black rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl group flex flex-col transition-all duration-500 ${!isFocused ? 'blur-3xl scale-95 opacity-50' : 'blur-0 scale-100 opacity-100'}`}>
              <div className="flex-1 overflow-hidden relative">
                <img 
                  src={showSnapshotView.media_url} 
                  alt="" 
                  className="w-full h-full object-contain pointer-events-none select-none" 
                  onDragStart={(e) => e.preventDefault()}
                />
                
                {/* Security watermarks */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03] flex flex-wrap gap-20 p-20 rotate-12">
                   {Array.from({ length: 40 }).map((_, i) => (
                     <span key={i} className="text-2xl font-black italic whitespace-nowrap">ANTI_SCREENSHOT_PROTOCOL_{session.user.id.substring(0, 8)}</span>
                   ))}
                </div>

                {!isFocused && (
                  <div className="absolute inset-0 flex items-center justify-center z-50">
                    <div className="bg-black/80 backdrop-blur-md p-8 rounded-[2rem] border border-white/10 text-center">
                      <Lock className="w-12 h-12 text-red-500 mx-auto mb-4 animate-pulse" />
                      <p className="text-xl font-black italic text-white uppercase tracking-tighter">Privacy Lock Active</p>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-2">Return focus to view intelligence</p>
                    </div>
                  </div>
                )}
              </div>

                <div className="p-10 bg-black/80 backdrop-blur-xl border-t border-white/5 flex items-center justify-between">
                  <div>
                    <h4 className={`text-xl font-black italic uppercase tracking-tighter ${showSnapshotView.is_saved ? "text-yellow-500" : "text-white"}`}>
                      {showSnapshotView.is_saved ? "Secured Intelligence" : "Temporal Snapshot"}
                    </h4>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-2 ${showSnapshotView.is_saved ? "text-yellow-500/60" : "text-purple-400"}`}>
                      {showSnapshotView.is_saved ? (
                        <><ShieldCheck className="w-3 h-3" /> Intelligence secured in local node</>
                      ) : (
                        <><AlertTriangle className="w-3 h-3" /> This intelligence will self-destruct upon closing</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <Button 
                      onClick={() => toggleSaveSnapshot(showSnapshotView)}
                      variant="ghost" 
                      className={`h-16 px-8 rounded-2xl font-black tracking-widest text-[10px] uppercase transition-all ${
                        showSnapshotView.is_saved 
                          ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/50 hover:bg-yellow-500/20" 
                          : "bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      <Save className="w-4 h-4 mr-3" /> {showSnapshotView.is_saved ? "Secured" : "Save Intel"}
                    </Button>
                    <Button 
                      onClick={closeSnapshot}
                      className="h-16 px-10 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black tracking-widest text-[10px] uppercase"
                    >
                      Close Protocol
                    </Button>
                  </div>
                </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
