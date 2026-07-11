import React, { useMemo, useState } from "react";
import { Film, Search, SlidersHorizontal, Play } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  useGetAllProjects,
  useGetProjectById,
} from "../../services/project.service";
import { useGetAllActors } from "../../services/actor.service";
import { useUser } from "../../store/auth.store";
import VideoCard from "./components/VideoCard";
import VideoDetailModal from "./components/VideoDetailModal";
import { StaggerItemIndexed } from "../../motion/Stagger";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "In Progress" },
  { value: "draft", label: "Draft" },
];

function ProjectDetailLoader({ projectId, actor, open, onClose }) {
  const { data: fullProject } = useGetProjectById(projectId);
  return (
    <VideoDetailModal
      projectId={projectId}
      project={fullProject}
      actor={actor}
      open={open}
      onClose={onClose}
    />
  );
}

export default function ViewVideosPage() {
  const user = useUser();
  const { data: projects = [], isLoading } = useGetAllProjects();
  const { data: actors = [] } = useGetAllActors();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const actorById = useMemo(() => {
    const map = {};
    (actors || []).forEach((a) => {
      if (a?.id) map[a.id] = a;
    });
    return map;
  }, [actors]);

  const userProjects = useMemo(() => {
    const list = Array.isArray(projects) ? projects : [];
    const userId = user?.id ?? user?._id ?? user?.userId;
    return userId ? list.filter((p) => p?.userId === userId) : list;
  }, [projects, user]);

  const filteredProjects = useMemo(() => {
    return userProjects.filter((p) => {
      const matchesSearch =
        !search ||
        (p.projectName || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "completed" &&
          (p.status === "completed" || p.status === "done")) ||
        (statusFilter === "processing" &&
          ["processing", "storyboarding", "casting"].includes(p.status)) ||
        (statusFilter === "draft" && p.status === "draft");
      return matchesSearch && matchesStatus;
    });
  }, [userProjects, search, statusFilter]);

  const selectedActor = selectedProjectId
    ? actorById[userProjects.find((p) => p.id === selectedProjectId)?.actorId]
    : null;

  return (
    <div className="vv-page">
      {/* Page header */}
      <div className="vv-page-header">
        <div>
          <h1 className="vv-page-title">Your Videos</h1>
          <p className="vv-page-subtitle">
            {userProjects.length > 0
              ? `${userProjects.length} video${userProjects.length !== 1 ? "s" : ""} in total`
              : "Videos you create will appear here"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="vv-filters">
        <div className="vv-search-wrap">
          <Search className="vv-search-icon" />
          <Input
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="vv-search-input"
          />
        </div>
        <div className="vv-status-filters">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`vv-filter-btn${statusFilter === f.value ? " active" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="vv-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="vv-card-skeleton">
              <Skeleton className="vv-card-skeleton-thumb" />
              <div className="p-3.5 space-y-2">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
                <Skeleton className="h-3 w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="vv-empty">
          <div className="vv-empty-icon">
            <Film className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="vv-empty-title">
            {userProjects.length === 0
              ? "No videos yet"
              : "No videos match your filters"}
          </h3>
          <p className="vv-empty-desc">
            {userProjects.length === 0
              ? "Head over to Create Video to make your first video."
              : "Try adjusting your search or filter."}
          </p>
        </div>
      ) : (
        <div className="vv-grid">
          {filteredProjects.map((project, i) => (
            <StaggerItemIndexed key={project.id} index={i}>
              <VideoCard
                project={project}
                actor={actorById[project.actorId]}
                onClick={() => setSelectedProjectId(project.id)}
              />
            </StaggerItemIndexed>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedProjectId && (
        <ProjectDetailLoader
          projectId={selectedProjectId}
          actor={selectedActor}
          open={!!selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
        />
      )}
    </div>
  );
}
