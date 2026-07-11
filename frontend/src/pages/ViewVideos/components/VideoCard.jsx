import React from "react";
import { motion } from "motion/react";
import {
  Play,
  Clock,
  CheckCircle2,
  Loader,
  FileText,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { springSnappy } from "../../../motion/springs";

const MotionCard = motion.button;

const STATUS_CONFIG = {
  completed: {
    label: "Completed",
    color: "vv-status-completed",
    icon: CheckCircle2,
  },
  done: {
    label: "Completed",
    color: "vv-status-completed",
    icon: CheckCircle2,
  },
  processing: {
    label: "Processing",
    color: "vv-status-processing",
    icon: Loader,
  },
  storyboarding: {
    label: "Storyboarding",
    color: "vv-status-processing",
    icon: Loader,
  },
  casting: { label: "Casting", color: "vv-status-processing", icon: Loader },
  draft: { label: "Draft", color: "vv-status-draft", icon: FileText },
};

function derivePhaseLabel(project) {
  const scenes = project?.scenes || [];
  if (!scenes.length) return null;
  const allHaveFinal = scenes.every((s) => s.finalImageUrl);
  if (allHaveFinal) return "Images";
  const anySketches = scenes.some((s) => s.sketchUrl);
  if (anySketches) return "Sketches";
  return "Scripting";
}

export default function VideoCard({ project, actor, onClick }) {
  const status = STATUS_CONFIG[project?.status] || {
    label: project?.status || "Unknown",
    color: "vv-status-draft",
    icon: AlertCircle,
  };
  const StatusIcon = status.icon;
  const phaseLabel = derivePhaseLabel(project);

  const thumbnailSrc =
    project?.scenes?.find((s) => s.finalImageUrl)?.finalImageUrl ||
    project?.scenes?.find((s) => s.sketchUrl)?.sketchUrl ||
    actor?.avatarUrl ||
    actor?.imageUrl ||
    "";

  const createdDate = project?.createdAt
    ? format(new Date(project.createdAt), "MMM d, yyyy")
    : null;

  const sceneCount = project?.scenes?.length ?? 0;
  const hasVideo = !!project?.storageUrl;

  return (
    <MotionCard
      type="button"
      className="vv-card"
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={springSnappy}
    >
      {/* Thumbnail */}
      <div className="vv-card-thumb">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={project?.projectName}
            className="vv-card-thumb-img"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="vv-card-thumb-placeholder">
            <Play className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
        {hasVideo && (
          <div className="vv-card-play-badge">
            <Play className="w-3 h-3 fill-white text-white" />
          </div>
        )}
        <div className={`vv-card-status-badge ${status.color}`}>
          <StatusIcon
            className={`w-3 h-3 ${status.label === "Processing" || status.label === "Storyboarding" || status.label === "Casting" ? "animate-spin" : ""}`}
          />
          {status.label}
        </div>
      </div>

      {/* Info */}
      <div className="vv-card-info">
        <h3 className="vv-card-title">
          {project?.projectName || "Untitled Video"}
        </h3>
        {actor?.name && (
          <div className="vv-card-actor">
            {(actor.avatarUrl || actor.imageUrl) && (
              <img
                src={actor.avatarUrl || actor.imageUrl}
                alt={actor.name}
                className="vv-card-actor-img"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <span>{actor.name}</span>
          </div>
        )}
        <div className="vv-card-meta">
          {sceneCount > 0 && (
            <span className="vv-card-meta-item">
              <FileText className="w-3 h-3" />
              {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
            </span>
          )}
          {phaseLabel && (
            <span className="vv-card-meta-item text-muted-foreground">
              {phaseLabel}
            </span>
          )}
          {createdDate && (
            <span className="vv-card-meta-item">
              <Clock className="w-3 h-3" />
              {createdDate}
            </span>
          )}
        </div>
      </div>
    </MotionCard>
  );
}
