import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Progress } from "../../components/ui/progress";
import { useToast } from "../../hooks/use-toast";
import {
  reserveCreditsForClone,
  startTraining,
  getTrainingStatus,
  getMyClone,
  isTrainingServiceConfigured,
} from "../../services/training.service";
import { useAuthStore } from "../../store/auth.store";
import { Loader2, Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import { PageTransition } from "../../motion/PageTransition";
import { StaggerItemIndexed } from "../../motion/Stagger";

const EMOTIONS = [
  { value: "happy", label: "Happy" },
  { value: "sad", label: "Sad" },
  { value: "neutral", label: "Neutral" },
  { value: "angry", label: "Angry" },
];

const TASK_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MIN_IMAGES = 1;
const MAX_IMAGES = 20;
const POLL_INTERVAL_MS = 4.5 * 60 * 1000; // 4.5 minutes

export default function CreateClonePage() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [taskId, setTaskId] = useState("");
  const [taskIdError, setTaskIdError] = useState("");
  const [emotion, setEmotion] = useState("");
  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [trainingId, setTrainingId] = useState(null);
  const [trainingS3Url, setTrainingS3Url] = useState(null);
  const [pollingId, setPollingId] = useState(null);
  const [existingClone, setExistingClone] = useState(null);
  const [loadingClone, setLoadingClone] = useState(true);

  // Map Replicate status strings → UI labels
  const toUiStatus = (raw) =>
    ({
      starting: "Queued",
      processing: "Running",
      succeeded: "Completed",
      failed: "Failed",
      canceled: "Failed",
    })[raw] ??
    raw ??
    "Unknown";

  const configured = isTrainingServiceConfigured();
  const token = useAuthStore((state) => state.token);

  const pollStatus = useCallback(
    (replicateTrainingId) => {
      const id = setInterval(async () => {
        try {
          const data = await getTrainingStatus(replicateTrainingId);
          const uiStatus = toUiStatus(data?.status);
          setTrainingStatus(uiStatus);
          if (uiStatus === "Completed") {
            if (data?.s3_url) {
              setTrainingS3Url(data.s3_url);
            }
            getMyClone().then((c) => c && setExistingClone(c));
          }
          if (uiStatus === "Completed" || uiStatus === "Failed") {
            clearInterval(id);
            setPollingId(null);
            if (uiStatus === "Failed") {
              const detail =
                data?.error ||
                data?.message ||
                "Training failed. Please try again or contact support.";
              toast({
                title: "Training failed",
                description: detail,
                variant: "destructive",
              });
            }
          }
        } catch (err) {
          clearInterval(id);
          setPollingId(null);
          toast({
            title: "Status check failed",
            description:
              err?.response?.data?.detail ||
              err?.message ||
              "Could not fetch training status.",
            variant: "destructive",
          });
        }
      }, POLL_INTERVAL_MS);
      setPollingId(id);
      return () => clearInterval(id);
    },
    [toast],
  ); // toUiStatus is stable (defined in render scope but pure)

  useEffect(() => {
    return () => {
      if (pollingId) clearInterval(pollingId);
    };
  }, [pollingId]);

  // Fetch current user's clone on load; sync status from Replicate once, then show step 5 and poll if still in progress
  const isTrainingInProgress = (c) =>
    c?.current_training_id &&
    (c?.training_status === "starting" || c?.training_status === "processing");

  useEffect(() => {
    if (!configured) {
      setLoadingClone(false);
      return;
    }
    if (!token) return;
    getMyClone()
      .then(async (data) => {
        setExistingClone(data ?? null);
        if (data?.model_name) setTaskId(data.model_name);
        if (!data?.current_training_id) return;
        // Sync status from Replicate on first load (backend updates DB if there's a mismatch)
        try {
          const statusData = await getTrainingStatus(data.current_training_id);
          const uiStatus = toUiStatus(statusData?.status);
          setTrainingId(data.current_training_id);
          setTrainingStatus(uiStatus);
          setStep(5);
          if (uiStatus === "Completed") {
            if (statusData?.s3_url) setTrainingS3Url(statusData.s3_url);
            const updated = await getMyClone();
            if (updated) setExistingClone(updated);
          } else if (uiStatus === "Failed") {
            const detail =
              statusData?.error ||
              statusData?.message ||
              "Training failed. Please try again or contact support.";
            toast({
              title: "Training failed",
              description: detail,
              variant: "destructive",
            });
          } else {
            pollStatus(data.current_training_id);
          }
        } catch (err) {
          // If status check fails, still show DB state and start polling
          setTrainingId(data.current_training_id);
          setTrainingStatus(toUiStatus(data.training_status));
          setStep(5);
          if (isTrainingInProgress(data)) pollStatus(data.current_training_id);
        }
      })
      .catch((err) => {
        if (err?.response?.status !== 401) {
          setExistingClone(null);
        }
      })
      .finally(() => setLoadingClone(false));
  }, [configured, token]);

  const validateTaskId = () => {
    const trimmed = (taskId || "").trim();
    if (!trimmed) {
      setTaskIdError("Enter a task or clone name.");
      return false;
    }
    if (!TASK_ID_REGEX.test(trimmed)) {
      setTaskIdError("Use only letters, numbers, hyphens, and underscores.");
      return false;
    }
    setTaskIdError("");
    return true;
  };

  const validateFiles = () => {
    if (!files || files.length < MIN_IMAGES) {
      setFilesError(`Add at least ${MIN_IMAGES} image.`);
      return false;
    }
    if (files.length > MAX_IMAGES) {
      setFilesError(`Maximum ${MAX_IMAGES} images.`);
      return false;
    }
    setFilesError("");
    return true;
  };

  const handleNextFromStep1 = () => {
    if (!validateTaskId()) return;
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    if (!emotion) {
      toast({
        title: "Select emotion",
        description: "Choose an emotion for your clone.",
        variant: "destructive",
      });
      return;
    }
    setStep(3);
  };

  const handleNextFromStep3 = () => {
    if (!validateFiles()) return;
    setStep(4);
  };

  const handleStartTraining = async () => {
    if (!configured) {
      toast({
        title: "Service not configured",
        description: "REACT_APP_TRAINING_API_URL is not set.",
        variant: "destructive",
      });
      return;
    }
    const trimmedTaskId = taskId.trim();
    if (!trimmedTaskId || !emotion || !files.length) return;
    setIsSubmitting(true);
    try {
      // Deduct credits via CloneOS backend first; 402 = insufficient credits
      const creditData = await reserveCreditsForClone();
      if (creditData?.creditsBalance != null) {
        useAuthStore.getState().updateCredits(creditData.creditsBalance);
      }
    } catch (err) {
      if (err?.response?.status === 402) {
        setIsSubmitting(false);
        const message =
          err?.response?.data?.error ||
          "You need more credits to start clone training. Buy credits to continue.";
        toast({
          title: "Insufficient credits",
          description: message,
          variant: "destructive",
        });
        window.dispatchEvent(new CustomEvent("openBuyCredits"));
        return;
      }
      setIsSubmitting(false);
      toast({
        title: "Could not start clone",
        description:
          err?.response?.data?.error || err?.message || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await startTraining(trimmedTaskId, emotion, files);
      const replicateTrainingId = result?.training_id;
      if (!replicateTrainingId)
        throw new Error("No training_id returned from server.");
      setTrainingId(replicateTrainingId);
      setTrainingS3Url(null);
      setStep(5);
      setTrainingStatus("Queued");
      toast({
        title: "Training started",
        description: "Your clone is being trained.",
      });
      pollStatus(replicateTrainingId);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ??
        err?.message ??
        "Could not start training. Please check your images and try again.";
      const isAlreadyHaveClone =
        err?.response?.status === 400 &&
        typeof detail === "string" &&
        detail.includes("already have a clone");
      const trainingAlreadyInProgress = err?.response?.status === 409;
      if (isAlreadyHaveClone || trainingAlreadyInProgress) {
        getMyClone().then((data) => {
          setExistingClone(data ?? null);
          if (data?.model_name) setTaskId(data.model_name);
          if (data && trainingAlreadyInProgress && data.current_training_id) {
            setStep(5);
            setTrainingId(data.current_training_id);
            setTrainingStatus(toUiStatus(data.training_status ?? "starting"));
            pollStatus(data.current_training_id);
          }
        });
      }
      toast({
        title: "Failed to start training",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => f.type.startsWith("image/"));
    if (valid.length !== selected.length) {
      toast({
        title: "Invalid files",
        description: "Only image files are accepted.",
        variant: "destructive",
      });
    }
    setFiles((prev) => {
      const next = [...prev, ...valid].slice(0, MAX_IMAGES);
      return next;
    });
    setFilesError("");
    e.target.value = "";
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFilesError("");
  };

  if (!configured) {
    return (
      <div className="clone-page">
        <div className="clone-page-header">
          <h1 className="clone-page-title">Make Clone</h1>
          <p className="clone-page-subtitle">
            Train a custom AI model on your images.
          </p>
        </div>
        <Card className="border-border bg-card/80 max-w-lg">
          <CardHeader>
            <CardTitle className="text-foreground">
              Training service not configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Set{" "}
              <code className="bg-muted px-1 rounded">
                REACT_APP_TRAINING_API_URL
              </code>{" "}
              in your environment to use this feature.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingClone) {
    return (
      <div className="clone-page">
        <div className="clone-page-header">
          <h1 className="clone-page-title">Make Clone</h1>
          <p className="clone-page-subtitle">
            Train a custom AI model on your images in a few simple steps.
          </p>
        </div>
        <motion.div
          className="flex flex-col items-center justify-center gap-4 py-12"
          animate={{ opacity: [0.72, 1, 0.72] }}
          transition={{ duration: 1.85, repeat: Infinity, ease: "easeInOut" }}
        >
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your clone…</p>
        </motion.div>
      </div>
    );
  }

  const stepLabels = [
    "Name your clone",
    "Select emotion",
    "Upload images",
    "Review & start",
    "Training status",
  ];

  return (
    <div className="clone-page">
      <div className="clone-page-header">
        <h1 className="clone-page-title">Make Clone</h1>
        <p className="clone-page-subtitle">
          Train a custom AI model on your images in a few simple steps.
        </p>
      </div>
      <div className="create-clone-two-col">
        {/* Left: Form */}
        <div className="create-clone-form-col">
          <div className="space-y-6">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((s, i) => (
                <StaggerItemIndexed
                  key={s}
                  index={i}
                  className="flex-1 min-w-0"
                >
                  <div
                    className={`h-1.5 w-full rounded-full transition-colors ${
                      s <= step ? "bg-primary" : "bg-muted"
                    }`}
                  />
                </StaggerItemIndexed>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <PageTransition key="clone-step-1">
                  <Card className="border-border bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        {existingClone ? "Your clone" : "Name your clone"}
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        {existingClone
                          ? "You can retrain this clone with new images below."
                          : "Choose a unique ID (e.g. my-clone-1). Use letters, numbers, hyphens, and underscores only."}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="task_id" className="text-foreground">
                          Task / clone ID
                        </Label>
                        {existingClone ? (
                          <div className="mt-1.5 rounded-md bg-muted border border-border px-3 py-2 text-foreground font-medium">
                            {taskId || existingClone.model_name}
                          </div>
                        ) : (
                          <Input
                            id="task_id"
                            value={taskId}
                            onChange={(e) => {
                              setTaskId(e.target.value);
                              setTaskIdError("");
                            }}
                            placeholder="my-clone-1"
                            className="mt-1.5 bg-muted border-border text-foreground hover:border-muted-foreground/40 focus:ring-ring/30 transition-colors"
                          />
                        )}
                        {taskIdError && (
                          <p className="text-red-400 text-sm mt-1">
                            {taskIdError}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={
                          existingClone ? () => setStep(2) : handleNextFromStep1
                        }
                        className="hover:bg-primary transition-colors"
                      >
                        Next
                      </Button>
                    </CardContent>
                  </Card>
                </PageTransition>
              )}

              {step === 2 && (
                <PageTransition key="clone-step-2">
                  <Card className="border-border bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        Select emotion
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Pick the primary emotion for this clone.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-foreground">Emotion</Label>
                        <Select value={emotion} onValueChange={setEmotion}>
                          <SelectTrigger className="mt-1.5 bg-muted border-border text-foreground hover:border-primary/50 hover:bg-muted/80 focus:ring-ring/30 transition-all duration-200 cursor-pointer">
                            <SelectValue placeholder="Choose emotion" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            {EMOTIONS.map((e) => (
                              <SelectItem
                                key={e.value}
                                value={e.value}
                                className="text-foreground focus:bg-primary/20 focus:text-foreground cursor-pointer rounded-md py-2.5 hover:bg-primary/15 hover:text-foreground transition-colors outline-none"
                              >
                                {e.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setStep(1)}
                          className="hover:bg-muted transition-colors"
                        >
                          Back
                        </Button>
                        <Button
                          onClick={handleNextFromStep2}
                          className="hover:bg-primary transition-colors"
                        >
                          Next
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </PageTransition>
              )}

              {step === 3 && (
                <PageTransition key="clone-step-3">
                  <Card className="border-border bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        Upload images
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Add between {MIN_IMAGES} and {MAX_IMAGES} images. Only
                        image files are accepted.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-foreground">Images</Label>
                        <div className="mt-1.5 flex flex-col gap-2">
                          <label className="flex items-center justify-center gap-2 h-24 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/50 cursor-pointer hover:border-primary/40 hover:bg-muted transition-colors">
                            <Upload className="w-5 h-5 text-muted-foreground" />
                            <span className="text-muted-foreground text-sm">
                              Click to add images
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={handleFileChange}
                            />
                          </label>
                          {files.length > 0 && (
                            <ul className="space-y-1.5">
                              {files.map((file, i) => (
                                <li
                                  key={`${file.name}-${i}`}
                                  className="flex items-center justify-between text-sm text-foreground bg-muted rounded px-3 py-2 hover:bg-muted/80 transition-colors"
                                >
                                  <span className="truncate">{file.name}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 hover:bg-red-500/20 hover:text-red-400"
                                    onClick={() => removeFile(i)}
                                    aria-label="Remove"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {filesError && (
                          <p className="text-red-400 text-sm mt-1">
                            {filesError}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setStep(2)}
                          className="hover:bg-muted transition-colors"
                        >
                          Back
                        </Button>
                        <Button
                          onClick={handleNextFromStep3}
                          className="hover:bg-primary transition-colors"
                        >
                          Next
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </PageTransition>
              )}

              {step === 4 && (
                <PageTransition key="clone-step-4">
                  <Card className="border-border bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        Review and start
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Confirm details and start training.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <dl className="grid grid-cols-1 gap-2 text-sm">
                        <div>
                          <dt className="text-muted-foreground">Clone ID</dt>
                          <dd className="text-foreground font-medium">
                            {taskId.trim()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Emotion</dt>
                          <dd className="text-foreground font-medium capitalize">
                            {emotion}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Images</dt>
                          <dd className="text-foreground font-medium">
                            {files.length} file(s)
                          </dd>
                        </div>
                      </dl>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setStep(3)}
                          className="hover:bg-muted transition-colors"
                        >
                          Back
                        </Button>
                        <Button
                          onClick={handleStartTraining}
                          disabled={isSubmitting}
                          className="hover:bg-primary transition-colors"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />{" "}
                              Starting…
                            </>
                          ) : (
                            "Start training"
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </PageTransition>
              )}

              {step === 5 && (
                <PageTransition key="clone-step-5">
                  <Card className="border-border bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-foreground">
                        Training status
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Task ID:{" "}
                        <strong className="text-foreground">
                          {taskId.trim()}
                        </strong>
                        . Status is checked every 4–5 minutes.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {trainingStatus === "Queued" ||
                      trainingStatus === "Running" ? (
                        <>
                          <div className="flex items-center gap-2 text-foreground">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>{trainingStatus}</span>
                          </div>
                          <Progress
                            value={trainingStatus === "Running" ? 60 : 20}
                            className="h-2"
                          />
                        </>
                      ) : trainingStatus === "Completed" ? (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <CheckCircle className="w-12 h-12 text-green-500" />
                          <p className="text-foreground font-medium">
                            Training completed
                          </p>
                          <p className="text-muted-foreground text-sm">
                            Your clone is ready
                            {trainingS3Url
                              ? " and model weights are stored safely."
                              : "."}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Button
                              onClick={() => {
                                setStep(1);
                                setEmotion("");
                                setFiles([]);
                                setTrainingStatus(null);
                                setTrainingId(null);
                                setTaskId(
                                  existingClone?.model_name ?? taskId.trim(),
                                );
                                getMyClone().then((data) =>
                                  setExistingClone(data ?? null),
                                );
                              }}
                              className="hover:bg-primary transition-colors"
                            >
                              Retrain again
                            </Button>
                            <Button asChild variant="outline">
                              <Link to="/create-video">Create a Video</Link>
                            </Button>
                          </div>
                        </div>
                      ) : trainingStatus === "Failed" ? (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <AlertCircle className="w-12 h-12 text-red-400" />
                          <p className="text-foreground font-medium">
                            Training failed
                          </p>
                          <p className="text-muted-foreground text-sm">
                            Something went wrong. Please try again.
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Button
                              onClick={() => setStep(4)}
                              className="hover:bg-primary transition-colors"
                            >
                              Try again
                            </Button>
                            <Button asChild variant="outline">
                              <Link to="/create-video">Create a Video</Link>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Checking status (every 4–5 min)…</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </PageTransition>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Pleasing UI */}
        <div className="create-clone-right-col">
          <div className="create-clone-right-inner">
            {existingClone && (
              <Card className="border-border bg-card/80 mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-foreground text-base">
                    Your model
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <p className="text-foreground">
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <strong>{existingClone.model_name}</strong>
                  </p>
                  {existingClone.s3_url ? (
                    <p className="text-muted-foreground">
                      <span className="text-muted-foreground">Weights:</span>{" "}
                      <a
                        href={existingClone.s3_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate block"
                      >
                        Stored (view)
                      </a>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Weights: pending or retraining
                    </p>
                  )}
                  {existingClone.created_at && (
                    <p className="text-muted-foreground text-xs">
                      Created{" "}
                      {new Date(existingClone.created_at).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            <div className="create-clone-step-list">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">
                Steps
              </p>
              {stepLabels.map((label, i) => (
                <div
                  key={i}
                  className={`create-clone-step-item ${step === i + 1 ? "active" : ""} ${step > i + 1 ? "done" : ""}`}
                >
                  <span className="create-clone-step-num">
                    {step > i + 1 ? "✓" : i + 1}
                  </span>
                  <span className="create-clone-step-label">{label}</span>
                </div>
              ))}
            </div>
            <div className="create-clone-tip">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                Tip
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {step === 1 &&
                  "Use a short, memorable ID so you can find this clone later."}
                {step === 2 &&
                  "The emotion you choose will guide how the model expresses in generated content."}
                {step === 3 &&
                  "Upload clear, front-facing photos for best results. Avoid heavy filters."}
                {step === 4 &&
                  "Training runs in the background. You can leave and come back; we’ll check status every 4–5 minutes."}
                {step === 5 &&
                  "When training completes, your clone will be ready to use in the dashboard."}
              </p>
            </div>
            <div className="create-clone-visual">
              <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-primary/20 to-chart-3/20 border border-primary/30 flex items-center justify-center">
                <span className="text-4xl text-primary/80">
                  {step >= 1 && step <= 4 ? step : "✓"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
