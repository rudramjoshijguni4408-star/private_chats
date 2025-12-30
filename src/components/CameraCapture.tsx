"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, X, Zap, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  const startCamera = async () => {
    try {
      stopCamera();
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setIsReady(true);
    } catch (err) {
      console.error("Camera access error:", err);
      toast.error("Camera access denied. Please enable permissions.");
      onClose();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg");
      setCapturedImage(dataUrl);
    }
  };

  const handleConfirm = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
        onClose();
      }
    }, "image/jpeg", 0.8);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-4 md:p-8"
    >
      <div className="relative w-full max-w-lg aspect-[3/4] bg-zinc-900 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl">
        <AnimatePresence mode="wait">
          {!capturedImage ? (
            <motion.div 
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-full h-full"
            >
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              />
              <div className="absolute inset-0 border-[20px] border-black/20 pointer-events-none" />
              <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                <Zap className="w-3 h-3 text-yellow-500 animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white">Live Intelligence Link</span>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="captured"
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full h-full"
            >
              <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-indigo-600/10 pointer-events-none" />
            </motion.div>
          )}
        </AnimatePresence>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="mt-8 flex items-center gap-6">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="w-16 h-16 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20"
        >
          <X className="w-6 h-6" />
        </Button>

        {!capturedImage ? (
          <>
            <Button 
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full bg-white text-black hover:bg-zinc-200 transition-transform active:scale-90 shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            >
              <div className="w-16 h-16 rounded-full border-4 border-black/10" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={switchCamera}
              className="w-16 h-16 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20"
            >
              <RefreshCw className="w-6 h-6" />
            </Button>
          </>
        ) : (
          <>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setCapturedImage(null)}
              className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20"
            >
              <RefreshCw className="w-6 h-6" />
            </Button>
            <Button 
              onClick={handleConfirm}
              className="px-10 h-16 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 flex items-center gap-3 font-black uppercase tracking-widest text-xs"
            >
              <Check className="w-5 h-5" />
              Transmit
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
