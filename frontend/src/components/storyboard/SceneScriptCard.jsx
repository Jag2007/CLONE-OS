import React, { useRef, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { ImageIcon, Eye, RotateCw, Lock, Unlock, Loader, CheckCircle2, AlertCircle, Download, Upload } from 'lucide-react';

function statusPillClasses(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'lora_processed') {
    return 'bg-[var(--success)]/20 text-[var(--success)] border-[var(--success)]/35';
  }
  if (s === 'processing' || s === 'sketched') {
    return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  }
  if (s === 'pending') {
    return 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30';
  }
  return 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]';
}

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusPillClasses(status)}`}
    >
      {s === 'completed' || s === 'lora_processed' ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : s === 'processing' || s === 'sketched' ? (
        <Loader className="h-3 w-3 shrink-0 animate-spin" />
      ) : s === 'pending' ? (
        <AlertCircle className="h-3 w-3 shrink-0" />
      ) : null}
      <span className="max-w-[7rem] truncate capitalize">{status || '—'}</span>
    </span>
  );
}

function visualHintText(workflowPhase, generatingSketches, generatingImages) {
  if (generatingSketches) return 'Generating sketches…';
  if (generatingImages) return 'Generating images…';
  switch (workflowPhase) {
    case 'scenes':
      return null;
    case 'sketches':
      return 'Sketch pending for this scene.';
    case 'images':
      return 'Final image pending.';
    default:
      return null;
  }
}

/**
 * Storyboard scene card: script-first when no sketch/final URL; image strip only when available.
 */
export default function SceneScriptCard({
  frame,
  onView,
  onDownloadSketch,
  onUploadSketch,
  showSketchUpload = false,
  /** Disable upload while global generation runs (not during a sketch upload). */
  sketchUploadDisabled = false,
  onRegenerate,
  onToggleLock,
  workflowPhase,
  generatingSketches = false,
  generatingImages = false,
}) {
  const sketchFileInputRef = useRef(null);
  const [sketchDownloadLoading, setSketchDownloadLoading] = useState(false);
  const [sketchUploadLoading, setSketchUploadLoading] = useState(false);
  const hasVisual = Boolean(frame.finalImageUrl || frame.sketchUrl);
  const hint =
    !hasVisual && workflowPhase
      ? visualHintText(workflowPhase, generatingSketches, generatingImages)
      : null;

  return (
    <Card className="storyboard-card group overflow-hidden border-l-[3px] border-l-[var(--accent)] border-t-[var(--border-default)]">
      <CardContent className="storyboard-content">
        {hasVisual && (
          <div className="frame-preview">
            {frame.finalImageUrl ? (
              <img src={frame.finalImageUrl} alt={frame.scene || `Scene ${frame.sequenceOrder}`} />
            ) : (
              <img src={frame.sketchUrl} alt={frame.scene || `Scene ${frame.sequenceOrder}`} />
            )}
            {frame.finalImageUrl && frame.sketchUrl && (
              <div className="frame-final-badge">
                <ImageIcon className="h-3 w-3" />
                Final
              </div>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h4 className="m-0 text-sm font-semibold text-[var(--text-primary)]">
                Scene {frame.sequenceOrder}
              </h4>
              <StatusPill status={frame.status} />
            </div>
            <p className="m-0 line-clamp-4 break-words text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
              {frame.scriptText}
            </p>
            {hint && (
              <p className="mt-2 m-0 text-[11px] font-medium text-[var(--accent)]">{hint}</p>
            )}
          </div>
        </div>

        <div className="frame-actions mt-3">
          <Button
            size="sm"
            variant="ghost"
            className="frame-action-btn"
            onClick={() =>
              onView(frame, {
                tab: frame.finalImageUrl ? 'final' : 'sketch',
              })
            }
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            View
          </Button>
          {showSketchUpload && typeof onUploadSketch === 'function' && (
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
                size="sm"
                variant="ghost"
                className="frame-action-btn"
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
                  <Loader className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-3.5 w-3.5" />
                )}
                {sketchUploadLoading ? 'Uploading…' : 'Upload'}
              </Button>
            </>
          )}
          {frame.sketchUrl && typeof onDownloadSketch === 'function' && (
            <Button
              size="sm"
              variant="ghost"
              className="frame-action-btn"
              disabled={sketchDownloadLoading}
              onClick={async () => {
                if (sketchDownloadLoading) return;
                setSketchDownloadLoading(true);
                try {
                  await onDownloadSketch(frame);
                } finally {
                  setSketchDownloadLoading(false);
                }
              }}
              title={sketchDownloadLoading ? 'Downloading…' : 'Download sketch'}
            >
              {sketchDownloadLoading ? (
                <Loader className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              {sketchDownloadLoading ? 'Downloading…' : 'Sketch'}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="frame-action-btn" onClick={() => onRegenerate(frame)}>
            <RotateCw className="mr-1 h-3.5 w-3.5" />
            Redo
          </Button>
          <Button size="sm" variant="ghost" className="frame-action-btn" onClick={() => onToggleLock(frame.id)}>
            {frame.isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
