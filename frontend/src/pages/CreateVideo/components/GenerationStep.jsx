import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Play,
  Loader,
  Sparkles,
  Film,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import {
  useGetProjectById,
  useRenderVideo,
  projectApi,
} from "../../../services/project.service";
import { useToast } from "../../../hooks/use-toast";

export default function GenerationStep({
  projectId,
  onBack,
  onStartNew,
  startNewLabel,
}) {
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollRef = useRef(null);

  const { data: project, isLoading: isLoadingProject, refetch } =
    useGetProjectById(projectId);
  const { mutateAsync: renderVideo } = useRenderVideo();

  useEffect(() => {
    if (project?.storageUrl) {
      setVideoUrl(project.storageUrl);
      if (isGenerating) setIsGenerating(false);
    } else {
      setVideoUrl(null);
    }
  }, [project]);

  // If project is in "processing" state on mount, resume polling
  useEffect(() => {
    if (project?.status === "processing" && !pollRef.current) {
      setIsGenerating(true);
      startPolling();
    }
    return () => stopPolling();
  }, [project?.status, projectId]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    const api = projectApi();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getProjectById(projectId);
        const p = res.data?.data ?? res.data;
        if (p?.status === "completed" && p?.storageUrl) {
          setVideoUrl(p.storageUrl);
          setIsGenerating(false);
          stopPolling();
          refetch();
          toast({ title: "Video ready", description: "Your video has been generated." });
        } else if (p?.status === "draft") {
          setIsGenerating(false);
          stopPolling();
          toast({ title: "Rendering failed", description: "Something went wrong. Please try again.", variant: "destructive" });
        }
      } catch {
        // keep polling on transient errors
      }
    }, 5000);
  };

  const handleGenerateVideo = async () => {
    if (!projectId) return;
    setIsGenerating(true);
    try {
      const actorId = project?.actorId;
      if (!actorId) {
        setIsGenerating(false);
        toast({ title: "No actor selected", description: "Please select an actor first.", variant: "destructive" });
        return;
      }

      const result = await renderVideo({ projectId, actorId });
      const generatedVideoUrl = result?.data?.videoUrl || result?.videoUrl;

      if (generatedVideoUrl) {
        setVideoUrl(generatedVideoUrl);
        setIsGenerating(false);
        stopPolling();
        refetch();
        toast({ title: "Video ready", description: "Your video has been generated." });
        return;
      }

      toast({ title: "Rendering started", description: "Your video is being generated. This may take a few minutes." });
      startPolling();
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || err?.message;
      if (status === 402) {
        setIsGenerating(false);
        toast({
          title: "Insufficient credits",
          description:
            message ||
            "You need more credits to generate this video. Buy credits to continue.",
          variant: "destructive",
        });
        window.dispatchEvent(new CustomEvent("openBuyCredits"));
        return;
      }
      setIsGenerating(false);
      toast({ title: "Rendering failed", description: message || "Something went wrong. Please try again.", variant: "destructive" });
    }
  };

  if (isLoadingProject) {
    return (
      <div className="cv-step-container">
        <div className="cv-step-header">
          <h2 className="cv-step-title">Generate Video</h2>
        </div>
        <Card className="bg-card border-border rounded-xl">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center mb-6">
              <Skeleton className="w-12 h-12 rounded-full mb-4" />
              <Skeleton className="h-4 w-36 mb-2 rounded" />
              <Skeleton className="h-3 w-64 mb-5 rounded" />
              <Skeleton className="h-10 w-44 rounded-lg" />
            </div>
            <div className="border-t border-border pt-5">
              <Skeleton className="h-3 w-16 mb-3 rounded" />
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="cv-step-container">
      <div className="cv-step-header">
        <h2 className="cv-step-title">Generate Video</h2>
        <p className="cv-step-desc">
          Render your final video from the storyboard scenes.
        </p>
      </div>

      <Card className="bg-card border-border rounded-xl">
        <CardContent className="p-6">
          {/* Status + action */}
          <div className="text-center mb-6">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${videoUrl ? "bg-emerald-500/10" : "bg-primary/10"}`}
            >
              {videoUrl ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              ) : (
                <Film className="w-7 h-7 text-primary" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {videoUrl ? "Video generated!" : isGenerating ? "Generating video..." : "Ready to generate"}
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              {videoUrl
                ? "Your video is ready. Watch it below or regenerate anytime."
                : isGenerating
                  ? "This may take a few minutes. You can stay on this page or come back later."
                  : "Render your finalized storyboard into a video."}
            </p>
            <Button
              className="btn-gradient-primary font-semibold px-6 h-10 gap-2 rounded-lg transition-colors"
              onClick={handleGenerateVideo}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {videoUrl ? "Regenerate Video" : "Generate Video"}
                </>
              )}
            </Button>
          </div>

          {/* Video preview */}
          <div className="border-t border-border pt-5">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Preview
            </h4>
            <div className="bg-muted/40 border border-border rounded-xl overflow-hidden">
              {videoUrl ? (
                <video controls className="w-full" autoPlay>
                  <source src={videoUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
                    {isGenerating ? (
                      <Loader className="w-6 h-6 text-primary animate-spin" />
                    ) : (
                      <Play className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {isGenerating ? "Rendering in progress..." : "Video will appear here after generation"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom actions */}
      <div
        className="cv-step-back-row"
        style={{ justifyContent: "space-between" }}
      >
        <Button
          variant="ghost"
          size="sm"
          className="cv-back-btn"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Storyboard
        </Button>
        {onStartNew && (videoUrl || startNewLabel) && (
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground border-border hover:text-foreground hover:bg-accent"
            onClick={onStartNew}
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            {startNewLabel ?? "Create New Video"}
          </Button>
        )}
      </div>
    </div>
  );
}
