import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  CheckCircle2,
  Loader,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Download,
  RotateCw,
  Upload,
} from 'lucide-react';
import { useSubmitSceneFeedback } from '../../services/project.service';
import { useToast } from '../../hooks/use-toast';
import {
  downloadImageFromUrl,
  downloadSketchFile,
} from '../../utils/storyboardAssets';

function findFeedbackForScene(feedbackList, sceneId, imageType) {
  if (!feedbackList?.length || !sceneId) return null;
  return feedbackList.find(
    (f) =>
      f.sceneId === sceneId &&
      String(f.imageType || '').toLowerCase() === imageType
  );
}

export default function StoryboardImageLightbox({
  open,
  onOpenChange,
  frame,
  projectId,
  initialTab = 'final',
  feedbackList = [],
  onRegenerate,
  onUploadSketch,
  showSketchUpload = false,
  sketchUploadDisabled = false,
  /** When false, hide sketch/final download (e.g. on Images step; use Sketches step for downloads). */
  showSketchDownloads = true,
}) {
  const { toast } = useToast();
  const submitFeedback = useSubmitSceneFeedback();
  const hasSketch = Boolean(frame?.sketchUrl);
  const hasFinal = Boolean(frame?.finalImageUrl);
  const hasBoth = hasSketch && hasFinal;

  const defaultTab = useMemo(() => {
    if (!frame) return 'sketch';
    if (hasBoth) return initialTab === 'sketch' ? 'sketch' : 'final';
    if (hasFinal) return 'final';
    return 'sketch';
  }, [frame, hasBoth, hasFinal, initialTab]);

  const [tab, setTab] = useState(defaultTab);

  useEffect(() => {
    if (open && frame) {
      setTab(defaultTab);
    }
  }, [open, frame?.id, defaultTab]);

  const imageType = tab === 'sketch' ? 'sketch' : 'final';
  const imageUrl =
    tab === 'sketch' ? frame?.sketchUrl : frame?.finalImageUrl;

  const existing = useMemo(
    () =>
      findFeedbackForScene(feedbackList, frame?.id, imageType),
    [feedbackList, frame?.id, imageType]
  );

  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');
  const sketchFileInputRef = useRef(null);
  const [sketchUploadLoading, setSketchUploadLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  useEffect(() => {
    if (existing) {
      setRating(existing.rating || null);
      setComment(existing.comment || '');
    } else {
      setRating(null);
      setComment('');
    }
  }, [existing, imageType, frame?.id]);

  const handleDownloadCurrent = async () => {
    if (!frame || downloadLoading) return;
    setDownloadLoading(true);
    try {
      if (imageType === 'sketch') {
        if (!frame.sketchUrl || !frame.id) return;
        await downloadSketchFile(
          frame.id,
          `scene-${frame.sequenceOrder}-sketch.png`,
        );
        return;
      }
      if (!imageUrl) return;
      const base = `scene-${frame.sequenceOrder}-final`;
      await downloadImageFromUrl(imageUrl, `${base}.png`);
    } catch (err) {
      toast({
        title: 'Download failed',
        description:
          err?.response?.data?.error ||
          err?.message ||
          'Could not download this image.',
        variant: 'destructive',
      });
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleSubmitFeedback = () => {
    if (!frame?.id || !projectId || !rating) {
      toast({
        title: 'Rating required',
        description: 'Choose thumbs up or down before saving.',
        variant: 'destructive',
      });
      return;
    }
    submitFeedback.mutate(
      {
        sceneId: frame.id,
        projectId,
        imageType,
        rating,
        comment: comment.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Feedback saved',
            description: 'Your feedback was recorded for this image.',
          });
        },
        onError: (err) => {
          toast({
            title: 'Could not save feedback',
            description: err?.response?.data?.error || err?.message || 'Try again.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  if (!frame) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="storyboard-view-dialog max-w-[min(96vw,1200px)] w-[min(96vw,1200px)] bg-background border-border p-0 rounded-xl overflow-hidden flex flex-col gap-0">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border flex-shrink-0 pr-14">
          <div className="flex items-center gap-2.5 flex-wrap">
            <DialogTitle className="text-base font-semibold text-foreground">
              Scene {frame.sequenceOrder}
            </DialogTitle>
            <DialogDescription className="sr-only">
              View storyboard images, feedback, and download actions for this scene.
            </DialogDescription>
            <Badge
              className={`px-2 py-0.5 rounded-md font-medium flex items-center gap-1.5 text-[11px] ${
                frame.status === 'completed' ||
                frame.status === 'LORA_PROCESSED' ||
                String(frame.status || '').toLowerCase() === 'lora_processed'
                  ? 'bg-emerald-600/80 text-white'
                  : frame.status === 'processing' || frame.status === 'SKETCHED'
                    ? 'bg-blue-600/80 text-white'
                    : frame.status === 'pending' || frame.status === 'PENDING'
                      ? 'bg-amber-600/80 text-white'
                      : 'bg-secondary/90 text-secondary-foreground'
              }`}
            >
              {frame.status === 'completed' ||
              frame.status === 'LORA_PROCESSED' ||
              String(frame.status || '').toLowerCase() === 'lora_processed' ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <>
                  {(frame.status === 'processing' ||
                    frame.status === 'SKETCHED') && (
                    <Loader className="w-3 h-3 animate-spin" />
                  )}
                  {(frame.status === 'pending' || frame.status === 'PENDING') && (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  <span className="capitalize">{frame.status}</span>
                </>
              )}
            </Badge>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-4">
          {hasBoth ? (
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="mb-2">
                <TabsTrigger value="sketch">Sketch</TabsTrigger>
                <TabsTrigger value="final">Final</TabsTrigger>
              </TabsList>
              <TabsContent value="sketch" className="mt-0">
                {frame.sketchUrl ? (
                  <div className="rounded-xl overflow-hidden border border-border bg-card flex items-center justify-center min-h-[200px] max-h-[75vh]">
                    <img
                      src={frame.sketchUrl}
                      alt={`Scene ${frame.sequenceOrder} sketch`}
                      className="w-full max-h-[75vh] object-contain"
                    />
                  </div>
                ) : null}
              </TabsContent>
              <TabsContent value="final" className="mt-0">
                {frame.finalImageUrl ? (
                  <div className="rounded-xl overflow-hidden border border-border bg-card flex items-center justify-center min-h-[200px] max-h-[75vh]">
                    <img
                      src={frame.finalImageUrl}
                      alt={`Scene ${frame.sequenceOrder} final`}
                      className="w-full max-h-[75vh] object-contain"
                    />
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
          ) : imageUrl ? (
            <div className="rounded-xl overflow-hidden border border-border bg-card flex items-center justify-center min-h-[200px] max-h-[75vh]">
              <img
                src={imageUrl}
                alt={`Scene ${frame.sequenceOrder}`}
                className="w-full max-h-[75vh] object-contain"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground border border-border/80 bg-muted/50 rounded-lg px-3 py-2">
              No image for this scene yet.
            </p>
          )}

          {((imageUrl && showSketchDownloads) ||
            (typeof onRegenerate === 'function' && frame) ||
            (imageType === 'sketch' &&
              showSketchUpload &&
              typeof onUploadSketch === 'function')) && (
            <div className="flex flex-wrap gap-2">
              {imageUrl && showSketchDownloads && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={downloadLoading}
                  onClick={handleDownloadCurrent}
                  title={downloadLoading ? 'Downloading…' : undefined}
                >
                  {downloadLoading ? (
                    <Loader className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-1.5" />
                  )}
                  {downloadLoading
                    ? 'Downloading…'
                    : `Download ${imageType === 'sketch' ? 'sketch' : 'image'}`}
                </Button>
              )}
              {imageType === 'sketch' &&
                showSketchUpload &&
                typeof onUploadSketch === 'function' && (
                  <>
                    <input
                      ref={sketchFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setSketchUploadLoading(true);
                        try {
                          await onUploadSketch(frame, file);
                        } finally {
                          setSketchUploadLoading(false);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={sketchUploadLoading || sketchUploadDisabled}
                      onClick={() => sketchFileInputRef.current?.click()}
                      title={
                        sketchUploadLoading
                          ? 'Uploading…'
                          : sketchUploadDisabled
                            ? 'Wait for the current generation to finish'
                            : 'Upload or replace sketch for this scene'
                      }
                    >
                      {sketchUploadLoading ? (
                        <Loader className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-1.5" />
                      )}
                      {sketchUploadLoading ? 'Uploading…' : 'Upload sketch'}
                    </Button>
                  </>
                )}
              {typeof onRegenerate === 'function' && frame && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRegenerate(frame)}
                >
                  <RotateCw className="w-4 h-4 mr-1.5" />
                  Redo
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Script Text
            </h4>
            <p className="text-sm text-foreground bg-card p-3.5 rounded-lg border border-border leading-relaxed break-words">
              {frame.scriptText}
            </p>
          </div>

          {frame.aiPrompt && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                AI Prompt
              </h4>
              <p className="text-sm text-muted-foreground bg-card p-3.5 rounded-lg border border-border leading-relaxed break-words">
                {frame.aiPrompt}
              </p>
            </div>
          )}

          {imageUrl && projectId && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Feedback on this {imageType === 'sketch' ? 'sketch' : 'image'}
              </h4>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={rating === 'up' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setRating('up')}
                >
                  <ThumbsUp className="w-4 h-4" />
                  Up
                </Button>
                <Button
                  type="button"
                  variant={rating === 'down' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setRating('down')}
                >
                  <ThumbsDown className="w-4 h-4" />
                  Down
                </Button>
              </div>
              <Textarea
                placeholder="Optional comment (e.g. lighting, composition)…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="resize-none bg-background"
              />
              <Button
                type="button"
                size="sm"
                disabled={!rating || submitFeedback.isPending}
                onClick={handleSubmitFeedback}
              >
                {submitFeedback.isPending ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save feedback'
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
