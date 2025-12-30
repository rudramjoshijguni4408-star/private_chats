"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { confirmUserEmail } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Lock, Fingerprint, ChevronRight, User, Phone, CheckCircle, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [systemConfig, setSystemConfig] = useState<any>({});
  const [showPendingMessage, setShowPendingMessage] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    symbol: false
  });

  useEffect(() => {
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const hasLength = password.length >= 8;

    setPasswordValidation({
      length: hasLength,
      upper: hasUpper,
      lower: hasLower,
      number: hasNumber,
      symbol: hasSymbol
    });
  }, [password]);

  useEffect(() => {
    fetchSystemConfig();
  }, []);

  async function fetchSystemConfig() {
    const { data } = await supabase.from("system_config").select("*");
    if (data) {
      const config = data.reduce((acc: any, item: any) => {
        acc[item.key] = item.value === 'true' || item.value === true;
        return acc;
      }, {});
      setSystemConfig(config);
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (systemConfig.firewall_status) {
      toast.error("Global Firewall Active: Security Lockdown in progress.");
      return;
    }
    if (systemConfig.maintenance_mode) {
      toast.error("System is under maintenance. Access restricted.");
      return;
    }
    if (isSignUp && !systemConfig.registration_open) {
      toast.error("Registration is currently closed by administration.");
      return;
    }
    setLoading(true);
    
    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          toast.error("Please enter your full name");
          setLoading(false);
          return;
        }
        
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        if (data.user) {
          const { error: profileError } = await supabase.from("profiles").upsert({
            id: data.user.id,
            username: `${email.split("@")[0]}_${Math.floor(Math.random() * 1000)}`,
            full_name: fullName.trim(),
            phone: phoneNumber.trim() || null,
            is_approved: true,
            updated_at: new Date().toISOString(),
          });

          if (profileError) {
            console.error("Profile creation error:", profileError);
            toast.error("Account created but profile synchronization failed. Please contact admin.");
            throw profileError;
          }

          await confirmUserEmail(data.user.id);
          toast.success("Identity established. Intelligence node active.");
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (showPendingMessage) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 bg-[#030303] relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] brightness-100 contrast-150 pointer-events-none" />
        
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[440px] z-10 text-center">
          <div className="mb-10">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }} className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] bg-amber-500/10 border border-amber-500/20 mb-8">
              <CheckCircle className="w-10 h-10 text-amber-400" />
            </motion.div>
            <h1 className="text-4xl font-semibold tracking-tight text-white mb-4">Account Created!</h1>
            <p className="text-zinc-400 font-medium leading-relaxed mb-2">Your registration request has been submitted successfully.</p>
            <p className="text-zinc-500 text-sm">An administrator will review and approve your account. You'll be able to sign in once approved.</p>
          </div>
          <Card className="bg-white/[0.02] border-white/10 backdrop-blur-2xl shadow-2xl rounded-[2rem] overflow-hidden">
            <CardContent className="p-8">
              <div className="space-y-4 text-left">
                <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm text-amber-200 font-medium">Pending Admin Approval</span>
                </div>
                <p className="text-xs text-zinc-500 px-1">This process ensures only authorized users can access the platform.</p>
              </div>
            </CardContent>
          </Card>
          <button onClick={() => { setShowPendingMessage(false); setIsSignUp(false); }} className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Sign In
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6 bg-[#030303] relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] brightness-100 contrast-150 pointer-events-none" />
      
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-[320px] z-10">
        <div className="text-center mb-6">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 mb-4 backdrop-blur-sm">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
          </motion.div>
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">{isSignUp ? "Create Account" : "Secure Gateway"}</h1>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">{isSignUp ? "Request access to node" : "Establish secure uplink"}</p>
        </div>

        <Card className="bg-white/[0.02] border-white/10 backdrop-blur-2xl shadow-2xl rounded-[2.5rem] overflow-hidden border-t-white/20">
          <form onSubmit={handleAuth}>
            <CardContent className="p-6 md:p-8 space-y-5">
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {isSignUp && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="fullName" className="text-[10px] font-semibold text-zinc-400 ml-1 uppercase tracking-widest">Full Name *</Label>
                        <div className="relative group">
                          <Input id="fullName" type="text" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required={isSignUp} className="bg-white/[0.03] border-white/10 h-11 rounded-xl px-4 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all text-white placeholder:text-zinc-600 text-xs" />
                          <User className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-[10px] font-semibold text-zinc-400 ml-1 uppercase tracking-widest">Phone (Optional)</Label>
                        <div className="relative group">
                          <Input id="phone" type="tel" placeholder="+91..." value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="bg-white/[0.03] border-white/10 h-11 rounded-xl px-4 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all text-white placeholder:text-zinc-600 text-xs" />
                          <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[10px] font-semibold text-zinc-400 ml-1 uppercase tracking-widest">Email Address *</Label>
                  <div className="relative group">
                    <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-white/[0.03] border-white/10 h-11 rounded-xl px-4 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all text-white placeholder:text-zinc-600 text-xs" />
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-400 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[10px] font-semibold text-zinc-400 ml-1 uppercase tracking-widest">Password *</Label>
                  <div className="relative group">
                    <Input id="password" type="password" value={password} placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} required className="bg-white/[0.03] border-white/10 h-11 rounded-xl px-4 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all text-white placeholder:text-zinc-600 text-xs" />
                    <Fingerprint className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-400 transition-colors" />
                  </div>
                  {isSignUp && (
                    <div className="grid grid-cols-2 gap-2 mt-3 px-1">
                      {[{ key: 'length', label: '8+ Chars' }, { key: 'upper', label: 'Upper' }, { key: 'lower', label: 'Lower' }, { key: 'number', label: 'Num' }, { key: 'symbol', label: 'Sym' }].map((rule) => (
                        <div key={rule.key} className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${(passwordValidation as any)[rule.key] ? 'bg-emerald-500' : 'bg-white/10'}`} />
                          <span className={`text-[9px] font-bold tracking-widest transition-colors ${(passwordValidation as any)[rule.key] ? 'text-emerald-500' : 'text-zinc-600'}`}>{rule.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isSignUp && (
                  <div className="flex items-start gap-3 px-1 pt-2">
                    <button type="button" onClick={() => setAcceptedTerms(!acceptedTerms)} className={`mt-0.5 w-4 h-4 rounded border transition-all flex items-center justify-center ${acceptedTerms ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10'}`}>
                      {acceptedTerms && <ShieldCheck className="w-2.5 h-2.5 text-white" />}
                    </button>
                    <p className="text-[9px] text-zinc-500 font-medium leading-tight uppercase tracking-widest">I agree to <span className="text-indigo-400">Protocols</span> & <span className="text-indigo-400">Terms</span>.</p>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-[0_0_25px_rgba(79,70,229,0.3)] disabled:opacity-30 disabled:grayscale text-xs uppercase tracking-[0.2em]" disabled={loading || (isSignUp && (!acceptedTerms || !Object.values(passwordValidation).every(Boolean)))}>
                  {loading ? (
                    <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /><span>{isSignUp ? "Creating..." : "Auth..."}</span></div>
                  ) : (
                    <div className="flex items-center justify-center gap-2"><span>{isSignUp ? "Register" : "Sign In"}</span><ChevronRight className="w-4 h-4" /></div>
                  )}
                </Button>
              </div>
            </CardContent>
            <CardFooter className="px-6 md:px-8 pb-6 flex justify-center border-t border-white/5 bg-white/[0.01]">
              <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-[10px] font-medium text-zinc-500 hover:text-white transition-colors flex items-center gap-2 uppercase tracking-widest">{isSignUp ? "Have access? Sign In" : "New account? Register"}</button>
            </CardFooter>
          </form>
        </Card>
        <div className="mt-6 text-center"><p className="text-[8px] font-medium text-zinc-600 tracking-[0.4em] flex items-center justify-center gap-4 uppercase"><span className="w-8 h-[1px] bg-zinc-800" />E2EE Secured<span className="w-8 h-[1px] bg-zinc-800" /></p></div>
      </motion.div>
    </div>
  );
}
