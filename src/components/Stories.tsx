"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, Camera, X, ChevronLeft, ChevronRight, Eye, Clock, 
  Radio, Loader2, ImageIcon, Play, Shield, ArrowLeft, ArrowLeft as BackIcon 
} from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StoriesProps {
  userId: string;
}

export function Stories({ userId }: StoriesProps) {
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState<any>(null);
    const [activeStoryIndex, setActiveStoryIndex] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [initialShowViewers, setInitialShowViewers] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [previewFile, setPreviewFile] = useState<{file: File, url: string, type: string} | null>(null);
    const [integrityMode, setIntegrityMode] = useState("standard");
    const fileInputRef = useRef<HTMLInputElement>(null);
  
    useEffect(() => {
      fetchStories();
      fetchIntegrityMode();
      
      const interval = setInterval(fetchStories, 30000);
      
      // Auto-purge viewed stories after 3 hours
      const cleanupInterval = setInterval(async () => {
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
        
        // Find story IDs that have views older than 3 hours
        const { data: oldViews } = await supabase
          .from("story_views")
          .select("story_id")
          .lt("viewed_at", threeHoursAgo);
          
        if (oldViews && oldViews.length > 0) {
          const ids = oldViews.map(v => v.story_id);
          await supabase.from("stories").delete().in("id", ids);
          fetchStories();
        }
      }, 60000);

      return () => {
        clearInterval(interval);
        clearInterval(cleanupInterval);
      };
    }, []);

    const fetchIntegrityMode = async () => {
      const { data } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "data_integrity_mode")
        .single();
      if (data) setIntegrityMode(data.value);
    };

    const fetchStories = async () => {
      try {
        const { data, error } = await supabase
          .from("stories")
          .select("*, profiles(id, username, avatar_url)")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });
        
        if (error) {
          console.error("Supabase error fetching stories:", error);
          throw error;
        }
        
          if (data) {
            // Fetch view counts for all active stories
            const storyIds = data.map(s => s.id);
            const { data: viewData } = await supabase
              .from("story_views")
              .select("story_id")
              .in("story_id", storyIds);

            const countsMap: Record<string, number> = {};
            viewData?.forEach(v => {
              countsMap[v.story_id] = (countsMap[v.story_id] || 0) + 1;
            });

            const grouped = data.reduce((acc: any[], story: any) => {
              const profile = Array.isArray(story.profiles) ? story.profiles[0] : story.profiles;
              if (!profile) return acc;

              const viewCount = countsMap[story.id] || 0;
              const existing = acc.find(g => g.user_id === story.user_id);
              if (existing) {
                existing.stories.push(story);
                existing.totalViews += viewCount;
              } else {
                acc.push({
                  user_id: story.user_id,
                  profiles: profile,
                  stories: [story],
                  latestStory: story,
                  totalViews: viewCount
                });
              }
              return acc;
            }, []);
            setStories(grouped);
          }

      } catch (e: any) {
        console.error("Detailed error fetching stories:", e);
      } finally {
        setLoading(false);
      }
    };


    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
  
      let maxSize = 50 * 1024 * 1024;
      
      // Data Integrity Protocol
      if (integrityMode === 'strict' || integrityMode === 'quantum') {
        maxSize = 10 * 1024 * 1024; // 10MB limit for strict mode
        if (file.size > maxSize) {
          toast.error("Data Integrity Alert: Strict protocol limits files to 10MB", {
            description: "Compress your data for network optimization.",
            icon: <Shield className="w-4 h-4 text-red-500" />
          });
          return;
        }
      } else if (file.size > maxSize) {
        toast.error("File too large. Maximum size is 50MB");
        return;
      }

    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
    if (!type) {
      toast.error("Only images and videos are supported");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewFile({ file, url, type });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cancelPreview = () => {
    if (previewFile) {
      URL.revokeObjectURL(previewFile.url);
      setPreviewFile(null);
    }
  };

  const uploadStory = async () => {
    if (!previewFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const fileExt = previewFile.file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `stories/${userId}/${fileName}`;

      setUploadProgress(20);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("chat_media")
        .upload(filePath, previewFile.file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw new Error(uploadError.message || "Failed to upload file");
      }

      setUploadProgress(60);

      const { data: { publicUrl } } = supabase.storage
        .from("chat_media")
        .getPublicUrl(filePath);

      setUploadProgress(80);

      const { error: dbError, data: storyData } = await supabase
        .from("stories")
        .insert({
          user_id: userId,
          media_url: publicUrl,
          media_type: previewFile.type,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error("DB error:", dbError);
        throw new Error(dbError.message || "Failed to save story");
      }

      setUploadProgress(100);
      
      toast.success("Story uploaded successfully!", { icon: "🎉" });
      cancelPreview();
      fetchStories();
    } catch (e: any) {
      console.error("Story upload failed:", e);
      toast.error(e.message || "Story upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const markStoryAsViewed = async (storyId: string) => {
    try {
      await supabase.from("story_views").upsert({
        story_id: storyId,
        viewer_id: userId,
        viewed_at: new Date().toISOString()
      }, {
        onConflict: 'story_id,viewer_id'
      });
    } catch (e) {
      console.error("Error marking story as viewed:", e);
    }
  };

  const openStoryViewer = (storyGroup: any, index: number = 0) => {
    setActiveStory(storyGroup);
    setActiveStoryIndex(index);
    if (storyGroup.stories[index]) {
      markStoryAsViewed(storyGroup.stories[index].id);
    }
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar no-scrollbar scroll-smooth">
        <div className="flex-shrink-0">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-indigo-600 to-purple-700 flex flex-col items-center justify-center gap-1.5 relative group overflow-hidden border border-white/20 shadow-[0_10px_30px_-10px_rgba(79,70,229,0.5)] hover:scale-105 transition-all"
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-1">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
                <span className="text-[8px] font-black text-white/80">{uploadProgress}%</span>
              </div>
            ) : (
              <>
                <Plus className="w-6 h-6 text-white" />
                <span className="text-[7px] font-black uppercase tracking-widest text-white/70">Add</span>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileSelect}
              accept="image/*,video/*"
            />
          </button>
        </div>

          {loading ? (
            <div className="flex items-center justify-center w-20 h-20">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : (
            stories.map((storyGroup) => {
              const isMyStory = storyGroup.user_id === userId;
              return (
                <motion.div
                  key={storyGroup.user_id}
                  className="flex-shrink-0 flex flex-col items-center gap-2"
                >
                  <motion.div className="relative group">
                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => openStoryViewer(storyGroup)}
                      className="relative w-20 h-20"
                    >
                      <div className="absolute inset-0 rounded-[2rem] p-[3px] bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 group-hover:p-1 transition-all">
                        <div className="w-full h-full rounded-[1.85rem] bg-[#030303] overflow-hidden">
                          {storyGroup.latestStory.media_type === 'video' ? (
                            <div className="w-full h-full bg-black/40 flex items-center justify-center">
                              <Play className="w-6 h-6 text-white/60" />
                            </div>
                          ) : (
                            <img 
                              src={storyGroup.latestStory.media_url} 
                              className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all" 
                              alt=""
                            />
                          )}
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10">
                        <AvatarDisplay profile={storyGroup.profiles} className="w-8 h-8 ring-2 ring-[#030303]" />
                      </div>
                    </motion.button>
                    
                    {isMyStory && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInitialShowViewers(true);
                            openStoryViewer(storyGroup);
                          }}
                          className="absolute -top-2 -right-2 bg-indigo-600 border border-white/20 rounded-full px-2 py-1 shadow-lg flex items-center gap-1.5 z-20 hover:bg-indigo-500 transition-all hover:scale-110 active:scale-95 group"
                        >
                          <Eye className="w-3 h-3 text-white" />
                            <span className="text-[9px] font-black text-white">{storyGroup.totalViews || 0} Views</span>
                        </motion.button>
                    )}
                  </motion.div>
                  <span className="text-[9px] font-black uppercase tracking-tighter text-white/40 mt-3">
                    {isMyStory ? 'You' : storyGroup.profiles?.username}
                  </span>
                </motion.div>
              );
            })
          )}

      </div>

      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg relative">
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                <Button
                  onClick={cancelPreview}
                  variant="ghost"
                  size="icon"
                  className="bg-white/10 hover:bg-white/20 rounded-full"
                  disabled={isUploading}
                >
                  <X className="w-5 h-5 text-white" />
                </Button>
              </div>

              <div className="bg-[#111] rounded-[2rem] overflow-hidden border border-white/10">
                <div className="aspect-[9/16] max-h-[70vh] relative bg-black flex items-center justify-center">
                  {previewFile.type === 'image' ? (
                    <img 
                      src={previewFile.url} 
                      className="w-full h-full object-contain" 
                      alt="Preview"
                    />
                  ) : (
                    <video 
                      src={previewFile.url} 
                      className="w-full h-full object-contain" 
                      controls
                      autoPlay
                      muted
                    />
                  )}
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    {previewFile.type === 'image' ? (
                      <ImageIcon className="w-5 h-5 text-indigo-400" />
                    ) : (
                      <Play className="w-5 h-5 text-indigo-400" />
                    )}
                    <span className="text-sm font-medium text-white/60 truncate flex-1">
                      {previewFile.file.name}
                    </span>
                    <span className="text-xs text-white/40">
                      {(previewFile.file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>

                  {isUploading && (
                    <div className="space-y-2">
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <p className="text-[10px] text-white/40 text-center font-bold uppercase tracking-widest">
                        Uploading... {uploadProgress}%
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      onClick={cancelPreview}
                      variant="outline"
                      className="flex-1 h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white"
                      disabled={isUploading}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={uploadStory}
                      className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black uppercase tracking-widest text-xs"
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "Share Story"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
          {activeStory && (
            <StoryViewer 
              storyGroup={activeStory}
              currentIndex={activeStoryIndex}
              initialShow={initialShowViewers}
              onIndexChange={(index) => {
                setActiveStoryIndex(index);
                if (activeStory.stories[index]) {
                  markStoryAsViewed(activeStory.stories[index].id);
                }
              }}
              onClose={() => {
                setActiveStory(null);
                setActiveStoryIndex(0);
                setInitialShowViewers(false);
              }}
              userId={userId}
            />
          )}
      </AnimatePresence>

    </>
  );
}

interface StoryViewerProps {
  storyGroup: any;
  currentIndex: number;
  initialShow?: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  userId: string;
}

function StoryViewer({ storyGroup, currentIndex, initialShow, onIndexChange, onClose, userId }: StoryViewerProps) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [viewers, setViewers] = useState<any[]>([]);
  const [showViewersList, setShowViewersList] = useState(initialShow || false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const currentStory = storyGroup.stories[currentIndex];
  const isOwner = storyGroup.user_id === userId;
  const duration = currentStory?.media_type === 'video' ? 30000 : 5000;

  useEffect(() => {
    fetchViewCount();
    if (isOwner) {
      fetchViewers();
    }
  }, [currentStory?.id]);

  useEffect(() => {
    if (isPaused || showViewersList) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(newProgress);
      
      if (newProgress >= 100) {
        goToNext();
      }
    }, 50);

    return () => clearInterval(timer);
  }, [currentIndex, isPaused, duration, showViewersList]);

  const fetchViewCount = async () => {
    if (!currentStory?.id) return;
    const { count } = await supabase
      .from("story_views")
      .select("*", { count: "exact", head: true })
      .eq("story_id", currentStory.id);
    setViewCount(count || 0);
  };

  const fetchViewers = async () => {
    if (!currentStory?.id || !isOwner) return;
    const { data, error } = await supabase
      .from("story_views")
      .select(`
        viewer_id,
        viewed_at,
        profiles:viewer_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq("story_id", currentStory.id)
      .order('viewed_at', { ascending: false });
    
    if (data) {
      setViewers(data);
    }
  };

  const goToNext = () => {
    if (currentIndex < storyGroup.stories.length - 1) {
      setProgress(0);
      onIndexChange(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setProgress(0);
      onIndexChange(currentIndex - 1);
    }
  };

  const handleTap = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    if (x < width / 3) {
      goToPrev();
    } else if (x > (width * 2) / 3) {
      goToNext();
    } else {
      setIsPaused(!isPaused);
    }
  };

  if (!currentStory) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
    >
      <div 
        className="w-full h-full max-w-lg relative bg-black flex flex-col cursor-pointer"
        onClick={handleTap}
      >
        <div className="absolute top-0 left-0 right-0 p-4 md:p-6 z-20 space-y-3 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex gap-1">
            {storyGroup.stories.map((_: any, i: number) => (
              <div key={i} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-100 ease-linear" 
                  style={{ 
                    width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%'
                  }} 
                />
              </div>
            ))}
          </div>
          
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => { e.stopPropagation(); onClose(); }} 
                    className="lg:hidden text-white/40 hover:text-white mr-1 bg-white/5 rounded-xl border border-white/5"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </Button>
                  <AvatarDisplay profile={storyGroup.profiles} className="w-10 h-10 ring-2 ring-white/20" />
                <div>
                  <p className="font-black italic text-white tracking-tighter uppercase text-sm">{storyGroup.profiles?.username}</p>
                  <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest">
                    {new Date(currentStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isOwner && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowViewersList(true); }}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-all"
                  >
                    <Eye className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-[10px] font-black text-white/80">{viewCount}</span>
                  </button>
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); onClose(); }} 
                  className="hidden lg:flex p-2 hover:bg-white/10 rounded-full transition-all"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center relative">
            {currentStory.media_type === 'image' ? (
              <img 
                src={currentStory.media_url} 
                className="w-full h-full object-contain" 
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23333" width="100" height="100"/></svg>';
                }}
              />
            ) : (
              <video 
                ref={videoRef}
                src={currentStory.media_url} 
                autoPlay 
                playsInline 
                muted={false}
                className="w-full h-full object-contain"
                onPlay={() => setIsPaused(false)}
                onPause={() => setIsPaused(true)}
              />
            )}
            
            {isPaused && !showViewersList && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="text-[10px] font-black text-white/60 uppercase tracking-widest">Paused</div>
              </div>
            )}
          </div>
          
          <div className="p-6 pb-8 text-center bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex items-center justify-center gap-2 opacity-40">
              <Radio className="w-3 h-3 text-white" />
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white">Tap to navigate</span>
            </div>
          </div>

          <AnimatePresence>
            {showViewersList && (
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="absolute inset-x-0 bottom-0 z-50 bg-[#0a0a0a] rounded-t-[2.5rem] border-t border-white/10 max-h-[70%] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                      <Eye className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black italic tracking-tighter uppercase text-white">Story Views</h3>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{viewCount} unique viewers</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowViewersList(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-all"
                  >
                    <X className="w-5 h-5 text-white/40" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                  {viewers.length > 0 ? (
                    viewers.map((viewer: any) => (
                      <div 
                        key={viewer.viewer_id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <AvatarDisplay profile={Array.isArray(viewer.profiles) ? viewer.profiles[0] : viewer.profiles} className="w-10 h-10" />
                          <div>
                            <p className="text-xs font-black italic text-white tracking-tight uppercase">
                              {(Array.isArray(viewer.profiles) ? viewer.profiles[0] : viewer.profiles)?.username || 'Unknown User'}
                            </p>
                            <div className="flex items-center gap-1.5 opacity-40">
                              <Clock className="w-3 h-3" />
                              <span className="text-[9px] font-bold uppercase tracking-widest">
                                {new Date(viewer.viewed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                        <Radio className="w-8 h-8 text-white/10 animate-pulse" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">No views recorded yet</p>
                    </div>
                  )}
                </div>
                
                <div className="p-6 bg-gradient-to-t from-black to-transparent">
                  <Button 
                    onClick={() => setShowViewersList(false)}
                    className="w-full h-12 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 font-black uppercase tracking-widest text-[10px]"
                  >
                    Close Panel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={(e) => { e.stopPropagation(); goToPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-3 hover:bg-white/10 rounded-full transition-all opacity-0 hover:opacity-100"
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="w-8 h-8 text-white" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); goToNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 hover:bg-white/10 rounded-full transition-all opacity-0 hover:opacity-100"
          >
            <ChevronRight className="w-8 h-8 text-white" />
          </button>
        </div>
      </motion.div>
  );
}
