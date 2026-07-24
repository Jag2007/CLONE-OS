import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import SceneScriptCard from '../../../components/storyboard/SceneScriptCard';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Skeleton } from '../../../components/ui/skeleton';
import StoryboardImageLightbox from '../../../components/storyboard/StoryboardImageLightbox';
import {
  RefreshCw,
  Loader,
  CheckCircle2,
  Pencil,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Archive,
  RotateCw,
} from 'lucide-react';
import { useToast } from '../../../hooks/use-toast';
import {
  useGetProjectById,
  useGenerateScript,
  useGenerateSketches,
  useGenerateImages,
  useRegenerateScene,
  useGetProjectFeedback,
  useUploadSceneSketch,
} from '../../../services/project.service';
import { downloadSketchFile, downloadSketchesZip } from '../../../utils/storyboardAssets';
import { useStoryboardStore, useStoryboardFrames } from '../../../store/storyboard.store';

const PHASE = { PROMPT: 'prompt', SCENES: 'scenes', SKETCHES: 'sketches', IMAGES: 'images' };
const PHASE_STEPS = [
  { key: PHASE.PROMPT, label: 'Prompt', number: 1 },
  { key: PHASE.SCENES, label: 'Scenes', number: 2 },
  { key: PHASE.SKETCHES, label: 'Sketches', number: 3 },
  { key: PHASE.IMAGES, label: 'Images', number: 4 },
];

function phaseIndex(phase) {
  return PHASE_STEPS.findIndex((s) => s.key === phase);
}

const MAX_SKETCH_FILE_BYTES = 10 * 1024 * 1024;

const REGEN_TO_PHASE = {
  script: PHASE.PROMPT,
  sketches: PHASE.SKETCHES,
  images: PHASE.IMAGES,
};

const getApiErrorMessage = (error, fallback) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

export default function ScriptStep({ projectId, onBack, onProceedToVideo, regenParam }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState(PHASE.PROMPT);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const lastLoadedProjectId = useRef(null);
  const frames = useStoryboardFrames();
  const { setFrames, updateFrame, clearFrames } = useStoryboardStore();

  const { data: selectedProject, isLoading: isLoadingProject } = useGetProjectById(projectId);

  const { data: feedbackList = [] } = useGetProjectFeedback(projectId);

  const { mutateAsync: generateScript, isPending: generatingScript } = useGenerateScript();
  const { mutateAsync: generateSketches, isPending: generatingSketches } = useGenerateSketches();
  const { mutateAsync: generateImages, isPending: generatingImages } = useGenerateImages();
  const regenerateMutation = useRegenerateScene();
  const {
    mutateAsync: uploadSceneSketchAsync,
    isPending: uploadingSceneSketch,
  } = useUploadSceneSketch();

  const [lightbox, setLightbox] = useState(null);
  const [downloadingAllSketches, setDownloadingAllSketches] = useState(false);
  const [regenerateFrame, setRegenerateFrame] = useState(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState('');

  useEffect(() => {
    if (!regenerateFrame) return;
    setRegeneratePrompt(String(regenerateFrame.aiPrompt || regenerateFrame.scriptText || '').trim());
  }, [regenerateFrame?.id]);

  const isBusy =
    generatingScript ||
    generatingSketches ||
    generatingImages ||
    uploadingSceneSketch;

  const showPerSceneSketchUpload =
    phase === PHASE.SKETCHES && frames.length > 0;

  const canDownloadAllSketches =
    frames.length > 0 && frames.every((f) => f.sketchUrl);

  const parseScenes = (res) => {
    const scenes = res?.data ?? res?.scenes ?? res ?? [];
    return (scenes || []).map((scene, idx) => ({
      id: scene.id || `scene-${idx}`,
      scene: scene.scene || `Scene ${scene.sequenceOrder ?? idx + 1}`,
      scriptText: scene.scriptText || scene.aiPrompt || 'No description',
      aiPrompt: scene.aiPrompt || null,
      sketchUrl: scene.sketchUrl || null,
      finalImageUrl: scene.finalImageUrl || null,
      status: scene.status || 'pending',
      sequenceOrder: scene.sequenceOrder ?? idx + 1,
      isLocked: false,
    }));
  };

  useEffect(() => {
    if (!projectId) {
      clearFrames();
      setPrompt('');
      setPhase(PHASE.PROMPT);
      setPromptCollapsed(false);
      lastLoadedProjectId.current = null;
      return;
    }
    if (!selectedProject) return;
    if (lastLoadedProjectId.current === projectId && frames.length > 0) return;
    lastLoadedProjectId.current = projectId;

    const scenes = selectedProject.scenes || [];
    if (scenes.length > 0) {
      const loadedFrames = scenes
        .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0))
        .map((scene, idx) => ({
          id: scene.id || `scene-${idx}`,
          scene: scene.scene || `Scene ${scene.sequenceOrder ?? idx + 1}`,
          scriptText: scene.scriptText || scene.aiPrompt || 'No description',
          aiPrompt: scene.aiPrompt || null,
          sketchUrl: scene.sketchUrl || null,
          finalImageUrl: scene.finalImageUrl || null,
          status: scene.status || 'pending',
          sequenceOrder: scene.sequenceOrder ?? idx + 1,
          isLocked: false,
        }));
      setFrames(loadedFrames);
      const allHaveFinalImages = loadedFrames.every((f) => f.finalImageUrl);
      const hasSketches = loadedFrames.some((f) => f.sketchUrl);
      if (allHaveFinalImages) setPhase(PHASE.IMAGES);
      else if (hasSketches) setPhase(PHASE.SKETCHES);
      else setPhase(PHASE.SCENES);
      if (selectedProject.scriptText) {
        setPrompt(selectedProject.scriptText);
      } else {
        // Fallback: if no scriptText saved, show a placeholder
        setPrompt('(Original prompt not saved for this project)');
      }
      setPromptCollapsed(true);
      if (regenParam && REGEN_TO_PHASE[regenParam] && !allHaveFinalImages) {
        setPhase(REGEN_TO_PHASE[regenParam]);
        if (regenParam === 'script') setPromptCollapsed(false);
      }
    } else {
      clearFrames();
      setPhase(PHASE.PROMPT);
      setPromptCollapsed(false);
      if (selectedProject.scriptText) setPrompt(selectedProject.scriptText);
      else setPrompt('');
    }
  }, [projectId, selectedProject, frames.length, clearFrames, setFrames, regenParam]);

  const handleGenerateScript = async () => {
    const userPrompt = prompt.trim();
    if (!userPrompt) {
      toast({ title: 'Enter a prompt', description: 'Describe your script idea.', variant: 'destructive' });
      return;
    }
    try {
      const res = await generateScript({ projectId, prompt: userPrompt });
      const newFrames = parseScenes(res);
      setFrames(newFrames);
      setPromptCollapsed(true);
      setPhase(PHASE.SCENES);
      toast({ title: 'Script generated', description: `${newFrames.length} scenes created.` });
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: getApiErrorMessage(error, 'Could not generate script.'),
        variant: 'destructive',
      });
    }
  };

  const handleGenerateSketches = async () => {
    try {
      const res = await generateSketches(projectId);
      const newFrames = parseScenes(res);
      setFrames(newFrames);
      setPhase(PHASE.SKETCHES);
      toast({ title: 'Sketches generated', description: 'Storyboard sketches are ready.' });
    } catch (error) {
      toast({ title: 'Sketch generation failed', description: error?.message || 'Could not generate sketches.', variant: 'destructive' });
    }
  };

  const handleGenerateImages = async () => {
    try {
      const res = await generateImages({ projectId, force: true });
      const newFrames = parseScenes(res);
      const finalImageCount = newFrames.filter((frame) => Boolean(frame.finalImageUrl)).length;
      if (finalImageCount === 0) {
        throw new Error('No realistic images were returned by the backend.');
      }
      setFrames(newFrames);
      setPhase(PHASE.IMAGES);
      toast({
        title: 'Final images generated',
        description: `${finalImageCount} photorealistic image${finalImageCount === 1 ? '' : 's'} ready.`,
      });
    } catch (error) {
      toast({
        title: 'Image generation failed',
        description: getApiErrorMessage(error, 'Could not generate final images.'),
        variant: 'destructive',
      });
    }
  };

  const toggleLock = (id) => updateFrame(id, (f) => ({ ...f, isLocked: !f.isLocked }));

  const openLightbox = (frame, opts) => {
    setLightbox({
      frame,
      initialTab: opts?.tab ?? (frame.finalImageUrl ? 'final' : 'sketch'),
    });
  };

  const handleDownloadSketchForFrame = async (frame) => {
    if (!frame?.sketchUrl || !frame?.id) return;
    try {
      await downloadSketchFile(
        frame.id,
        `scene-${frame.sequenceOrder}-sketch.png`,
      );
    } catch (error) {
      toast({
        title: 'Download failed',
        description:
          error?.response?.data?.error ||
          error?.message ||
          'Could not download this sketch.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadAllSketches = async () => {
    setDownloadingAllSketches(true);
    try {
      await downloadSketchesZip(frames);
      toast({
        title: 'Download started',
        description: 'Your sketches zip is downloading.',
      });
    } catch (e) {
      toast({
        title: 'Download failed',
        description: e?.message || 'Could not build the zip.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingAllSketches(false);
    }
  };

  const handleUploadSceneSketch = async (frame, file) => {
    if (!projectId || !frame?.id) return;
    if (file.size > MAX_SKETCH_FILE_BYTES) {
      toast({
        title: 'File too large',
        description: `Each image must be at most 10 MB. "${file.name}" is too large.`,
        variant: 'destructive',
      });
      return;
    }
    const okType =
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/webp';
    if (!okType) {
      toast({
        title: 'Invalid file type',
        description: `Only PNG, JPEG, or WEBP are allowed. Got "${file.name}".`,
        variant: 'destructive',
      });
      return;
    }
    try {
      const scene = await uploadSceneSketchAsync({
        sceneId: frame.id,
        projectId,
        file,
      });
      updateFrame(frame.id, (f) => ({
        ...f,
        sketchUrl: scene.sketchUrl ?? f.sketchUrl,
        status: scene.status ?? f.status,
      }));
      setLightbox((prev) =>
        prev?.frame?.id === frame.id
          ? {
              ...prev,
              frame: {
                ...prev.frame,
                sketchUrl: scene.sketchUrl ?? prev.frame.sketchUrl,
                status: scene.status ?? prev.frame.status,
              },
            }
          : prev,
      );
      toast({
        title: 'Sketch uploaded',
        description: `Scene ${frame.sequenceOrder} was updated.`,
      });
    } catch (error) {
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Upload failed.';
      toast({
        title: 'Upload failed',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const primaryAction = useMemo(() => {
    if (phase === PHASE.PROMPT) return { label: 'Generate Script', handler: handleGenerateScript, loading: generatingScript };
    if (phase === PHASE.SCENES) return { label: 'Generate Sketches', handler: handleGenerateSketches, loading: generatingSketches };
    if (phase === PHASE.SKETCHES) return { label: 'Generate Final Images', handler: handleGenerateImages, loading: generatingImages };
    if (phase === PHASE.IMAGES) return { label: 'Regenerate Final Images', handler: handleGenerateImages, loading: generatingImages };
    return null;
  }, [phase, generatingScript, generatingSketches, generatingImages, projectId, prompt]);

  const currentPhaseIdx = phaseIndex(phase);
  const showLoadingSkeleton = projectId && isLoadingProject && lastLoadedProjectId.current !== projectId;
  const allHaveFinalImages =
    frames.length > 0 && frames.every((frame) => Boolean(frame.finalImageUrl));
  const canContinueToVideo = allHaveFinalImages && typeof onProceedToVideo === 'function';

  return (
    <div className="cv-step-container">
      <div className="cv-step-header">
        <h2 className="cv-step-title">Script & Storyboard</h2>
        <p className="cv-step-desc">Generate your script, then create sketches and final images for each scene.</p>
      </div>

      {showLoadingSkeleton ? (
        <div className="space-y-5">
          <div className="flex items-center justify-center gap-2 py-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-3 w-14 rounded" />
                {i < 4 && <Skeleton className="h-3 w-3 rounded" />}
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-6 max-w-[800px] mx-auto">
            <Skeleton className="h-3 w-48 mb-4 rounded" />
            <Skeleton className="h-28 w-full mb-4 rounded-lg" />
            <div className="flex justify-center"><Skeleton className="h-10 w-44 rounded-lg" /></div>
          </div>
        </div>
      ) : (
        <>
          {/* Phase Stepper */}
          <div className="phase-stepper">
            {PHASE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentPhaseIdx;
              const isCurrent = idx === currentPhaseIdx;
              return (
                <div key={step.key} className={`phase-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
                  <div className="phase-step-circle">
                    {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.number}
                  </div>
                  <span className="phase-step-label">{step.label}</span>
                  {idx < PHASE_STEPS.length - 1 && <ChevronRight className="phase-step-separator w-3.5 h-3.5" />}
                </div>
              );
            })}
          </div>

          {regenParam && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary">
              {regenParam === 'script' && 'Edit the prompt below and regenerate the script, or continue from here.'}
              {regenParam === 'sketches' && 'You can regenerate sketches for all scenes below.'}
              {regenParam === 'images' && 'You can regenerate final images for scenes below.'}
            </div>
          )}

          {/* Prompt Area */}
          <Card className="script-card">
            <CardContent className="script-content">
              {promptCollapsed ? (
                <div className="prompt-collapsed">
                  <div className="prompt-collapsed-text">
                    <span className="prompt-collapsed-label">Your prompt</span>
                    <p className="prompt-collapsed-value">{prompt}</p>
                  </div>
                  <Button variant="outline" size="sm" className="prompt-edit-btn" onClick={() => setPromptCollapsed(false)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Edit
                  </Button>
                </div>
              ) : (
                <div className="script-upload-area">
                  <div className="paste-script">
                    <p>Describe your script idea or enter a prompt</p>
                    <Textarea
                      placeholder="e.g. A 30-second commercial about a futuristic coffee shop with a robot barista..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="script-textarea"
                      rows={5}
                    />
                    {prompt.length > 0 && (
                      <div className="text-right mt-1">
                        <span className="text-xs text-muted-foreground">{prompt.length} characters</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(primaryAction || canContinueToVideo) && (
                <div className="script-actions">
                  {primaryAction && (
                    <Button className="generate-storyboard-btn" onClick={primaryAction.handler} disabled={isBusy}>
                      {primaryAction.loading ? (
                        <><Loader className="w-4 h-4 animate-spin mr-2" />Generating...</>
                      ) : (
                        <>{primaryAction.label}<ArrowRight className="w-4 h-4 ml-2" /></>
                      )}
                    </Button>
                  )}
                  {canContinueToVideo && (
                    <Button
                      type="button"
                      variant="outline"
                      className="generate-storyboard-btn"
                      onClick={onProceedToVideo}
                      disabled={isBusy}
                    >
                      Continue to Generate Video
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scene Grid */}
          {frames.length > 0 && (currentPhaseIdx >= phaseIndex(PHASE.SCENES) || canContinueToVideo) && (
            <div className="storyboard-area">
              <div className="storyboard-area-header flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="subsection-title">Scenes</h3>
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{frames.length}</span>
                  {phase === PHASE.SKETCHES && canDownloadAllSketches && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={downloadingAllSketches}
                      onClick={handleDownloadAllSketches}
                      title={
                        downloadingAllSketches
                          ? 'Preparing download…'
                          : 'Download all sketches as a zip'
                      }
                    >
                      {downloadingAllSketches ? (
                        <>
                          <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Downloading…
                        </>
                      ) : (
                        <>
                          <Archive className="w-3.5 h-3.5 mr-1.5" />
                          Download all sketches
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {phase !== PHASE.PROMPT && (
                  <Button variant="ghost" size="sm" className="restart-btn" onClick={() => { setPhase(PHASE.PROMPT); setPromptCollapsed(false); }}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Start Over
                  </Button>
                )}
              </div>

              <div className="storyboard-grid">
                {frames.map((frame) => (
                  <SceneScriptCard
                    key={frame.id}
                    frame={frame}
                    onView={openLightbox}
                    onDownloadSketch={
                      phase === PHASE.SKETCHES
                        ? handleDownloadSketchForFrame
                        : undefined
                    }
                    onUploadSketch={
                      showPerSceneSketchUpload ? handleUploadSceneSketch : undefined
                    }
                    showSketchUpload={showPerSceneSketchUpload}
                    sketchUploadDisabled={generatingSketches}
                    onRegenerate={setRegenerateFrame}
                    onToggleLock={toggleLock}
                    workflowPhase={phase}
                    generatingSketches={generatingSketches}
                    generatingImages={generatingImages}
                  />
                ))}
              </div>

              <div className="storyboard-global-actions">
                {phase === PHASE.IMAGES && (
                  <Button className="proceed-video-btn" onClick={onProceedToVideo}>
                    Proceed to Video
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Back / navigation */}
          <div className="cv-step-back-row">
            <Button variant="ghost" size="sm" className="cv-back-btn" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
          </div>
        </>
      )}

      <StoryboardImageLightbox
        open={Boolean(lightbox)}
        onOpenChange={(open) => !open && setLightbox(null)}
        frame={lightbox?.frame ?? null}
        projectId={projectId}
        initialTab={lightbox?.initialTab ?? 'final'}
        feedbackList={feedbackList}
        onRegenerate={(frame) => {
          setLightbox(null);
          setRegenerateFrame(frame);
        }}
        onUploadSketch={
          showPerSceneSketchUpload ? handleUploadSceneSketch : undefined
        }
        showSketchUpload={showPerSceneSketchUpload}
        sketchUploadDisabled={generatingSketches}
        showSketchDownloads={phase === PHASE.SKETCHES}
      />

      {/* Regenerate Scene Modal */}
      <Dialog open={!!regenerateFrame} onOpenChange={() => { setRegenerateFrame(null); setRegeneratePrompt(''); }}>
        <DialogContent className="bg-background border-border max-w-md rounded-xl">
          <div className="space-y-4">
            <div>
              <DialogTitle className="text-base font-semibold text-foreground mb-1">Regenerate Scene</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">Enter a new prompt for Scene {regenerateFrame?.sequenceOrder}</DialogDescription>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</label>
              <Textarea
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                placeholder="Describe what you'd like for this scene..."
                className="bg-background border-border text-foreground resize-none rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
                rows={4}
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-3">
              <Button variant="ghost" onClick={() => { setRegenerateFrame(null); setRegeneratePrompt(''); }} className="text-muted-foreground hover:text-foreground hover:bg-accent h-9">Cancel</Button>
              <Button
                onClick={() => {
                  if (regeneratePrompt.trim() && regenerateFrame?.id) {
                    regenerateMutation.mutate(
                      { sceneId: regenerateFrame.id, prompt: regeneratePrompt },
                      { onSuccess: () => { setRegenerateFrame(null); setRegeneratePrompt(''); } }
                    );
                  }
                }}
                disabled={!regeneratePrompt.trim() || regenerateMutation.isPending}
                className="btn-gradient-primary h-9"
              >
                {regenerateMutation.isPending ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Regenerating...</> : <><RotateCw className="w-4 h-4 mr-2" />Redo</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
