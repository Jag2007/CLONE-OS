import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Video,
  FileText,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import VideoNameStep from "./components/VideoNameStep";
import ScriptStep from "./components/ScriptStep";
import GenerationStep from "./components/GenerationStep";
import { useStoryboardStore } from "../../store/storyboard.store";
import { useGetProjectById } from "../../services/project.service";
import { PageTransition } from "../../motion/PageTransition";
import { StaggerItemIndexed } from "../../motion/Stagger";

const STEPS = [
  { id: "setup", label: "Setup", icon: Video },
  { id: "script", label: "Script & Storyboard", icon: FileText },
  { id: "generate", label: "Generate Video", icon: Sparkles },
];

function deriveStepFromProject(project) {
  if (!project?.scenes?.length) return 1;
  // If video is rendering or done, go to the generation step
  if (project.status === "processing" || project.status === "completed") return 2;
  // If scenes have final images, go to generation step
  const hasFinalImages = project.scenes.some((s) => s.finalImageUrl);
  if (hasFinalImages) return 2;
  return 1;
}

export default function CreateVideoPage() {
  const { projectId: urlProjectId } = useParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [videoName, setVideoName] = useState("");
  const [isRegenMode, setIsRegenMode] = useState(false);
  const { clearFrames } = useStoryboardStore();

  const location = useLocation();
  const navigate = useNavigate();

  const effectiveProjectId = urlProjectId || null;
  const {
    data: project,
    isLoading: isLoadingProject,
    isError: isProjectError,
  } = useGetProjectById(effectiveProjectId);

  useEffect(() => {
    const s = location.state;
    if (s?.isRegenerate && s?.projectId) setIsRegenMode(true);
  }, [location.state]);

  useEffect(() => {
    if (!effectiveProjectId) {
      setCurrentStep(0);
      return;
    }
    if (isProjectError) {
      navigate("/create-video", { replace: true });
      return;
    }
    if (!project) return;
    setVideoName(project.projectName ?? "");
    setCurrentStep(deriveStepFromProject(project));
  }, [effectiveProjectId, project, isProjectError, navigate]);

  const handleProjectCreated = (id, actor, name) => {
    navigate(`/create-video/${id}`, { state: location.state });
  };

  const handleStartNew = () => {
    if (isRegenMode) {
      navigate("/videos");
      return;
    }
    clearFrames();
    navigate("/create-video", { replace: true });
  };

  const handleScriptBack = () => {
    if (isRegenMode) {
      navigate("/videos");
    } else {
      navigate("/create-video");
    }
  };

  const loadingStep0 = Boolean(
    effectiveProjectId && isLoadingProject && currentStep === 0,
  );

  return (
    <div className="cv-page">
      <div className="cv-stepper">
        {STEPS.map((step, idx) => {
          const isCompleted = isRegenMode
            ? idx <= 0 || idx < currentStep
            : idx < currentStep;
          const isCurrent = idx === currentStep;
          const Icon = step.icon;
          return (
            <StaggerItemIndexed
              key={step.id}
              index={idx}
              className="flex items-center"
            >
              <div
                className={`cv-stepper-item ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""}`}
              >
                <div className="cv-stepper-circle">
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span className="cv-stepper-label">{step.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`cv-stepper-line ${isCompleted ? "completed" : ""}`}
                />
              )}
            </StaggerItemIndexed>
          );
        })}
      </div>

      {isRegenMode && videoName && (
        <div className="cv-regen-banner">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>
            Regenerating: <strong>{videoName}</strong> — edit the prompt below
            and re-generate.
          </span>
        </div>
      )}

      <div className="cv-page-content">
        <AnimatePresence mode="wait">
          {loadingStep0 ? (
            <PageTransition key="cv-loading">
              <div className="cv-step-container flex items-center justify-center min-h-[200px]">
                <p className="text-muted-foreground">Loading project...</p>
              </div>
            </PageTransition>
          ) : currentStep === 0 ? (
            <PageTransition key="cv-step-0">
              <VideoNameStep onCreated={handleProjectCreated} />
            </PageTransition>
          ) : currentStep === 1 ? (
            <PageTransition key="cv-step-1">
              <ScriptStep
                projectId={effectiveProjectId}
                onBack={handleScriptBack}
                onProceedToVideo={() => setCurrentStep(2)}
                regenParam={new URLSearchParams(location.search).get("regen")}
              />
            </PageTransition>
          ) : (
            <PageTransition key="cv-step-2">
              <GenerationStep
                projectId={effectiveProjectId}
                onBack={() => setCurrentStep(1)}
                onStartNew={handleStartNew}
                startNewLabel={isRegenMode ? "Back to Videos" : undefined}
              />
            </PageTransition>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
