"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Auth } from "@/components/Auth";
import { UserDashboardView } from "@/components/UserDashboardView";
import { OTPVerification } from "@/components/OTPVerification";
import { Lock, Shield, Zap, Globe, MessageSquare, Phone, MapPin, Video as VideoIcon, Terminal, Cpu, Radio, Activity, Sparkles, Fingerprint } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey } from "@/lib/crypto";
import { toast } from "sonner";

import { PasswordGate } from "@/components/PasswordGate";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);

  useEffect(() => {
    if (!session?.user) return;

    const channel = supabase.channel("online-users");
    
    const trackPresence = async () => {
      await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: session.user.id,
            online_at: new Date().toISOString(),
          });
          // Update profile heartbeat
          await supabase.from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", session.user.id);
        }
      });
    };

    trackPresence();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        channel.track({
          user_id: session.user.id,
          online_at: new Date().toISOString(),
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      channel.unsubscribe();
    };
  }, [session]);

  useEffect(() => {
    // Check if already unlocked in this session
    const unlocked = sessionStorage.getItem("app_unlocked") === "true";
    setIsAppUnlocked(unlocked);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkApprovalAndOTP(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkApprovalAndOTP(session.user.id);
      } else {
        setIsApproved(null);
        setOtpRequired(false);
        setOtpVerified(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkApprovalAndOTP(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_approved, otp_enabled")
      .eq("id", userId)
      .single();
    
    if (data) {
      setIsApproved(data.is_approved === null ? false : data.is_approved);
      if (data.otp_enabled && data.is_approved !== false) {
        setOtpRequired(true);
        const sessionOtpVerified = sessionStorage.getItem(`otp_verified_${userId}`);
        if (sessionOtpVerified === 'true') {
          setOtpVerified(true);
        }
      }
    } else {
      setIsApproved(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (session?.user && isApproved && (!otpRequired || otpVerified)) {
      handleKeySetup();
    }
  }, [session, isApproved, otpRequired, otpVerified]);

  const [keyError, setKeyError] = useState(false);

  async function handleKeySetup() {
    try {
      const storedPrivKey = localStorage.getItem(`priv_key_${session.user.id}`);
      if (storedPrivKey && storedPrivKey !== "undefined" && storedPrivKey !== "null") {
        try {
          const key = await importPrivateKey(storedPrivKey);
          setPrivateKey(key);
          setKeyError(false);
        } catch (e) {
          console.error("Failed to import stored key, generating new one", e);
          await generateAndStoreNewKey();
        }
      } else {
        await generateAndStoreNewKey();
      }
    } catch (error) {
      console.error("Key setup failed:", error);
      setKeyError(true);
      toast.error("Encryption key not found. Please refresh or regenerate.");
    }
  }

  async function generateAndStoreNewKey() {
    const keyPair = await generateKeyPair();
    const pubKeyBase64 = await exportPublicKey(keyPair.publicKey);
    const privKeyBase64 = await exportPrivateKey(keyPair.privateKey);
    
    localStorage.setItem(`priv_key_${session.user.id}`, privKeyBase64);
    setPrivateKey(keyPair.privateKey);

    await supabase.from("profiles").upsert({
      id: session.user.id,
      public_key: pubKeyBase64,
      username: session.user.email?.split("@")[0],
      updated_at: new Date().toISOString(),
    });
  }

  function handleOtpVerified() {
    sessionStorage.setItem(`otp_verified_${session.user.id}`, 'true');
    setOtpVerified(true);
  }

  function handleOtpSkip() {
    sessionStorage.setItem(`otp_verified_${session.user.id}`, 'true');
    setOtpVerified(true);
  }

  const handleAppUnlock = () => {
    sessionStorage.setItem("app_unlocked", "true");
    setIsAppUnlocked(true);
  };

  if (!isAppUnlocked) {
    return (
      <PasswordGate 
        correctPassword="162008" 
        onUnlock={handleAppUnlock}
        title="Chatify Core"
        subtitle="System Lock"
        description="Authorization required to initialize kernel sequence."
      />
    );
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#010101] overflow-hidden">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500/30 blur-[120px] animate-pulse rounded-full" />
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-32 h-32 border-t-2 border-r-2 border-indigo-500 rounded-full relative z-10"
        />
        <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="w-10 h-10 text-indigo-500 animate-pulse" />
        </div>
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-48 text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.5em] text-indigo-500/50">Booting Chatify Core</p>
        </div>
      </div>
    </div>
  );

  if (session && isApproved === false) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#010101] p-8 text-center relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-red-900/10 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] brightness-150 contrast-200 pointer-events-none" />

        <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="z-10 space-y-12 max-w-lg"
          >
          <div className="flex justify-center">
            <div className="p-10 bg-white/[0.02] border border-white/10 rounded-[3rem] backdrop-blur-3xl shadow-2xl relative group">
              <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <Lock className="w-16 h-16 text-red-500 relative" />
            </div>
          </div>
          
          <div className="space-y-6">
            <h2 className="text-5xl font-black italic tracking-tighter text-white uppercase">Access <span className="text-red-500">Denied</span></h2>
            <p className="text-zinc-500 font-medium leading-relaxed tracking-widest text-xs uppercase">
              System protocols require administrative clearance. Your identity is currently under manual verification.
            </p>
          </div>

          <div className="pt-8">
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-12 py-4 rounded-2xl bg-white/[0.02] border border-white/10 text-zinc-400 font-semibold text-[10px] uppercase tracking-[0.4em] hover:text-white hover:bg-white/[0.05] hover:border-white/20 transition-all active:scale-95"
            >
              Terminate Uplink
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (session && otpRequired && !otpVerified) {
    return (
      <OTPVerification
        userId={session.user.id}
        userEmail={session.user.email || ""}
        onVerified={handleOtpVerified}
        onSkip={handleOtpSkip}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#010101] text-foreground overflow-hidden relative selection:bg-indigo-500/30">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[1000px] h-[1000px] bg-indigo-600/10 blur-[250px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[1000px] h-[1000px] bg-purple-600/5 blur-[250px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.03)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] contrast-150 brightness-125" />
      </div>

      <AnimatePresence mode="wait">
        {!session ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -40 }}
            className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4 md:p-8"
          >
            <div className="max-w-[1100px] w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
              <motion.div 
                initial={{ opacity: 0, x: -80 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-10"
              >
                <div className="flex items-center gap-3">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-600 blur-xl opacity-40 group-hover:opacity-100 transition-opacity" />
                    <div className="p-2.5 bg-indigo-600 rounded-2xl relative z-10 border border-indigo-400/50 shadow-2xl">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <h1 className="text-xl font-black italic tracking-tighter uppercase text-white leading-none">Chatify <span className="text-indigo-400">v2</span></h1>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        <span className="text-[8px] font-medium uppercase tracking-[0.4em] text-white/40">Secure Node</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl lg:text-5xl font-black italic tracking-tighter uppercase text-white leading-[0.9] filter drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
                  >
                    NEXUS <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-600">PROTOCOL</span>
                  </motion.h2>
                  <p className="text-xs text-zinc-400 font-medium max-w-sm leading-relaxed tracking-wide border-l border-indigo-600 pl-3">
                    distributed neural communications. <br />
                    quantum-safe encryption matrix.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                    {[
                      { icon: MessageSquare, label: "Signals", desc: "E2EE", color: "text-indigo-400" },
                      { icon: VideoIcon, label: "Uplink", desc: "Neural", color: "text-purple-400" },
                      { icon: Fingerprint, label: "Vault", desc: "Vault", color: "text-orange-400" }
                    ].map((feature, i) => (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="flex items-start gap-2 group cursor-default"
                    >
                      <div className="p-1.5 bg-white/[0.02] border border-white/5 rounded-lg group-hover:bg-indigo-600/10 group-hover:border-indigo-500/30 transition-all duration-500 shadow-xl">
                        <feature.icon className={`w-3 h-3 ${feature.color}`} />
                      </div>
                      <div>
                        <span className="block text-[8px] font-semibold uppercase tracking-[0.2em] text-white group-hover:text-indigo-400 transition-colors">{feature.label}</span>
                        <span className="block text-[6px] font-medium uppercase tracking-widest text-white/20 group-hover:text-white/40 transition-colors">{feature.desc}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9, rotateY: 20 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ duration: 1.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="relative perspective-1000"
              >
                <div className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full animate-pulse" />
                <div className="bg-white/[0.01] border border-white/[0.08] p-6 md:p-8 rounded-[3rem] backdrop-blur-3xl shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-purple-500/[0.05] pointer-events-none" />
                  
                  <div className="mb-6 flex justify-center">
                    <div className="p-2 bg-indigo-600/10 rounded-xl border border-indigo-500/20">
                        <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />
                    </div>
                  </div>

                  <Auth />
                  
                  <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-4">
                    <div className="flex -space-x-1.5">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="w-5 h-5 rounded-full border border-[#010101] bg-zinc-800 flex items-center justify-center overflow-hidden">
                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="User avatar" className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                    <p className="text-[7px] font-medium uppercase tracking-[0.2em] text-white/30">12k+ nodes synced</p>
                  </div>
                </div>
                
                <motion.div 
                    animate={{ y: [0, -15, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-8 -right-8 p-6 bg-indigo-600 rounded-[2.5rem] shadow-2xl border border-indigo-400/30 z-20 hidden xl:block"
                >
                    <Zap className="w-8 h-8 text-white" />
                </motion.div>
                
                <motion.div 
                    animate={{ y: [0, 15, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute -bottom-8 -left-8 p-6 bg-purple-600 rounded-[2.5rem] shadow-2xl border border-purple-400/30 z-20 hidden xl:block"
                >
                    <Globe className="w-8 h-8 text-white" />
                </motion.div>
              </motion.div>
            </div>

            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-12 opacity-30 hover:opacity-100 transition-all duration-1000">
               <div className="flex items-center gap-4 group">
                 <Globe className="w-5 h-5 text-indigo-400 group-hover:rotate-180 transition-transform duration-1000" />
                 <p className="text-[9px] font-medium uppercase tracking-[0.6em]">GLOBAL MATRIX ACTIVE</p>
               </div>
               <div className="w-px h-8 bg-white/10" />
               <div className="flex items-center gap-4 group">
                 <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                 <p className="text-[9px] font-medium uppercase tracking-[0.6em]">UPLINK STABLE 100%</p>
               </div>
               <div className="w-px h-8 bg-white/10" />
               <div className="flex items-center gap-4 group">
                 <Cpu className="w-5 h-5 text-orange-400" />
                 <p className="text-[9px] font-medium uppercase tracking-[0.6em]">CORE ENCRYPTED</p>
               </div>
            </div>
          </motion.div>
        ) : (
          privateKey && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1 }}
                className="h-full"
              >
                <UserDashboardView session={session} privateKey={privateKey} />
              </motion.div>
            )
        )}
      </AnimatePresence>
    </main>
  );
}
