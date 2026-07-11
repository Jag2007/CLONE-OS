import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Play, Loader, Sparkles, Film } from 'lucide-react';
import { Skeleton } from '../../../components/ui/skeleton';
import { useGetProjectById, useRenderVideo, projectApi } from '../../../services/project.service';
import { useToast } from '../../../hooks/use-toast';

export default function VideoGenerationSection({ sectionRef, selectedProjectId, frames, actors }) {
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollRef = useRef(null);

  // Fetch the selected project to check for existing video
  const { data: project, isLoading: isLoadingProject, refetch } = useGetProjectById(selectedProjectId);

  // Real render mutation
  const { mutateAsync: renderVideo } = useRenderVideo();

  // Load existing video when project changes
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
    if (project?.status === 'processing' && !pollRef.current) {
      setIsGenerating(true);
      startPolling();
    }
    return () => stopPolling();
  }, [project?.status, selectedProjectId]);

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
        const res = await api.getProjectById(selectedProjectId);
        const p = res.data?.data ?? res.data;
        if (p?.status === 'completed' && p?.storageUrl) {
          setVideoUrl(p.storageUrl);
          setIsGenerating(false);
          stopPolling();
          refetch();
          toast({ title: 'Video ready', description: 'Your video has been generated.' });
        } else if (p?.status === 'draft') {
          setIsGenerating(false);
          stopPolling();
          toast({ title: 'Rendering failed', description: 'Something went wrong. Please try again.', variant: 'destructive' });
        }
      } catch {
        // keep polling on transient errors
      }
    }, 5000);
  };

  const handleGenerateVideo = async () => {
    if (!selectedProjectId) {
      toast({ title: 'No project selected', description: 'Please select a project first.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);

    try {
      const actorId = project?.actorId;
      if (!actorId) {
        setIsGenerating(false);
        toast({ title: 'No actor selected', description: 'Please select an actor first.', variant: 'destructive' });
        return;
      }

      const result = await renderVideo({ projectId: selectedProjectId, actorId });
      const generatedVideoUrl = result?.data?.videoUrl || result?.videoUrl;

      if (generatedVideoUrl) {
        setVideoUrl(generatedVideoUrl);
        setIsGenerating(false);
        stopPolling();
        refetch();
        toast({ title: 'Video ready', description: 'Your video has been generated.' });
        return;
      }

      toast({ title: 'Rendering started', description: 'Your video is being generated. This may take a few minutes.' });
      startPolling();
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || err?.message;
      if (status === 402) {
        setIsGenerating(false);
        toast({
          title: 'Insufficient credits',
          description: message || 'You need more credits to generate this video. Buy credits to continue.',
          variant: 'destructive',
        });
        window.dispatchEvent(new CustomEvent('openBuyCredits'));
        return;
      }
      setIsGenerating(false);
      toast({ title: 'Rendering failed', description: message || 'Something went wrong. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <section ref={sectionRef} className="dashboard-section">
      <div className="section-header">
        <h2 className="section-title">Video Generation</h2>
      </div>

      {selectedProjectId && isLoadingProject ? (
        <Card className="bg-card border-border rounded-xl max-w-3xl mx-auto">
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
      ) : (
        <Card className="bg-card border-border rounded-xl max-w-3xl mx-auto">
          <CardContent className="p-6">
            {/* Generate Action */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Film className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {videoUrl ? 'Video generated' : isGenerating ? 'Generating video...' : 'Ready to generate'}
              </h3>
              <p className="text-xs text-muted-foreground mb-5">
                {videoUrl
                  ? 'Your video is ready. You can regenerate it anytime.'
                  : isGenerating
                    ? 'This may take a few minutes. You can stay on this page or come back later.'
                    : 'Create a video from your finalized storyboard scenes'}
              </p>
              <Button
                className="btn-gradient-primary font-semibold px-6 h-10 gap-2 rounded-lg transition-colors"
                onClick={handleGenerateVideo}
                disabled={isGenerating || !selectedProjectId}
              >
                {isGenerating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {videoUrl ? 'Regenerate Video' : 'Generate Video'}
                  </>
                )}
              </Button>
            </div>

            {/* Video Preview */}
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
                      {isGenerating
                        ? 'Rendering in progress...'
                        : selectedProjectId
                          ? 'Video will appear here after generation'
                          : 'Select a project to get started'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
