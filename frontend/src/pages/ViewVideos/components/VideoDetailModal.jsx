import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Play,
  Film,
  User,
  Calendar,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Loader,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS = {
  completed: "bg-emerald-600/80 text-white",
  done: "bg-emerald-600/80 text-white",
  processing: "bg-blue-600/80 text-white",
  storyboarding: "bg-blue-600/80 text-white",
  casting: "bg-blue-600/80 text-white",
  draft: "bg-secondary text-secondary-foreground",
};

const SCENE_STATUS_COLORS = {
  lora_processed: "bg-emerald-600/80 text-white",
  LORA_PROCESSED: "bg-emerald-600/80 text-white",
  sketched: "bg-blue-600/80 text-white",
  SKETCHED: "bg-blue-600/80 text-white",
  pending: "bg-amber-600/80 text-white",
  PENDING: "bg-amber-600/80 text-white",
};

function derivePhaseLabel(project) {
  const scenes = project?.scenes || [];
  if (!scenes.length) return "Setup";
  const allHaveFinal = scenes.every((s) => s.finalImageUrl);
  if (allHaveFinal) return "Images ready";
  const anySketches = scenes.some((s) => s.sketchUrl);
  if (anySketches) return "Sketches";
  return "Scripting";
}

export default function VideoDetailModal({
  projectId,
  project,
  actor,
  open,
  onClose,
}) {
  const navigate = useNavigate();

  if (!project) return null;

  const scenes = (project.scenes || []).sort(
    (a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0),
  );
  const statusColor =
    STATUS_COLORS[project.status] || "bg-secondary text-secondary-foreground";
  const isActive = ["processing", "storyboarding", "casting"].includes(
    project.status,
  );
  const createdDate = project.createdAt
    ? format(new Date(project.createdAt), "MMMM d, yyyy")
    : null;
  const phaseLabel = derivePhaseLabel(project);

  const handleRegenerate = () => {
    onClose();
    navigate(`/create-video/${projectId}?regen=script`, {
      state: {
        isRegenerate: true,
        projectId,
        projectName: project.projectName,
        actorId: project.actorId,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="vv-modal">
        {/* Header */}
        <div className="vv-modal-header">
          <div className="vv-modal-header-left">
            <DialogTitle className="vv-modal-title">
              {project.projectName || "Untitled Video"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Video details, scenes, actor, and regeneration actions.
            </DialogDescription>
            <Badge className={`vv-modal-status ${statusColor}`}>
              {isActive ? (
                <Loader className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              <span className="capitalize">{project.status}</span>
            </Badge>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="vv-modal-body">
          {/* ── Video player ── */}
          <section className="vv-modal-section">
            <h3 className="vv-modal-section-title">
              <Film className="w-4 h-4" />
              Generated Video
            </h3>
            {project.storageUrl ? (
              <div className="vv-modal-video-wrap">
                <video controls className="vv-modal-video">
                  <source src={project.storageUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : (
              <div className="vv-modal-video-placeholder">
                <Play className="w-10 h-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">
                  {isActive
                    ? "Video is being generated…"
                    : "No video generated yet"}
                </p>
              </div>
            )}
          </section>

          {/* ── Meta details ── */}
          <section className="vv-modal-section">
            <h3 className="vv-modal-section-title">
              <FileText className="w-4 h-4" />
              Details
            </h3>
            <div className="vv-modal-details-grid">
              {actor && (
                <div className="vv-modal-detail-item">
                  <span className="vv-modal-detail-label">Actor</span>
                  <div className="vv-modal-actor-row">
                    {actor.avatarUrl || actor.imageUrl ? (
                      <img
                        src={actor.avatarUrl || actor.imageUrl}
                        alt={actor.name}
                        className="vv-modal-actor-img"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="vv-modal-actor-placeholder">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <span className="vv-modal-detail-value">{actor.name}</span>
                  </div>
                </div>
              )}
              {createdDate && (
                <div className="vv-modal-detail-item">
                  <span className="vv-modal-detail-label">Created</span>
                  <span className="vv-modal-detail-value">
                    <Calendar className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
                    {createdDate}
                  </span>
                </div>
              )}
              <div className="vv-modal-detail-item">
                <span className="vv-modal-detail-label">Scenes</span>
                <span className="vv-modal-detail-value">{scenes.length}</span>
              </div>
              <div className="vv-modal-detail-item">
                <span className="vv-modal-detail-label">Phase</span>
                <span className="vv-modal-detail-value">{phaseLabel}</span>
              </div>
            </div>
          </section>

          {/* ── Original prompt / script ── */}
          {project.scriptText && (
            <section className="vv-modal-section">
              <h3 className="vv-modal-section-title">
                <FileText className="w-4 h-4" />
                Original Prompt / Script
              </h3>
              <p className="vv-modal-script-text">{project.scriptText}</p>
            </section>
          )}

          {/* ── Scenes breakdown ── */}
          {scenes.length > 0 && (
            <section className="vv-modal-section">
              <h3 className="vv-modal-section-title">
                <ImageIcon className="w-4 h-4" />
                Scenes ({scenes.length})
              </h3>
              <div className="vv-modal-scenes-list">
                {scenes.map((scene) => {
                  const sceneStatusColor =
                    SCENE_STATUS_COLORS[scene.status] ||
                    "bg-secondary text-secondary-foreground";
                  return (
                    <div key={scene.id} className="vv-modal-scene-card">
                      {/* Scene header */}
                      <div className="vv-modal-scene-header">
                        <div className="flex items-center gap-2">
                          <span className="vv-modal-scene-num">
                            Scene {scene.sequenceOrder}
                          </span>
                          {scene.status && (
                            <span
                              className={`vv-modal-scene-status ${sceneStatusColor}`}
                            >
                              {scene.status === 'completed' ||
                              scene.status === 'lora_processed' ||
                              scene.status === 'LORA_PROCESSED' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                scene.status.replace("_", " ").toLowerCase()
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Scene body: text + images */}
                      <div className="vv-modal-scene-body">
                        {/* Text info */}
                        <div className="vv-modal-scene-text-col">
                          {scene.scriptText && (
                            <div className="vv-modal-scene-field">
                              <p className="vv-modal-scene-field-label">
                                Script
                              </p>
                              <p className="vv-modal-scene-field-value">
                                {scene.scriptText}
                              </p>
                            </div>
                          )}
                          {scene.aiPrompt && (
                            <div className="vv-modal-scene-field">
                              <p className="vv-modal-scene-field-label">
                                AI Prompt
                              </p>
                              <p className="vv-modal-scene-field-value vv-modal-scene-field-muted">
                                {scene.aiPrompt}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Images — show both final and sketch */}
                        {(scene.finalImageUrl || scene.sketchUrl) && (
                          <div className="vv-modal-scene-images">
                            {scene.finalImageUrl && (
                              <div className="vv-modal-scene-img-block">
                                <span className="vv-modal-scene-img-label final">
                                  Final
                                </span>
                                <img
                                  src={scene.finalImageUrl}
                                  alt={`Scene ${scene.sequenceOrder} final`}
                                  className="vv-modal-scene-img"
                                />
                              </div>
                            )}
                            {scene.sketchUrl && (
                              <div className="vv-modal-scene-img-block">
                                <span className="vv-modal-scene-img-label sketch">
                                  Sketch
                                </span>
                                <img
                                  src={scene.sketchUrl}
                                  alt={`Scene ${scene.sequenceOrder} sketch`}
                                  className="vv-modal-scene-img"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Regenerate action ── */}
          {projectId && (
            <section className="vv-modal-section">
              <div className="vv-modal-regen-banner">
                <div className="vv-modal-regen-banner-text">
                  <p className="vv-modal-regen-banner-title">
                    Want a different result?
                  </p>
                  <p className="vv-modal-regen-banner-desc">
                    Edit the prompt and regenerate this video from scratch.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="vv-modal-regen-btn"
                  onClick={handleRegenerate}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate Video
                </Button>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
