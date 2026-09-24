import React, { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Skeleton } from "../../../components/ui/skeleton";
import { Check, User, ArrowRight, Loader, Crown, Sparkles } from "lucide-react";
import { useGetAllActors } from "../../../services/actor.service";
import { useCreateProject } from "../../../services/project.service";
import { useUser } from "../../../store/auth.store";
import { useToast } from "../../../hooks/use-toast";

export default function VideoNameStep({ onCreated }) {
  const user = useUser();
  const { toast } = useToast();
  const [videoName, setVideoName] = useState("");
  const [selectedActorId, setSelectedActorId] = useState(null);
  const { data: actors = [], isLoading: loadingActors } = useGetAllActors();
  const { mutateAsync: createProject, isPending: creating } =
    useCreateProject();

  const isUserPro = user?.plan === "pro" || user?.role === "admin";

  React.useEffect(() => {
    if (actors && actors.length > 0 && !selectedActorId) {
      // Default to Reina (Free) or first accessible actor
      const reina = actors.find((a) => a.name.toLowerCase() === "reina");
      const defaultActor = reina || actors.find((a) => !a.isPro) || actors[0];
      if (defaultActor) {
        setSelectedActorId(defaultActor.id);
      }
    }
  }, [actors, selectedActorId]);

  const handleActorClick = (actor) => {
    const isProActor = actor.isPro || actor.name.toLowerCase() === "tarina";
    if (isProActor && !isUserPro) {
      toast({
        title: "Pro Actor Locked",
        description: `${actor.name} requires a Pro Plan subscription. Click to upgrade with Razorpay!`,
        variant: "destructive",
      });
      window.dispatchEvent(
        new CustomEvent("openBuyCredits", { detail: { tab: "pro" } })
      );
      return;
    }
    setSelectedActorId(actor.id);
  };

  const handleNext = async () => {
    if (!videoName.trim()) {
      toast({
        title: "Name required",
        description: "Enter a name for your video.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedActorId) {
      toast({
        title: "Select an actor",
        description: "Pick an actor before continuing.",
        variant: "destructive",
      });
      return;
    }

    const selectedActor = actors.find((a) => a.id === selectedActorId);
    const isProActor = selectedActor?.isPro || selectedActor?.name?.toLowerCase() === "tarina";
    if (isProActor && !isUserPro) {
      toast({
        title: "Pro Plan Required",
        description: `${selectedActor?.name || "Tarina"} is locked for Free plan users. Please upgrade to Pro.`,
        variant: "destructive",
      });
      window.dispatchEvent(
        new CustomEvent("openBuyCredits", { detail: { tab: "pro" } })
      );
      return;
    }

    try {
      const result = await createProject({
        projectName: videoName.trim(),
        actorId: selectedActorId,
      });
      const projectId = result?.data?.id;
      if (!projectId) throw new Error("No project ID returned");
      onCreated(projectId, selectedActorId, videoName.trim());
    } catch (err) {
      toast({
        title: "Failed to start",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="cv-step-container">
      <div className="cv-step-header">
        <h2 className="cv-step-title">New Video</h2>
        <p className="cv-step-desc">
          Name your video and pick the actor who will appear in it. Free AI influencers like <strong>Reina</strong> are unlocked!
        </p>
      </div>

      <div className="cv-step-body">
        {/* Video name */}
        <div className="cv-field">
          <Label htmlFor="video-name" className="cv-label">
            Video name
          </Label>
          <Input
            id="video-name"
            placeholder="e.g. Product Launch Promo"
            value={videoName}
            onChange={(e) => setVideoName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNext()}
            className="cv-input"
            autoFocus
          />
        </div>

        {/* Actor selection */}
        <div className="cv-field">
          <div className="flex items-center justify-between mb-2">
            <Label className="cv-label mb-0">Choose actor</Label>
            {!isUserPro && (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("openBuyCredits", { detail: { tab: "pro" } })
                  )
                }
                className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <Crown className="w-3.5 h-3.5" />
                Unlock Tarina & Pro Actors
              </button>
            )}
          </div>

          {loadingActors ? (
            <div className="cv-actors-grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="cv-actor-skeleton">
                  <Skeleton className="w-full aspect-square rounded-xl" />
                  <Skeleton className="h-3 w-3/4 mx-auto mt-2 rounded" />
                </div>
              ))}
            </div>
          ) : actors.length === 0 ? (
            <div className="cv-empty-actors">
              <User className="w-8 h-8 text-muted-foreground mb-2" />
              <p>No actors available</p>
            </div>
          ) : (
            <div className="cv-actors-grid">
              {actors.map((actor) => {
                const imgSrc =
                  actor.avatarUrl || actor.imageUrl || actor.avatar_url || "";
                const isSelected = selectedActorId === actor.id;
                const isProActor = actor.isPro || actor.name.toLowerCase() === "tarina";
                const isLocked = isProActor && !isUserPro;

                return (
                  <button
                    key={actor.id}
                    type="button"
                    onClick={() => handleActorClick(actor)}
                    className={`cv-actor-card transition-all relative overflow-hidden ${
                      isSelected ? "selected ring-2 ring-primary" : ""
                    } ${isLocked ? "border-amber-500/40 bg-amber-500/5" : ""}`}
                  >
                    <div className="cv-actor-img-wrap relative">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={actor.name}
                          className="cv-actor-img"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <User className="w-8 h-8 text-muted-foreground" />
                      )}
                      
                      {isProActor ? (
                        <span className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500 text-black shadow flex items-center gap-0.5 uppercase">
                          <Crown className="w-2.5 h-2.5" /> PRO
                        </span>
                      ) : (
                        <span className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-black shadow flex items-center gap-0.5 uppercase">
                          FREE
                        </span>
                      )}

                      {isSelected && (
                        <div className="cv-actor-selected-overlay">
                          <div className="cv-actor-check">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="cv-actor-name font-semibold text-xs mt-2 flex items-center justify-center gap-1">
                      {actor.name}
                    </p>
                    <p className="cv-actor-cost text-[11px] text-muted-foreground">
                      {actor.costPerVideo === 0 ? "Free" : `${actor.costPerVideo} cr`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="cv-step-actions">
          <Button
            onClick={handleNext}
            disabled={creating || !videoName.trim() || !selectedActorId}
            className="cv-next-btn"
          >
            {creating ? (
              <>
                <Loader className="w-4 h-4 animate-spin mr-2" />
                Setting up...
              </>
            ) : (
              <>
                Continue to Script
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
