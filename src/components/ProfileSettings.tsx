"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Image as ImageIcon, Shield, Moon, Sun, Monitor, Trash2, LogOut, MapPin, Clock, Plus, Ghost, Sparkles, Key, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AvatarDisplay } from "./AvatarDisplay";
import { AvatarBuilder } from "./AvatarBuilder";
import { useTheme } from "next-themes";

export function ProfileSettings({ profile, onUpdate, onClose }: { profile: any; onUpdate: () => void; onClose: () => void }) {
  const [username, setUsername] = useState(profile.username || "");
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [birthdate, setBirthdate] = useState(profile.birthdate || "");
  const [wallpaperUrl, setWallpaperUrl] = useState(profile.wallpaper_url || "");
  const { theme, setTheme } = useTheme();
  const [countdownEnd, setCountdownEnd] = useState(profile.countdown_end || "");
  const [locationEnabled, setLocationEnabled] = useState(profile.location_enabled || false);
  const [ghostMode, setGhostMode] = useState(profile.ghost_mode || false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordReason, setPasswordReason] = useState("");
  const [blockedProfiles, setBlockedProfiles] = useState<any[]>([]);
  const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordRequest, setPasswordRequest] = useState<any>(null);
  const [requestingPassword, setRequestingPassword] = useState(false);

  useEffect(() => {
    fetchBlockedProfiles();
    fetchPasswordRequest();
  }, []);

  async function fetchBlockedProfiles() {
    const { data: blockedIds } = await supabase
      .from("blocked_users")
      .select("blocked_id")
      .eq("blocker_id", profile.id);
    
    if (blockedIds && blockedIds.length > 0) {
      const ids = blockedIds.map(b => b.blocked_id);
      const { data } = await supabase.from("profiles").select("*").in("id", ids);
      setBlockedProfiles(data || []);
    }
  }

  async function unblockUser(id: string) {
    const { error } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", profile.id)
      .eq("blocked_id", id);
    if (!error) {
      toast.success("User unblocked");
      fetchBlockedProfiles();
    }
  }

  async function fetchPasswordRequest() {
    const { data } = await supabase
      .from("password_change_requests")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    if (data) setPasswordRequest(data);
  }

  async function handlePasswordChangeRequest() {
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setRequestingPassword(true);
    try {
      const { error: deleteError } = await supabase
        .from("password_change_requests")
        .delete()
        .eq("user_id", profile.id)
        .eq("status", "pending");

      const { error } = await supabase.from("password_change_requests").insert({
        user_id: profile.id,
        new_password_hash: newPassword,
        reason: passwordReason || "User requested password change",
        status: "pending"
      });

      if (error) throw error;
      
      toast.success("Password change request submitted! Waiting for admin approval.");
      setNewPassword("");
      setPasswordReason("");
      fetchPasswordRequest();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRequestingPassword(false);
    }
  }

  async function cancelPasswordRequest() {
    const { error } = await supabase
      .from("password_change_requests")
      .delete()
      .eq("id", passwordRequest.id);
    
    if (!error) {
      toast.success("Password request cancelled");
      setPasswordRequest(null);
    }
  }

  async function handleUpdate() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username,
          full_name: fullName,
          bio,
          birthdate,
          wallpaper_url: wallpaperUrl,
          theme,
          countdown_end: countdownEnd || null,
          location_enabled: locationEnabled,
          ghost_mode: ghostMode,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (error) throw error;
      toast.success("Identity updated");
      onUpdate();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteData() {
    if (!confirm("Are you sure? This cannot be undone.")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("messages").delete().eq("sender_id", profile.id);
      if (error) throw error;
      toast.success("All data purged");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteProfile() {
    if (!confirm("Permanently delete account?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", profile.id);
      if (error) throw error;
      await supabase.auth.signOut();
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border w-full max-w-lg rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] relative">
          <div className="p-8 border-b border-border flex justify-between items-center bg-card/50">
            <div>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3">
                <Shield className="w-6 h-6 text-indigo-500" />
                Identity
              </h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Persona & Safety</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
              <Plus className="w-6 h-6 rotate-45" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide">
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <AvatarDisplay profile={profile} className="h-24 w-24 border-4 border-indigo-500/50 shadow-2xl transition-transform group-hover:scale-105" />
                <button 
                  onClick={() => setShowAvatarBuilder(true)}
                  className="absolute bottom-0 right-0 bg-indigo-600 p-2 rounded-full border-4 border-background shadow-xl text-white hover:scale-110 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Custom Persona</p>
            </div>

            <div className="space-y-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Ghost className="w-3 h-3" /> Digital ID
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Display Name</Label>
                  <Input 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-secondary/30 border-border h-12 rounded-2xl focus:ring-indigo-500/30 font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Handle</Label>
                  <Input 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-secondary/30 border-border h-12 rounded-2xl focus:ring-indigo-500/30 font-bold"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Bio</Label>
                  <Input 
                    value={bio} 
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell the world..."
                    className="bg-secondary/30 border-border h-12 rounded-2xl focus:ring-indigo-500/30"
                  />
                </div>

<div className="space-y-2 md:col-span-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-2">
                      <Key className="w-3 h-3" /> Security Key Change
                    </Label>
                    
                    {passwordRequest?.status === 'pending' ? (
                      <div className="p-5 bg-orange-500/10 border border-orange-500/20 rounded-2xl space-y-3">
                        <div className="flex items-center gap-3">
                          <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                          <div>
                            <p className="text-xs font-black text-orange-400 uppercase">Request Pending</p>
                            <p className="text-[9px] text-orange-400/60 font-bold uppercase tracking-widest">Awaiting admin approval</p>
                          </div>
                        </div>
                        <Button onClick={cancelPasswordRequest} variant="ghost" className="w-full h-10 text-[9px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/10">
                          Cancel Request
                        </Button>
                      </div>
                    ) : passwordRequest?.status === 'approved' ? (
                      <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <div>
                            <p className="text-xs font-black text-emerald-400 uppercase">Password Changed</p>
                            <p className="text-[9px] text-emerald-400/60 font-bold uppercase tracking-widest">Use new password to login</p>
                          </div>
                        </div>
                      </div>
                    ) : passwordRequest?.status === 'rejected' ? (
                      <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-3">
                        <div className="flex items-center gap-3">
                          <XCircle className="w-4 h-4 text-red-400" />
                          <div>
                            <p className="text-xs font-black text-red-400 uppercase">Request Rejected</p>
                            <p className="text-[9px] text-red-400/60 font-bold uppercase tracking-widest">{passwordRequest.admin_note || "Contact admin for more info"}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Input 
                            type="password"
                            placeholder="New password"
                            value={newPassword} 
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="bg-secondary/30 border-border h-12 rounded-2xl focus:ring-indigo-500/30"
                          />
                          <Input 
                            placeholder="Reason for change (optional)"
                            value={passwordReason} 
                            onChange={(e) => setPasswordReason(e.target.value)}
                            className="bg-secondary/30 border-border h-10 rounded-xl focus:ring-indigo-500/30 text-sm"
                          />
                          <Button 
                            onClick={handlePasswordChangeRequest}
                            disabled={requestingPassword || !newPassword}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-2xl px-6 font-black uppercase text-[10px] tracking-widest"
                          >
                            {requestingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit New Request"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Input 
                          type="password"
                          placeholder="Enter new password"
                          value={newPassword} 
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="bg-secondary/30 border-border h-12 rounded-2xl focus:ring-indigo-500/30"
                        />
                        <Input 
                          placeholder="Reason for change (optional)"
                          value={passwordReason} 
                          onChange={(e) => setPasswordReason(e.target.value)}
                          className="bg-secondary/30 border-border h-10 rounded-xl focus:ring-indigo-500/30 text-sm"
                        />
                        <Button 
                          onClick={handlePasswordChangeRequest}
                          disabled={requestingPassword || !newPassword}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-2xl px-6 font-black uppercase text-[10px] tracking-widest"
                        >
                          {requestingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Request Password Change"}
                        </Button>
                        <p className="text-[8px] text-muted-foreground/60 font-bold uppercase tracking-widest text-center">
                          Requires admin approval for security
                        </p>
                      </div>
                    )}
                  </div>
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Monitor className="w-3 h-3" /> Appearance
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Mode</Label>
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger className="bg-secondary/30 border-border h-12 rounded-2xl">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground rounded-2xl">
                      <SelectItem value="light"><div className="flex items-center gap-2"><Sun className="w-4 h-4" /> Light</div></SelectItem>
                      <SelectItem value="dark"><div className="flex items-center gap-2"><Moon className="w-4 h-4" /> Dark</div></SelectItem>
                      <SelectItem value="system"><div className="flex items-center gap-2"><Monitor className="w-4 h-4" /> System</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Wallpaper</Label>
                  <Input 
                    placeholder="Image URL"
                    value={wallpaperUrl} 
                    onChange={(e) => setWallpaperUrl(e.target.value)}
                    className="bg-secondary/30 border-border h-12 rounded-2xl focus:ring-indigo-500/30"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Shield className="w-3 h-3" /> Privacy
              </p>
              <div className="space-y-4">
                <div className="p-5 bg-secondary/20 border border-border rounded-3xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                      <MapPin className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-foreground uppercase">Broadcast Location</p>
                      <p className="text-[8px] text-muted-foreground font-black uppercase tracking-widest mt-0.5">Live Presence</p>
                    </div>
                  </div>
                  <Switch 
                    checked={locationEnabled} 
                    onCheckedChange={setLocationEnabled}
                  />
                </div>

                <div className="p-5 bg-secondary/20 border border-border rounded-3xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                      <Ghost className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-foreground uppercase">Ghost Mode</p>
                      <p className="text-[8px] text-muted-foreground font-black uppercase tracking-widest mt-0.5">Stay Invisible</p>
                    </div>
                  </div>
                  <Switch 
                    checked={ghostMode} 
                    onCheckedChange={setGhostMode}
                  />
                </div>

                {blockedProfiles.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Restricted Access</p>
                    {blockedProfiles.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-secondary/20 border border-border rounded-2xl">
                        <div className="flex items-center gap-3">
                          <AvatarDisplay profile={p} className="h-8 w-8" />
                          <span className="text-[10px] font-black uppercase">{p.username}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => unblockUser(p.id)} className="text-red-400 hover:text-red-300 font-black uppercase text-[8px] tracking-widest">Unblock</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 pt-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Danger Zone</p>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  onClick={handleDeleteData}
                  className="border-red-500/20 text-red-500 hover:bg-red-500/10 h-12 rounded-2xl font-black uppercase tracking-widest text-[9px]"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Clear Data
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleDeleteProfile}
                  className="border-red-500/20 text-red-500 hover:bg-red-500/10 h-12 rounded-2xl font-black uppercase tracking-widest text-[9px]"
                >
                  <User className="w-4 h-4 mr-2" /> Delete ID
                </Button>
              </div>
            </div>
          </div>

          <div className="p-8 bg-background border-t border-border flex gap-4">
            <Button 
              variant="ghost" 
              onClick={() => { supabase.auth.signOut(); window.location.reload(); }} 
              className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-muted-foreground"
            >
              Sign Out
            </Button>
            <Button 
              onClick={handleUpdate} 
              disabled={loading} 
              className="flex-1 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-indigo-900/20"
            >
              {loading ? "Syncing..." : "Update Persona"}
            </Button>
          </div>
        </div>
        {showAvatarBuilder && (
          <AvatarBuilder 
            profile={profile} 
            onUpdate={onUpdate} 
            onClose={() => setShowAvatarBuilder(false)} 
          />
        )}
      </div>
    </>
  );
}
