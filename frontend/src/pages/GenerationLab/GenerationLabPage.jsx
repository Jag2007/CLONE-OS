import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileImage,
  History,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Upload,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import {
  useCreateGenerationLabJob,
  useGenerationLabJobs,
  useUploadGenerationLabImage,
} from "../../services/generationLab.service";

const modes = [
  { id: "i2v", label: "Image to Video", icon: Video },
  { id: "t2v", label: "Text to Video", icon: WandSparkles },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "history", label: "History", icon: History },
];

const videoModels = ["happyhorse-1.0-i2v", "happyhorse-1.0-t2v", "happyhorse-1.0-r2v"];
const imageModels = ["wan2.7-image-pro", "qwen-image-2.0-pro", "z-image-turbo"];
const activeStatuses = ["PENDING", "RUNNING"];

const getResultUrl = (job) => job?.storageUrl || job?.resultUrl;
const isVideoMode = (mode) => mode === "i2v" || mode === "t2v";

function statusTone(status) {
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED") return "failed";
  if (activeStatuses.includes(status)) return "running";
  return "neutral";
}

function compactDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ResultPreview({ job }) {
  const resultUrl = getResultUrl(job);
  const mode = job?.mode;

  if (!resultUrl) {
    return (
      <div className="generation-lab-empty-preview">
        {activeStatuses.includes(job?.status) ? (
          <Loader2 className="w-8 h-8 animate-spin" />
        ) : (
          <Play className="w-8 h-8" />
        )}
      </div>
    );
  }

  if (isVideoMode(mode)) {
    return (
      <video
        className="generation-lab-result-media"
        src={resultUrl}
        controls
        playsInline
      />
    );
  }

  return (
    <img
      className="generation-lab-result-media"
      src={resultUrl}
      alt="Generated result"
    />
  );
}

function JobCard({ job }) {
  const resultUrl = getResultUrl(job);
  const tone = statusTone(job.status);

  return (
    <article className="generation-lab-job-card">
      <div className="generation-lab-job-top">
        <span className={`generation-lab-status ${tone}`}>
          {job.status === "SUCCEEDED" ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : job.status === "FAILED" ? (
            <AlertCircle className="w-3.5 h-3.5" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          )}
          {job.status}
        </span>
        <span className="generation-lab-job-mode">{job.mode?.toUpperCase()}</span>
      </div>

      <div className="generation-lab-result-frame">
        <ResultPreview job={job} />
      </div>

      <div className="generation-lab-job-copy">
        <p>{job.prompt}</p>
        <span>{job.model}</span>
      </div>

      {job.error ? <div className="generation-lab-error">{job.error}</div> : null}

      <div className="generation-lab-job-footer">
        <span>
          <Clock3 className="w-3.5 h-3.5" />
          {compactDate(job.createdAt)}
        </span>
        {resultUrl ? (
          <a className="generation-lab-download" href={resultUrl} download>
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function GenerationLabPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState("i2v");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [referenceImageUrls, setReferenceImageUrls] = useState([]);
  const [model, setModel] = useState("happyhorse-1.0-i2v");
  const [resolution, setResolution] = useState("720P");
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [size, setSize] = useState("1280*720");
  const [count, setCount] = useState(1);

  const jobsQuery = useGenerationLabJobs();
  const createJob = useCreateGenerationLabJob({
    onSuccess: (job) => {
      toast({
        title: activeStatuses.includes(job.status) ? "Generation queued" : "Generation ready",
        description: "The job is now visible in history.",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation failed",
        description: error.response?.data?.error || error.message,
        variant: "destructive",
      });
    },
  });
  const uploadImage = useUploadGenerationLabImage({
    onSuccess: (data) => {
      setImageUrl(data.url);
      toast({ title: "Image uploaded", description: "Input image is ready." });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.response?.data?.error || error.message,
        variant: "destructive",
      });
    },
  });

  const jobs = jobsQuery.data || [];
  const currentMode = mode === "history" ? "history" : mode;
  const visibleJobs = useMemo(() => {
    if (currentMode === "history") return jobs;
    return jobs.filter((job) => job.mode === currentMode);
  }, [currentMode, jobs]);
  const latestActive = jobs.find((job) => activeStatuses.includes(job.status));
  const models = currentMode === "image" ? imageModels : videoModels;
  const showUpload = currentMode === "i2v" || currentMode === "image";

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    if (nextMode === "image") setModel("wan2.7-image-pro");
    if (nextMode === "i2v") setModel("happyhorse-1.0-i2v");
    if (nextMode === "t2v") setModel("happyhorse-1.0-t2v");
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (file) uploadImage.mutate(file);
    event.target.value = "";
  };

  const addReferenceUrl = () => {
    const next = referenceInput.trim();
    if (!next) return;
    setReferenceImageUrls((items) => [...items, next]);
    setReferenceInput("");
  };

  const submit = (event) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      toast({ title: "Prompt needed", description: "Add a prompt before generating." });
      return;
    }
    if (currentMode === "i2v" && !imageUrl.trim()) {
      toast({ title: "Input image needed", description: "Upload or paste an image URL first." });
      return;
    }

    createJob.mutate({
      mode: currentMode,
      prompt: cleanPrompt,
      imageUrl: imageUrl.trim() || undefined,
      referenceImageUrls,
      model,
      resolution,
      ratio,
      duration: Number(duration),
      size,
      count: Number(count),
    });
  };

  return (
    <div className="generation-lab-page">
      <div className="generation-lab-header">
        <div>
          <p className="generation-lab-eyebrow">Internal</p>
          <h1>Generation Lab</h1>
          <p>Test Alan video and image jobs with saved history.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="generation-lab-refresh"
          onClick={() => jobsQuery.refetch()}
          disabled={jobsQuery.isFetching}
        >
          <RefreshCw className={jobsQuery.isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
          Refresh
        </Button>
      </div>

      <div className="generation-lab-tabs" role="tablist" aria-label="Generation modes">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`generation-lab-tab${mode === id ? " active" : ""}`}
            onClick={() => handleModeChange(id)}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {mode !== "history" ? (
        <form className="generation-lab-form" onSubmit={submit}>
          <div className="generation-lab-panel">
            <label className="generation-lab-field generation-lab-field-wide">
              <span>Prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the shot or commercial you want to generate..."
                className="generation-lab-textarea"
                rows={5}
              />
            </label>

            {showUpload ? (
              <div className="generation-lab-upload-row">
                <label className="generation-lab-upload">
                  <input type="file" accept="image/*" onChange={handleFile} />
                  {uploadImage.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                  <span>{uploadImage.isPending ? "Uploading..." : "Upload input image"}</span>
                </label>
                <label className="generation-lab-field">
                  <span>Image URL</span>
                  <input
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="https://..."
                    className="generation-lab-input"
                  />
                </label>
              </div>
            ) : null}

            {currentMode === "t2v" && model === "happyhorse-1.0-r2v" ? (
              <div className="generation-lab-reference-box">
                <label className="generation-lab-field">
                  <span>Reference image URLs</span>
                  <div className="generation-lab-inline-control">
                    <input
                      value={referenceInput}
                      onChange={(event) => setReferenceInput(event.target.value)}
                      placeholder="https://..."
                      className="generation-lab-input"
                    />
                    <Button type="button" variant="outline" onClick={addReferenceUrl}>
                      Add
                    </Button>
                  </div>
                </label>
                {referenceImageUrls.length ? (
                  <div className="generation-lab-chips">
                    {referenceImageUrls.map((url, index) => (
                      <span key={`${url}-${index}`} className="generation-lab-chip">
                        <FileImage className="w-3.5 h-3.5" />
                        Reference {index + 1}
                        <button
                          type="button"
                          onClick={() =>
                            setReferenceImageUrls((items) => items.filter((_, i) => i !== index))
                          }
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="generation-lab-controls">
              <label className="generation-lab-field">
                <span>Model</span>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="generation-lab-input"
                >
                  {models.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              {isVideoMode(currentMode) ? (
                <>
                  <label className="generation-lab-field">
                    <span>Resolution</span>
                    <select
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                      className="generation-lab-input"
                    >
                      <option value="720P">720P</option>
                      <option value="1080P">1080P</option>
                    </select>
                  </label>
                  <label className="generation-lab-field">
                    <span>Ratio</span>
                    <select
                      value={ratio}
                      onChange={(event) => setRatio(event.target.value)}
                      className="generation-lab-input"
                    >
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                      <option value="1:1">1:1</option>
                    </select>
                  </label>
                  <label className="generation-lab-field">
                    <span>Duration</span>
                    <select
                      value={duration}
                      onChange={(event) => setDuration(Number(event.target.value))}
                      className="generation-lab-input"
                    >
                      <option value={5}>5 sec</option>
                      <option value={10}>10 sec</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="generation-lab-field">
                    <span>Size</span>
                    <select
                      value={size}
                      onChange={(event) => setSize(event.target.value)}
                      className="generation-lab-input"
                    >
                      <option value="1280*720">1280 x 720</option>
                      <option value="720*1280">720 x 1280</option>
                      <option value="1024*1024">1024 x 1024</option>
                    </select>
                  </label>
                  <label className="generation-lab-field">
                    <span>Count</span>
                    <select
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                      className="generation-lab-input"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            <Button type="submit" className="generation-lab-submit" disabled={createJob.isPending}>
              {createJob.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <WandSparkles className="w-4 h-4" />
              )}
              Generate
            </Button>
          </div>

          {latestActive ? (
            <div className="generation-lab-active-strip">
              <Loader2 className="w-4 h-4 animate-spin" />
              Latest job is still running. History refreshes automatically.
            </div>
          ) : null}
        </form>
      ) : null}

      <section className="generation-lab-history">
        <div className="generation-lab-section-title">
          <h2>{mode === "history" ? "History" : "Recent Jobs"}</h2>
          <span>{visibleJobs.length} jobs</span>
        </div>

        {jobsQuery.isLoading ? (
          <div className="generation-lab-loading">
            <Loader2 className="w-6 h-6 animate-spin" />
            Loading history...
          </div>
        ) : visibleJobs.length ? (
          <div className="generation-lab-jobs-grid">
            {visibleJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <div className="generation-lab-empty-state">
            <WandSparkles className="w-8 h-8" />
            No jobs yet.
          </div>
        )}
      </section>
    </div>
  );
}
