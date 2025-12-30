"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { 
  Video as VideoIcon, Phone, Maximize2, Minimize2, MicOff, Mic, PhoneOff, CameraOff, AlertTriangle, Shield, Globe, Zap, Camera, ShieldCheck, Volume2, VolumeX
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoCallProps {
  contact: any;
  onClose: () => void;
  userId: string;
  callType: "video" | "voice";
  isInitiator?: boolean;
  incomingSignal?: any;
}

export function VideoCall({ 
  contact, 
  onClose, 
  userId, 
  callType: initialCallType,
  isInitiator = true,
  incomingSignal
}: VideoCallProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(initialCallType === "voice");
  const [isBlurred, setIsBlurred] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("Initializing...");
  const [callDuration, setCallDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const hasAnswered = useRef(false);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSet = useRef(false);

  // Sync streams with video/audio elements
  useEffect(() => {
    if (stream && myVideo.current) {
      myVideo.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (remoteStream && userVideo.current) {
      userVideo.current.srcObject = remoteStream;
    }
  }, [remoteStream, isVideoOff, isMinimized]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isConnecting) {
        setCallDuration((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isConnecting]);

  const processQueuedCandidates = async (pc: RTCPeerConnection) => {
    while (iceCandidateQueue.current.length > 0) {
      const candidate = iceCandidateQueue.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Failed to add queued ICE candidate:", err);
        }
      }
    }
  };

  const createPeerConnection = useCallback((localStream: MediaStream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      ]
    });

    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      const [remoteStreamFromEvent] = event.streams;
      setRemoteStream(remoteStreamFromEvent);
      setIsConnecting(false);
      setConnectionStatus("Connected");
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await supabase.from("calls").insert({
            caller_id: userId,
            receiver_id: contact.id,
            signal_data: JSON.stringify({ candidate: event.candidate.toJSON() }),
            type: "candidate",
            call_mode: initialCallType
          });
        } catch (err) {
          console.error("ICE candidate send failed:", err);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setIsConnecting(false);
        setConnectionStatus("Connected");
      } else if (state === 'checking') {
        setConnectionStatus("Connecting...");
      } else if (state === 'failed') {
        setConnectionStatus("Connection Failed");
        toast.error("Connection failed. Please try again.");
      } else if (state === 'disconnected') {
        setConnectionStatus("Reconnecting...");
      } else if (state === 'closed') {
        setConnectionStatus("Call Ended");
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsConnecting(false);
        setConnectionStatus("Connected");
      }
    };

    return pc;
  }, [userId, contact.id, initialCallType]);

  useEffect(() => {
    let isMounted = true;

    const startCall = async () => {
      try {
        setConnectionStatus("Requesting media access...");
        
        const constraints = {
          video: initialCallType === "video" ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: "user",
            frameRate: { ideal: 30 }
          } : false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        };

        const localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!isMounted) {
          localStream.getTracks().forEach(track => track.stop());
          return;
        }

        setStream(localStream);
        if (myVideo.current) {
          myVideo.current.srcObject = localStream;
        }

        setConnectionStatus("Setting up connection...");
        const pc = createPeerConnection(localStream);
        peerConnection.current = pc;

        if (isInitiator) {
          setConnectionStatus("Creating offer...");
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: initialCallType === "video"
          });
          await pc.setLocalDescription(offer);

          await supabase.from("calls").insert({
            caller_id: userId,
            receiver_id: contact.id,
            signal_data: JSON.stringify({ sdp: pc.localDescription }),
            type: "offer",
            call_mode: initialCallType
          });

          setConnectionStatus("Waiting for answer...");
        } else if (incomingSignal?.sdp) {
          setConnectionStatus("Processing incoming call...");
          await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal.sdp));
          remoteDescriptionSet.current = true;
          await processQueuedCandidates(pc);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await supabase.from("calls").insert({
            caller_id: userId,
            receiver_id: contact.id,
            signal_data: JSON.stringify({ sdp: pc.localDescription }),
            type: "answer",
            call_mode: initialCallType
          });

          setConnectionStatus("Connecting...");
        }

        const channelId = [userId, contact.id].sort().join('-');
        const channel = supabase
          .channel(`call-${channelId}`)
          .on("postgres_changes", { 
            event: "INSERT", 
            schema: "public", 
            table: "calls", 
            filter: `receiver_id=eq.${userId}` 
          }, async (payload) => {
            const data = payload.new;
            
            if (!peerConnection.current) return;

            try {
              const signalData = JSON.parse(data.signal_data);

              if (data.type === "answer" && isInitiator && signalData.sdp && !hasAnswered.current) {
                hasAnswered.current = true;
                setConnectionStatus("Received answer, connecting...");
                await peerConnection.current.setRemoteDescription(
                  new RTCSessionDescription(signalData.sdp)
                );
                remoteDescriptionSet.current = true;
                await processQueuedCandidates(peerConnection.current);
              } else if (data.type === "candidate" && signalData.candidate) {
                if (remoteDescriptionSet.current && peerConnection.current.remoteDescription) {
                  try {
                    await peerConnection.current.addIceCandidate(
                      new RTCIceCandidate(signalData.candidate)
                    );
                  } catch (err) {
                    console.error("Failed to add ICE candidate:", err);
                  }
                } else {
                  iceCandidateQueue.current.push(signalData.candidate);
                }
              } else if (data.type === "end") {
                toast.info("Call ended by remote user");
                endCall();
              }
            } catch (err) {
              console.error("Signal processing error:", err);
            }
          })
          .subscribe();

        channelRef.current = channel;

      } catch (err: any) {
        console.error("Call setup error:", err);
        if (err.name === "NotAllowedError") {
          toast.error("Camera/microphone access denied. Please allow access and try again.");
        } else if (err.name === "NotFoundError") {
          toast.error("No camera/microphone found. Please connect a device and try again.");
        } else {
          toast.error(err.message || "Failed to start call");
        }
        onClose();
      }
    };

    startCall();

    return () => {
      isMounted = false;
      stream?.getTracks().forEach(track => track.stop());
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const endCall = async () => {
    try {
      await supabase.from("calls").insert({
        caller_id: userId,
        receiver_id: contact.id,
        type: "end",
        signal_data: "{}"
      });
    } catch (err) {}
    
    stream?.getTracks().forEach(track => track.stop());
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    onClose();
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        toast.info(videoTrack.enabled ? "Camera on" : "Camera off");
      }
    }
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        toast.info(audioTrack.enabled ? "Unmuted" : "Muted");
      }
    }
  };

  const toggleSpeaker = () => {
    if (userVideo.current) {
      userVideo.current.muted = !userVideo.current.muted;
      setIsSpeakerOn(!userVideo.current.muted);
      toast.info(userVideo.current.muted ? "Speaker off" : "Speaker on");
    }
  };

  if (isMinimized) {
    return (
      <motion.div 
        layoutId="call-window"
        className="fixed bottom-24 right-4 sm:right-8 w-72 sm:w-80 h-44 sm:h-48 bg-[#0a0a0a]/95 backdrop-blur-3xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 shadow-2xl z-[200] overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/5" />
        {initialCallType === "voice" && remoteStream && (
          <audio ref={userVideo as any} autoPlay playsInline className="hidden" />
        )}
        <div className="p-4 sm:p-6 h-full flex flex-col justify-between relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="h-10 w-10 ring-2 ring-indigo-500/30">
                  <AvatarImage src={contact.avatar_url} />
                  <AvatarFallback className="bg-zinc-900 text-xs font-black">
                    {contact.username?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0a0a0a] animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-black uppercase italic tracking-tighter text-white">{contact.username}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[8px] text-indigo-400 font-black uppercase tracking-[0.2em]">{formatDuration(callDuration)}</p>
                  <span className="text-[6px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold uppercase">
                    {initialCallType}
                  </span>
                </div>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setIsMinimized(false)} className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex justify-center gap-3">
            <Button onClick={toggleMute} variant="ghost" className={`h-11 w-11 rounded-xl ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-white/40'}`}>
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            {initialCallType === "voice" && (
              <Button onClick={toggleSpeaker} variant="ghost" className={`h-11 w-11 rounded-xl ${!isSpeakerOn ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-white/40'}`}>
                {isSpeakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </Button>
            )}
            <Button onClick={endCall} variant="destructive" className="h-11 w-11 rounded-xl bg-red-600 shadow-lg shadow-red-600/20">
              <PhoneOff className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center p-4 sm:p-8 md:p-12 overflow-hidden"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 blur-[180px] rounded-full animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-blue-500/5 blur-[180px] rounded-full animate-pulse delay-1000" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150" />
      </div>

      {initialCallType === "voice" && remoteStream && (
        <audio ref={userVideo as any} autoPlay playsInline />
      )}

      <motion.div 
        layoutId="call-window"
        className="w-full max-w-6xl aspect-video md:aspect-video bg-[#0a0a0a] rounded-[2rem] sm:rounded-[4rem] border border-white/[0.08] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] relative group"
      >
        <div className={`absolute inset-0 transition-all duration-1000 ${isBlurred ? "blur-3xl grayscale scale-110" : "blur-0 scale-100"}`}>
          {initialCallType === "voice" || !remoteStream || (initialCallType === "video" && isVideoOff) ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950 backdrop-blur-3xl p-6">
              <div className="relative">
                <div className={`absolute inset-0 ${initialCallType === "voice" ? 'bg-emerald-500/20' : 'bg-indigo-500/20'} blur-[60px] sm:blur-[100px] rounded-full animate-pulse`} />
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="relative z-10"
                >
                  <Avatar className="h-32 w-32 sm:h-48 sm:w-48 md:h-64 md:w-64 border-4 sm:border-8 border-white/[0.03] shadow-[0_0_80px_rgba(0,0,0,0.5)]">
                    <AvatarImage src={contact.avatar_url} />
                    <AvatarFallback className="bg-zinc-900 text-3xl sm:text-6xl font-black italic text-zinc-700">
                      {contact.username?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                <div className={`absolute -bottom-2 -right-2 sm:-bottom-4 sm:-right-4 ${initialCallType === "voice" ? 'bg-emerald-600' : 'bg-indigo-600'} p-3 sm:p-6 rounded-full border-[4px] sm:border-[8px] border-[#0a0a0a] shadow-2xl`}>
                  {initialCallType === "video" ? <VideoIcon className="w-5 h-5 sm:w-10 sm:h-10 text-white" /> : <Phone className="w-5 h-5 sm:w-10 sm:h-10 text-white" />}
                </div>
              </div>
              <div className="mt-8 sm:mt-16 text-center space-y-2 sm:space-y-4">
                <h2 className="text-2xl sm:text-5xl font-semibold tracking-tight text-white">{contact.username}</h2>
                <div className="flex items-center gap-3 sm:gap-4 justify-center">
                   {isConnecting ? (
                     <div className="flex gap-1 items-center h-3 sm:h-4">
                        {[1,2,3,4,5].map(i => (
                          <motion.div 
                            key={i}
                            animate={{ height: [3, 12, 3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                            className={`w-0.5 sm:w-1 ${initialCallType === "voice" ? 'bg-emerald-500' : 'bg-indigo-500'} rounded-full`}
                          />
                        ))}
                     </div>
                   ) : (
                     <div className="flex gap-1 items-end h-6 sm:h-8">
                        {[1,2,3,4,5,6,7].map(i => (
                          <motion.div 
                            key={i}
                            animate={{ height: [4, Math.random() * 20 + 8, 4] }}
                            transition={{ duration: 0.5 + Math.random() * 0.3, repeat: Infinity, delay: i * 0.05 }}
                            className={`w-1 sm:w-1.5 ${initialCallType === "voice" ? 'bg-emerald-500' : 'bg-indigo-500'} rounded-full`}
                          />
                        ))}
                     </div>
                   )}
                   <p className={`text-[8px] sm:text-[10px] font-medium uppercase tracking-wider ${initialCallType === "voice" ? 'text-emerald-400' : 'text-indigo-400'}`}>{connectionStatus}</p>
                </div>
                {!isConnecting && initialCallType === "voice" && (
                  <p className="text-xl sm:text-3xl font-black italic text-white/80 font-mono">{formatDuration(callDuration)}</p>
                )}
              </div>
            </div>
          ) : (
            <video playsInline ref={userVideo} autoPlay className="w-full h-full object-cover" />
          )}
        </div>

        <AnimatePresence>
          {initialCallType === "video" && !isVideoOff && stream && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute bottom-6 right-6 sm:bottom-10 sm:right-10 w-32 sm:w-48 md:w-64 aspect-video bg-zinc-950 rounded-xl sm:rounded-[2.5rem] overflow-hidden border-2 sm:border-4 border-[#0a0a0a] shadow-2xl z-30 ring-1 ring-white/10"
            >
              <video playsInline muted ref={myVideo} autoPlay className="w-full h-full object-cover" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute top-6 left-6 right-6 sm:top-10 sm:left-10 sm:right-10 flex items-center justify-between z-40">
           <div className={`flex items-center gap-3 sm:gap-6 bg-black/60 backdrop-blur-3xl border ${initialCallType === "voice" ? 'border-emerald-500/20' : 'border-white/10'} px-4 sm:px-8 py-2 sm:py-4 rounded-xl sm:rounded-[2rem] shadow-2xl`}>
              <div className="flex items-center gap-2 sm:gap-4 border-r border-white/10 pr-4 sm:pr-6">
                <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)] ${isConnecting ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                <span className="text-[7px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-white">{isConnecting ? 'Sync' : 'Live'}</span>
              </div>
              <div className="flex flex-col">
                <p className="text-[7px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-white/40">Duration</p>
                <p className="text-xs sm:text-xl font-black italic tracking-tighter text-white font-mono">{formatDuration(callDuration)}</p>
              </div>
           </div>

           <div className="flex gap-2 sm:gap-4">
              <Button onClick={() => setIsMinimized(true)} size="icon" variant="ghost" className="h-10 w-10 sm:h-16 sm:w-16 rounded-xl sm:rounded-[2rem] bg-black/60 backdrop-blur-3xl border border-white/10 text-white/40 hover:text-white">
                <Minimize2 className="w-4 h-4 sm:w-6 sm:h-6" />
              </Button>
              <div className={`hidden sm:flex items-center gap-4 ${initialCallType === "voice" ? 'bg-emerald-600/90 border-emerald-500/50 shadow-emerald-600/20' : 'bg-indigo-600/90 border-indigo-500/50 shadow-indigo-600/20'} backdrop-blur-3xl border px-8 py-4 rounded-[2rem] shadow-2xl`}>
                <ShieldCheck className="w-5 h-5 text-white" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Secure P2P</span>
              </div>
           </div>
        </div>

        <div className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-6 bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/10 p-3 sm:p-6 rounded-2xl sm:rounded-[3rem] shadow-[0_0_80px_rgba(0,0,0,0.5)] z-40">
            <Button 
              onClick={toggleMute}
              className={`h-12 w-12 sm:h-20 sm:w-20 rounded-xl sm:rounded-[2rem] transition-all active:scale-90 ${isMuted ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40'}`}
            >
              {isMuted ? <MicOff className="w-5 h-5 sm:w-8 sm:h-8" /> : <Mic className="w-5 h-5 sm:w-8 sm:h-8" />}
            </Button>

            {initialCallType === "voice" && (
              <Button 
                onClick={toggleSpeaker}
                className={`h-12 w-12 sm:h-20 sm:w-20 rounded-xl sm:rounded-[2rem] transition-all active:scale-90 ${!isSpeakerOn ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40'}`}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5 sm:w-8 sm:h-8" /> : <VolumeX className="w-5 h-5 sm:w-8 sm:h-8" />}
              </Button>
            )}

            {initialCallType === "video" && (
              <Button 
                onClick={toggleVideo}
                className={`h-12 w-12 sm:h-20 sm:w-20 rounded-xl sm:rounded-[2rem] transition-all active:scale-90 ${isVideoOff ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40'}`}
              >
                {isVideoOff ? <CameraOff className="w-5 h-5 sm:w-8 sm:h-8" /> : <Camera className="w-5 h-5 sm:w-8 sm:h-8" />}
              </Button>
            )}

            <Button 
              onClick={() => setIsBlurred(!isBlurred)}
              className={`h-12 w-12 sm:h-20 sm:w-20 rounded-xl sm:rounded-[2rem] transition-all active:scale-90 ${isBlurred ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/40'}`}
            >
              <AlertTriangle className="w-5 h-5 sm:w-8 sm:h-8" />
            </Button>

            <div className="w-px h-8 sm:h-12 bg-white/10 mx-1 sm:mx-2" />

            <Button 
              onClick={endCall}
              variant="destructive"
              className="h-14 w-14 sm:h-24 sm:w-24 rounded-2xl sm:rounded-[2.5rem] bg-red-600 hover:bg-red-500 shadow-xl active:scale-95 transition-all"
            >
              <PhoneOff className="w-6 h-6 sm:w-10 sm:h-10" />
            </Button>
        </div>
      </motion.div>

      <div className="mt-8 sm:mt-12 flex flex-col items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-6 sm:gap-12 bg-white/[0.03] backdrop-blur-xl border border-white/[0.05] px-6 sm:px-10 py-3 sm:py-5 rounded-2xl sm:rounded-[2.5rem]">
             <div className="flex items-center gap-2 sm:gap-4">
                <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-white/20" />
                <div className="flex flex-col">
                  <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] text-white/20">Protocol</span>
                  <span className="text-[10px] sm:text-xs font-black italic text-white/60 uppercase">WebRTC P2P</span>
                </div>
             </div>
             <div className="w-px h-6 sm:h-8 bg-white/5" />
             <div className="flex items-center gap-2 sm:gap-4">
                <Zap className={`w-4 h-4 sm:w-5 sm:h-5 ${initialCallType === "voice" ? 'text-emerald-400/40' : 'text-indigo-400/40'}`} />
                <div className="flex flex-col">
                  <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] text-white/20">Mode</span>
                  <span className={`text-[10px] sm:text-xs font-black italic uppercase ${initialCallType === "voice" ? 'text-emerald-400/60' : 'text-indigo-400/60'}`}>{initialCallType} Call</span>
                </div>
             </div>
          </div>
          <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.4em] sm:tracking-[0.8em] text-white/10">Secure peer-to-peer connection</p>
      </div>
    </motion.div>
  );
}
