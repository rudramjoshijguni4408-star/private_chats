"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  MessageCircle, Video as VideoIcon, Phone, MapPin, Settings, LogOut, Users, Bell,
  Search, ChevronRight, Clock, Shield, Zap, Globe, Activity, Plus,
  Home, Camera, Mic, Send, X, Menu, User, Heart, Star, Sparkles, ArrowLeft,
  Radio, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { Chat } from "@/components/Chat";
import { Stories } from "@/components/Stories";
import { ProfileSettings } from "@/components/ProfileSettings";
import { VideoCall } from "@/components/VideoCall";
import { PrivateSafe } from "@/components/PrivateSafe";
import { PasswordGate } from "@/components/PasswordGate";

type ActiveView = "dashboard" | "chat" | "vault" | "calls" | "settings";

interface UserDashboardViewProps {
  session: any;
  privateKey: CryptoKey;
}

export function UserDashboardView({ session, privateKey }: UserDashboardViewProps) {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [isChatUnlocked, setIsChatUnlocked] = useState(false);

  useEffect(() => {
    const unlocked = sessionStorage.getItem("chat_unlocked") === "true";
    setIsChatUnlocked(unlocked);
  }, []);

  const [myProfile, setMyProfile] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
    const [activeCall, setActiveCall] = useState<any>(null);
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const [broadcasts, setBroadcasts] = useState<any[]>([]);
    const [systemConfig, setSystemConfig] = useState<any>({});
    const [unviewedSnapshots, setUnviewedSnapshots] = useState<any[]>([]);
    const [chatSearchQuery, setChatSearchQuery] = useState("");
    const notificationSound = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
      notificationSound.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");
    }, []);

      useEffect(() => {
        // Register Service Worker for mobile/background notifications
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js').then((registration) => {
            console.log('Service Worker registered with scope:', registration.scope);
          }).catch((error) => {
            console.error('Service Worker registration failed:', error);
          });
        }

        fetchProfile();
        fetchProfiles();
        fetchRecentChats();
        fetchBroadcasts();
        fetchSystemConfig();
        fetchUnviewedSnapshots();
        fetchUnreadCount();
        const cleanup = setupRealtimeSubscriptions();

          const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
              updateOnlineStatus(true);
            } else {
              // Quick update for offline status
              setTimeout(() => {
                if (document.visibilityState !== 'visible') {
                  updateOnlineStatus(false);
                }
              }, 1000); 
            }
          };

        const handleFocus = () => updateOnlineStatus(true);
        // Removed aggressive blur tracking as it causes "offline" when user is still looking
        // const handleBlur = () => updateOnlineStatus(false);

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('beforeunload', () => updateOnlineStatus(false));

        // Initial status
        if (document.visibilityState === 'visible') {
          updateOnlineStatus(true);
        }

        const interval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            updateOnlineStatus(true);
          }
          fetchUnviewedSnapshots();
          supabase.rpc('purge_viewed_content');
        }, 10000); // Reduced to 10s for more "immediate" status

        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }

        return () => {
          clearInterval(interval);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('focus', handleFocus);
          updateOnlineStatus(false);
          cleanup();
        };
      }, [session.user.id]);

      async function updateOnlineStatus(online: boolean = true) {
        // No-op here, handled by Home component
      }


    async function fetchProfile() {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (data) setMyProfile(data);
    }

    async function fetchProfiles() {
      const { data } = await supabase.from("profiles").select("*").neq("id", session.user.id);
      if (data) setProfiles(data);
    }

    async function fetchRecentChats() {
      const { data: messages } = await supabase
        .from("messages")
        .select("sender_id, receiver_id, created_at")
        .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
        .order("created_at", { ascending: false });

      if (messages) {
        const contactIds = Array.from(new Set(messages.flatMap(m => [m.sender_id, m.receiver_id])))
          .filter(id => id !== session.user.id);
        
        if (contactIds.length > 0) {
          const { data: profilesData } = await supabase.from("profiles").select("*").in("id", contactIds);
          if (profilesData) {
            const sorted = contactIds.map(id => profilesData.find(p => p.id === id)).filter(Boolean);
            setRecentChats(sorted);
          }
        }
      }
    }

    async function fetchBroadcasts() {
      const { data } = await supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(1);
      if (data) setBroadcasts(data);
    }

    async function fetchSystemConfig() {
      const { data } = await supabase.from("system_config").select("*").single();
      if (data) setSystemConfig(data);
    }

    async function fetchUnviewedSnapshots() {
      const { data } = await supabase.from("stories").select("*").order("created_at", { ascending: false });
      if (data) setUnviewedSnapshots(data);
    }

    async function fetchUnreadCount() {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: 'exact', head: true })
        .eq("receiver_id", session.user.id)
        .eq("is_viewed", false);
      setUnreadCount(count || 0);
    }

    async function showNotification(title: string, options?: NotificationOptions) {
      // Play sound
      if (notificationSound.current) {
        notificationSound.current.play().catch(e => console.error("Sound play failed:", e));
      }

      // Show browser notification via Service Worker if available for better mobile/background support
      if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === "granted") {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, {
          icon: "/icon.png",
          badge: "/icon.png",
          vibrate: [100, 50, 100],
          ...options
        } as any);
      } else if ("Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(title, {
            icon: "/icon.png",
            badge: "/icon.png",
            ...options
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch (e) {
          console.error("Browser notification failed:", e);
        }
      }
    }

    const presenceChannelRef = useRef<any>(null);

    function setupRealtimeSubscriptions() {
      const broadcastsChannel = supabase.channel("global-broadcasts").on("postgres_changes", { event: "INSERT", schema: "public", table: "broadcasts" }, (payload) => {
        setBroadcasts([payload.new]);
        toast.info("Global Broadcast Received", { description: payload.new.content, icon: <Radio className="w-4 h-4 text-indigo-500" /> });
        showNotification("Global Broadcast", { body: payload.new.content });
      }).subscribe();

      const messagesChannel = supabase.channel("dashboard-messages").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${session.user.id}` }, (payload) => {
        fetchRecentChats();
        fetchUnreadCount();
        toast.info("New message received");
        showNotification("New Message", { body: "You have received a new intelligence packet." });
      }).subscribe();

      const callsChannel = supabase.channel("incoming-calls").on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `receiver_id=eq.${session.user.id}` }, async (payload) => {
        const data = payload.new;
        if (data.type === "offer" && !activeCall && !incomingCall) {
          const { data: caller } = await supabase.from("profiles").select("*").eq("id", data.caller_id).single();
          if (caller) {
            setIncomingCall({ ...data, caller });
            toast.info(`Incoming ${data.call_mode} call from ${caller.username}`, { duration: 10000 });
            showNotification(`Incoming ${data.call_mode} call`, { body: `Call from ${caller.username}` });
          }
        }
      }).subscribe();

      const storiesChannel = supabase.channel("new-stories").on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, async (payload) => {
        if (payload.new.user_id !== session.user.id) {
          const { data: creator } = await supabase.from("profiles").select("username").eq("id", payload.new.user_id).single();
          if (creator) {
            toast.info(`New story from ${creator.username}`, { icon: <Camera className="w-4 h-4 text-pink-500" /> });
            showNotification("New Story", { body: `${creator.username} shared a new temporal snapshot.` });
          }
        }
      }).subscribe();

      const presenceChannel = supabase.channel("online-users").on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const online = new Set<string>();
        Object.values(state).forEach((users: any) => { users.forEach((u: any) => online.add(u.user_id)); });
        setOnlineUsers(online);
      }).subscribe();

      presenceChannelRef.current = presenceChannel;

      return () => {
        supabase.removeChannel(broadcastsChannel);
        supabase.removeChannel(messagesChannel);
        supabase.removeChannel(callsChannel);
        supabase.removeChannel(presenceChannel);
      };
    }

  const handleNavClick = (view: ActiveView) => {
    setActiveView(view);
    if (view !== "chat") setSelectedContact(null);
    setSidebarOpen(false);
  };

  const navItems = [
    { id: "dashboard", icon: Home, label: "Nexus" },
    { id: "chat", icon: MessageCircle, label: "Signals", badge: unreadCount },
    { id: "vault", icon: Shield, label: "Vault" },
    { id: "calls", icon: Phone, label: "Uplink" },
    { id: "settings", icon: Settings, label: "Entity" },
  ];

  if (!myProfile) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#030303]">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Syncing Node</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-[#030303] text-white overflow-hidden font-sans selection:bg-indigo-500/30">
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div key="mobile-menu-wrapper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div key="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden" />
            <motion.div key="mobile-menu-content" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="fixed top-0 left-0 bottom-0 w-[80%] max-w-sm bg-[#050505] border-r border-white/5 z-[101] lg:hidden p-6 flex flex-col">
              <div className="flex items-center justify-between mb-12">
                <h2 className="text-xl font-black italic tracking-tighter uppercase font-accent">Orchids <span className="text-indigo-500">Core</span></h2>
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-white/20 hover:text-white bg-white/5 rounded-xl"><X className="w-5 h-5" /></Button>
              </div>
              <div className="flex items-center gap-4 mb-12 p-4 bg-white/[0.02] border border-white/5 rounded-[2rem]">
                <AvatarDisplay profile={myProfile} className="h-12 w-12" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm uppercase tracking-tight truncate leading-tight font-accent">{myProfile.username}</p>
                  <p className="text-[9px] font-medium text-emerald-500/80 uppercase tracking-wider mt-0.5 font-sans">Online</p>
                </div>
              </div>
              <nav className="flex-1 space-y-1">
                {navItems.map((item) => {
                  const isActive = activeView === item.id;
                  return (
                    <motion.button 
                      key={item.id} 
                      whileTap={{ scale: 0.98 }} 
                      onClick={() => { 
                        handleNavClick(item.id as ActiveView); 
                        setMobileMenuOpen(false); 
                      }} 
                      className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl transition-all relative group overflow-hidden ${
                        isActive 
                          ? 'text-white bg-white/5 border border-white/10 shadow-[inset_0_0_20px_rgba(79,70,229,0.1)]' 
                          : 'text-white/30 hover:text-white hover:bg-white/[0.03]'
                      }`}
                    >
                      {isActive && (
                        <motion.div 
                          layoutId="mobileIndicator" 
                          className="absolute left-0 top-0 bottom-0 w-full z-20 pointer-events-none" 
                          initial={false}
                          style={{ 
                            background: 'linear-gradient(90deg, rgba(79, 70, 229, 0.4) 0%, rgba(79, 70, 229, 0.1) 40%, rgba(79, 70, 229, 0) 100%)',
                            borderLeft: '3px solid #6366f1',
                            boxShadow: 'inset 10px 0 20px -10px rgba(79, 70, 229, 0.5)'
                          }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                      <item.icon className={`w-4 h-4 transition-transform relative z-10 ${isActive ? 'text-indigo-400 scale-110' : 'text-white/20 group-hover:text-white/40'}`} />
                      <span className="text-[10px] font-bold tracking-widest uppercase leading-none relative z-10 font-accent">{item.label}</span>
                    </motion.button>
                  );
                })}
              </nav>
              <Button variant="ghost" onClick={() => supabase.auth.signOut()} className="mt-auto w-full justify-start gap-4 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-[2rem] h-14 px-6 font-accent"><LogOut className="w-5 h-5" /><span className="text-[11px] font-black uppercase tracking-[0.2em]">Sign Out</span></Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.aside initial={{ x: -100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className={`${sidebarOpen ? 'w-80' : 'w-24'} border-r border-white/5 bg-[#050505]/80 backdrop-blur-3xl flex flex-col transition-all duration-500 hidden lg:flex relative z-40 h-full overflow-hidden`}>
        <div className={`p-6 border-b border-white/5 shrink-0 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          <div className="flex items-center gap-5">
            <AvatarDisplay profile={myProfile} className="h-12 w-12" />
            {sidebarOpen && <div className="flex-1 min-w-0"><p className="font-semibold text-sm uppercase tracking-tight truncate font-accent">{myProfile.username}</p></div>}
          </div>
          {sidebarOpen && <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}><Menu className="w-5 h-5" /></Button>}
        </div>
        {!sidebarOpen && <div className="p-4 flex justify-center border-b border-white/5"><Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}><Menu className="w-5 h-5" /></Button></div>}
        <nav className="flex-1 p-6 space-y-3">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <motion.button 
                key={item.id} 
                onClick={() => handleNavClick(item.id as ActiveView)} 
                className={`w-full flex items-center ${sidebarOpen ? 'gap-5 px-5' : 'justify-center'} py-4 rounded-xl transition-all relative group overflow-hidden ${
                  isActive ? 'text-white bg-white/5 border border-white/10 shadow-[inset_0_0_20px_rgba(79,70,229,0.1)]' : 'text-white/30 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                {isActive && (
                  <motion.div 
                    layoutId="desktopIndicator" 
                    className="absolute left-0 top-0 bottom-0 w-full z-20 pointer-events-none" 
                    initial={false}
                    style={{ 
                      background: 'linear-gradient(90deg, rgba(79, 70, 229, 0.4) 0%, rgba(79, 70, 229, 0.1) 40%, rgba(79, 70, 229, 0) 100%)',
                      borderLeft: '3px solid #6366f1',
                      boxShadow: 'inset 10px 0 20px -10px rgba(79, 70, 229, 0.5)'
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon className={`w-5 h-5 transition-transform relative z-10 ${isActive ? 'text-indigo-400 scale-110' : 'text-white/20 group-hover:text-white/40'}`} />
                {sidebarOpen && <span className="text-[10px] font-bold tracking-widest uppercase relative z-10 font-accent">{item.label}</span>}
              </motion.button>
            );
          })}
        </nav>
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0 bg-[#030303] relative overflow-hidden h-full">
        <header className="lg:hidden h-20 border-b border-white/5 bg-[#050505]/80 backdrop-blur-3xl flex items-center justify-between px-6 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-white/20"><Menu className="w-6 h-6" /></Button>
            <h1 className="text-lg font-black italic tracking-tighter uppercase font-accent">Orchids <span className="text-indigo-500">Core</span></h1>
          </div>
          <AvatarDisplay profile={myProfile} className="h-10 w-10" />
        </header>

        <main className="flex-1 min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeView === "dashboard" && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} className="h-full overflow-y-auto custom-scrollbar p-5 sm:p-8 md:p-12 space-y-8 md:space-y-12 pb-32 lg:pb-12">
                {broadcasts.length > 0 && (
                  <div className="bg-indigo-600 rounded-[2rem] p-6 text-white">
                    <div className="flex items-center gap-3 mb-4"><Radio className="w-4 h-4 animate-pulse" /><span className="text-[10px] font-black uppercase tracking-[0.4em]">Broadcast</span></div>
                    <p className="text-xl font-black italic">"{broadcasts[0].content}"</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[
                    { label: "Signals", value: unreadCount, icon: MessageCircle, color: "from-indigo-600 to-indigo-700" },
                    { label: "Nodes", value: onlineUsers.size, icon: Users, color: "from-emerald-600 to-emerald-700" },
                    { label: "Entities", value: profiles.length, icon: User, color: "from-purple-600 to-purple-700" },
                    { label: "Security", value: "E2EE", icon: Shield, color: "from-orange-600 to-orange-700" }
                  ].map((stat, i) => (
                    <div key={i} className={`bg-gradient-to-br ${stat.color} p-6 rounded-[2rem] shadow-xl`}>
                      <stat.icon className="w-6 h-6 text-white mb-4" />
                      <p className="text-3xl font-black italic text-white">{stat.value}</p>
                      <p className="text-[10px] font-black text-white/80 uppercase tracking-widest mt-2">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-6">
                  <div className="flex items-center gap-4 mb-6"><Camera className="w-5 h-5 text-indigo-400" /><h3 className="text-sm font-black uppercase tracking-[0.3em] font-accent">Temporal Stories</h3></div>
                  <Stories userId={session.user.id} />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6">
                    <h3 className="text-sm font-black uppercase tracking-[0.3em] mb-6 font-accent">Recent Channels</h3>
                    <div className="space-y-2">
                      {recentChats.map(chat => (
                        <button key={chat.id} onClick={() => { setSelectedContact(chat); setActiveView("chat"); }} className="w-full flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-all">
                          <AvatarDisplay profile={chat} className="h-10 w-10" />
                          <div className="flex-1 text-left"><p className="font-black text-sm uppercase italic font-accent">{chat.username}</p></div>
                          <ChevronRight className="w-4 h-4 text-white/10" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6">
                    <h3 className="text-sm font-black uppercase tracking-[0.3em] mb-6 font-accent">Global Nodes</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {profiles.map(p => (
                        <div key={p.id} onClick={() => { setSelectedContact(p); setActiveView("chat"); }} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col items-center gap-3 cursor-pointer hover:border-indigo-500/30">
                          <AvatarDisplay profile={p} className="h-10 w-10" />
                          <p className="text-[10px] font-black uppercase font-accent">{p.username}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {activeView === "chat" && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                {!isChatUnlocked ? (
                  <PasswordGate 
                    correctPassword="040408" 
                    onUnlock={() => {
                      sessionStorage.setItem("chat_unlocked", "true");
                      setIsChatUnlocked(true);
                    }}
                    title="Signal Uplink"
                    subtitle="Encrypted Channel"
                    description="Authorization code required to decrypt message matrix."
                  />
                ) : !selectedContact ? (
                  <div className="h-full flex flex-col p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                      <h2 className="text-2xl font-black uppercase italic font-accent">Signal Channels</h2>
                      <div className="relative group w-full md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-indigo-400 transition-colors" />
                        <input 
                          placeholder="Search channels..."
                          value={chatSearchQuery}
                          onChange={(e) => setChatSearchQuery(e.target.value)}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3 pl-12 pr-6 text-sm outline-none focus:border-indigo-500/50 transition-all placeholder:text-white/10"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pr-2 pb-24">
                      {profiles.filter(p => p.username.toLowerCase().includes(chatSearchQuery.toLowerCase())).length === 0 ? (
                        <div className="col-span-full py-20 text-center opacity-20">
                          <Search className="w-12 h-12 mx-auto mb-4" />
                          <p className="text-sm font-black uppercase tracking-widest">No matching channels found</p>
                        </div>
                      ) : (
                        profiles
                          .filter(p => p.username.toLowerCase().includes(chatSearchQuery.toLowerCase()))
                          .map(p => (
                            <button key={p.id} onClick={() => { setSelectedContact(p); if (window.innerWidth < 1024) setActiveView("chat"); }} className="flex items-center gap-4 p-6 bg-white/[0.02] border border-white/5 rounded-[2.5rem] hover:bg-white/[0.05] transition-all group">
                              <AvatarDisplay profile={p} className="h-14 w-14 group-hover:scale-110 transition-transform" />
                              <div className="flex-1 text-left">
                                <p className="font-black text-lg uppercase italic font-accent">{p.username}</p>
                                <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${onlineUsers.has(p.id) ? 'bg-emerald-500 animate-pulse' : 'bg-white/10'}`} />
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{onlineUsers.has(p.id) ? 'Online' : 'Offline'}</p>
                                </div>
                              </div>
                              <ChevronRight className="w-5 h-5 text-white/10 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                ) : (
                  <Chat 
                    session={session} 
                    privateKey={privateKey} 
                    initialContact={selectedContact} 
                    isPartnerOnline={onlineUsers.has(selectedContact.id)}
                    onBack={() => setSelectedContact(null)}
                    onInitiateCall={(c, m) => setActiveCall({ contact: c, mode: m, isInitiator: true })} 
                  />
                )}
              </motion.div>
            )}
            {activeView === "vault" && (
              <motion.div key="vault" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
                <PrivateSafe session={session} onClose={() => setActiveView("dashboard")} />
              </motion.div>
            )}
            {activeView === "calls" && (
              <motion.div key="calls" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="h-full p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {profiles.map(p => (
                    <div key={p.id} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl flex flex-col items-center gap-4">
                      <AvatarDisplay profile={p} className="h-16 w-16" />
                      <p className="font-black text-lg uppercase font-accent">{p.username}</p>
                      <div className="flex gap-2 w-full">
                        <Button onClick={() => setActiveCall({ contact: p, mode: "voice", isInitiator: true })} className="flex-1 bg-emerald-600 font-accent uppercase text-[10px]">Voice</Button>
                        <Button onClick={() => setActiveCall({ contact: p, mode: "video", isInitiator: true })} className="flex-1 bg-indigo-600 font-accent uppercase text-[10px]">Video</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            {activeView === "settings" && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full p-8">
                <ProfileSettings profile={myProfile} onUpdate={fetchProfile} onClose={() => setActiveView("dashboard")} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {activeCall && (
            <motion.div key="active-call-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <VideoCall userId={session.user.id} contact={activeCall.contact} callType={activeCall.mode} isInitiator={activeCall.isInitiator} incomingSignal={activeCall.incomingSignal} onClose={() => setActiveCall(null)} />
            </motion.div>
          )}
          {incomingCall && !activeCall && (
            <motion.div key="incoming-call-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
              <div className="bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-10 max-w-sm w-full text-center space-y-8">
                <AvatarDisplay profile={incomingCall.caller} className="h-32 w-32 mx-auto" />
                <h3 className="text-4xl font-black italic uppercase font-accent">{incomingCall.caller.username}</h3>
                <div className="flex gap-4">
                  <Button onClick={() => setIncomingCall(null)} className="flex-1 bg-red-600">Decline</Button>
                  <Button onClick={() => { setActiveCall({ contact: incomingCall.caller, mode: incomingCall.call_mode, isInitiator: false, incomingSignal: JSON.parse(incomingCall.signal_data) }); setIncomingCall(null); }} className="flex-1 bg-emerald-600">Accept</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <nav className={`lg:hidden fixed bottom-0 left-0 right-0 border-t border-white/5 bg-[#050505]/95 backdrop-blur-3xl px-4 py-4 flex justify-around items-center z-50 rounded-t-[2.5rem] pb-safe transition-all ${ (activeView === 'chat' && selectedContact) ? 'translate-y-full' : ''}`}>
          {navItems.map(item => {
            const isActive = activeView === item.id;
            return (
              <button 
                key={item.id} 
                onClick={() => handleNavClick(item.id as ActiveView)} 
                className={`flex flex-col items-center gap-1.5 px-3 py-2 relative transition-all group ${isActive ? 'text-white' : 'text-white/30'}`}
              >
                <item.icon className={`w-5 h-5 transition-all duration-300 ${isActive ? 'text-indigo-400 scale-110 drop-shadow-[0_0_12px_rgba(99,102,241,0.6)]' : 'group-hover:text-white/50'}`} />
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] font-accent leading-none transition-all ${isActive ? 'text-white' : 'text-white/40'}`}>{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="bottomIndicator" 
                    className="absolute left-1/2 -translate-x-1/2 h-[3px] bg-indigo-500 rounded-full" 
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: '16px', opacity: 1 }}
                    style={{ 
                      boxShadow: '0 0 15px rgba(99, 102, 241, 1), 0 0 5px rgba(99, 102, 241, 0.5)',
                      bottom: '2px'
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
