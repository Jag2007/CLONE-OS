import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import { Film, Lock, Unlock, Loader, CheckCircle2, AlertCircle, RotateCw } from 'lucide-react';
import { useStoryboardStore, useStoryboardFrames } from '../../../store/storyboard.store';
import { useRegenerateScene } from '../../../services/project.service';

export default function StoryboardSection({ sectionRef, onFramesChange, onProceed }) {
  const frames = useStoryboardFrames();
  const { updateFrame } = useStoryboardStore();
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [regenerateFrame, setRegenerateFrame] = useState(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const regenerateMutation = useRegenerateScene();

  useEffect(() => {
    if (!regenerateFrame) return;
    setRegeneratePrompt(String(regenerateFrame.aiPrompt || regenerateFrame.scriptText || '').trim());
  }, [regenerateFrame?.id]);

  useEffect(() => {
    onFramesChange?.(frames);
  }, [frames, onFramesChange]);

  const toggleLock = (id) => {
    updateFrame(id, (f) => ({ ...f, isLocked: !f.isLocked }));
  };

  return (
    <section ref={sectionRef} className="dashboard-section">
      <div className="section-header">
        <h2 className="section-title">STORYBOARD GENERATION</h2>
      </div>
      <div className="storyboard-grid">
        {frames.length === 0 ? (
          <div className="col-span-full text-center text-muted-foreground py-8">
            No storyboard scenes yet. Generate from your script to see scenes here.
          </div>
        ) : (
          frames.map((frame) => (
            <Card key={frame.id} className="storyboard-card">
              <CardContent className="storyboard-content">
                <div className="frame-preview">
                  {frame.sketchUrl ? (
                    <img src={frame.sketchUrl} alt={frame.scene} />
                  ) : (
                    <div className="frame-placeholder">
                      <Film className="w-8 h-8" />
                      <p>Choose File to Add Image!</p>
                    </div>
                  )}
                </div>
                <div className="frame-info">
                  <h4>Scene {frame.sequenceOrder}</h4>
                  <p className="line-clamp-5">{frame.scriptText}</p>
                </div>
                <div className="frame-actions">
                  <Button size="sm" variant="ghost" className="frame-action-btn" onClick={() => setSelectedFrame(frame)}>
                    View Details
                  </Button>
                  <Button size="sm" variant="ghost" className="frame-action-btn" onClick={() => setRegenerateFrame(frame)}>Generate New</Button>
                  <Button size="sm" variant="ghost" className="frame-action-btn" onClick={() => toggleLock(frame.id)}>
                    {frame.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <div className="storyboard-global-actions">
        <Button variant="outline" className="regenerate-all-btn">AI Generate Images</Button>
        <Button className="proceed-video-btn" onClick={onProceed}>Proceed to Video</Button>
      </div>

      {/* Frame Details Modal */}
      <Dialog open={!!selectedFrame} onOpenChange={() => setSelectedFrame(null)}>
        <DialogContent className="max-w-4xl bg-background border-border h-[400px] p-0">
          <DialogTitle className="sr-only">
            Scene {selectedFrame?.sequenceOrder} details
          </DialogTitle>
          <DialogDescription className="sr-only">
            View storyboard frame status and scene details.
          </DialogDescription>
          {/* Top Left Badges */}
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            {/* Scene Number Badge */}
            <Badge className="badge-gradient-primary px-3 py-1 rounded-full font-semibold flex items-center gap-2 shadow-lg">
              <span className="text-xs">🎬</span>
              Scene {selectedFrame?.sequenceOrder}
            </Badge>

            {/* Status Badge with dynamic color */}
            <Badge
              className={`px-3 py-1 rounded-full font-semibold flex items-center gap-2 shadow-lg ${
                selectedFrame?.status === 'completed'
                  ? 'bg-green-600/80 text-white'
                  : selectedFrame?.status === 'processing'
                  ? 'bg-blue-600/80 text-white'
                  : selectedFrame?.status === 'pending'
                  ? 'bg-yellow-600/80 text-white'
                  : 'bg-secondary/90 text-secondary-foreground'
              }`}
            >
              {selectedFrame?.status === 'completed' && <CheckCircle2 className="w-4 h-4" />}
              {selectedFrame?.status === 'processing' && <Loader className="w-4 h-4 animate-spin" />}
              {selectedFrame?.status === 'pending' && <AlertCircle className="w-4 h-4" />}
              <span className="capitalize text-xs">{selectedFrame?.status}</span>
            </Badge>
          </div>

          <div className="flex gap-6 h-[inherit]">
            {/* Left Side - Image */}
            <div className="w-1/2 flex flex-col items-center justify-center bg-muted/60 overflow-hidden">
              {selectedFrame?.sketchUrl ? (
                <img src={selectedFrame.sketchUrl} alt={`Scene ${selectedFrame?.sequenceOrder}`} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <Film className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-sm">No image available</p>
                </div>
              )}
            </div>

            {/* Right Side - Scrollable Content */}
            <div className="w-1/2 overflow-y-auto pr-4 space-y-4 pt-12">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      if (!selectedFrame) return;
                      setRegenerateFrame(selectedFrame);
                      setSelectedFrame(null);
                    }}
                  >
                    <RotateCw className="w-4 h-4" />
                    Redo
                  </Button>
                </div>
                {/* Script Text */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">Script Text</h3>
                  <p className="text-sm text-foreground bg-card p-3 rounded border border-border">{selectedFrame?.scriptText}</p>
                </div>

                {/* AI Prompt */}
              {selectedFrame?.aiPrompt &&  <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">AI Prompt</h3>
                  <p className="text-sm text-muted-foreground bg-card p-3 rounded border border-border">{selectedFrame?.aiPrompt}</p>
                </div>}

              

                {/* Final Image */}
                {selectedFrame?.finalImageUrl && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <h3 className="font-semibold text-sm text-foreground">Final Image</h3>
                    <img src={selectedFrame.finalImageUrl} alt="Final" className="w-full rounded-lg border border-border" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Regenerate Scene Modal */}
      <Dialog open={!!regenerateFrame} onOpenChange={() => {
        setRegenerateFrame(null);
        setRegeneratePrompt('');
      }}>
        <DialogContent className="bg-background border-border max-w-md">
          <div className="space-y-4">
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground mb-1">Regenerate Scene</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">Enter a prompt for Scene {regenerateFrame?.sequenceOrder}</DialogDescription>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Prompt</label>
              <Textarea
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                placeholder="Describe what you'd like for this scene..."
                className="bg-background border-border text-foreground resize-none"
                rows={4}
              />
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setRegenerateFrame(null);
                  setRegeneratePrompt('');
                }}
                className="bg-background border-border text-muted-foreground hover:bg-accent"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (regeneratePrompt.trim() && regenerateFrame?.id) {
                    regenerateMutation.mutate(
                      { sceneId: regenerateFrame.id, prompt: regeneratePrompt },
                      {
                        onSuccess: () => {
                          setRegenerateFrame(null);
                          setRegeneratePrompt('');
                        },
                      }
                    );
                  }
                }}
                disabled={!regeneratePrompt.trim() || regenerateMutation.isPending}
                className="btn-gradient-primary"
              >
                {regenerateMutation.isPending ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RotateCw className="w-4 h-4 mr-2" />
                    Redo
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
