import { useState, type Ref } from "react";
import { AlertCircle, Check, FlaskConical, MessageCircle, Share2, X } from "lucide-react";
import EnvironmentalMetrics from "@/components/EnvironmentalMetrics";
import FeatureContributions from "@/components/FeatureContributions";
import HeatScenario from "@/components/HeatScenario";
import HeatTimeline from "@/components/HeatTimeline";
import NoaaGapNote from "@/components/NoaaGapNote";
import PlainSummary from "@/components/PlainSummary";
import ReefImagery from "@/components/ReefImagery";
import ReefInsight from "@/components/ReefInsight";
import ReefNews from "@/components/ReefNews";
import ReefSupport from "@/components/ReefSupport";
import ResilienceScore from "@/components/ResilienceScore";
import SurveyHistory from "@/components/SurveyHistory";
import { Button } from "@/components/ui/button";
import type { DetailStatus } from "@/hooks/useReefDetail";
import { cn } from "@/lib/utils";
import type { Reef, ReefExplanation, ReefPhoto } from "@/types/reef";

interface ReefAnalysisPanelProps {
  reef: Reef;
  explanation: ReefExplanation | null;
  status: DetailStatus;
  error: string | null;
  photos: ReefPhoto[];
  photosStatus: DetailStatus;
  /** Reef the photos belong to; photos for another reef are treated as still loading. */
  photosReefId?: string | null;
  onRetry: () => void;
  /** Reloads the community photos after an error. */
  onPhotosRetry: () => void;
  onClose: () => void;
  /** "wide" lays the panel out in two columns (tablet, below the map). */
  layout?: "stacked" | "wide";
  /** Id applied to the reef name heading, for aria-labelledby. */
  headingId?: string;
  closeButtonRef?: Ref<HTMLButtonElement>;
}

type PanelView = "plain" | "expert";
const VIEW_KEY = "reefsense.panelView";

/** The remembered view, or "expert". Storage can be unavailable (private windows), so every access is guarded. */
function readView(): PanelView {
  try {
    return localStorage.getItem(VIEW_KEY) === "plain" ? "plain" : "expert";
  } catch {
    return "expert";
  }
}

function writeView(view: PanelView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // not remembered; the switch still works for this visit
  }
}

function ViewSwitch({ view, onChange }: { view: PanelView; onChange: (view: PanelView) => void }) {
  return (
    <div
      role="group"
      aria-label="Explanation style"
      className="relative grid grid-cols-2 rounded-full border border-border bg-background/70 p-1"
    >
      {/* The thumb slides between the two options. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-[0_6px_16px_-8px_rgba(14,94,140,0.6)] transition-transform duration-500 ease-out"
        style={{ transform: view === "expert" ? "translateX(100%)" : "none" }}
      />
      {(["plain", "expert"] as const).map((v) => {
        const Icon = v === "plain" ? MessageCircle : FlaskConical;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={view === v}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === v ? "text-primary-foreground" : "text-muted-strong hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {v === "plain" ? "Plain language" : "Expert"}
          </button>
        );
      })}
    </div>
  );
}

/** Shares a link that opens straight to this reef: the system share sheet on phones, else the clipboard. */
function ShareButton({ reef }: { reef: Reef }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("reef", reef.id);
    const link = url.toString();
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${reef.name} on Blue Sentinel`, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share sheet dismissed, or clipboard blocked: nothing to undo.
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={share}
      aria-label={copied ? "Link copied" : `Share a link to ${reef.name}`}
      title={copied ? "Link copied" : "Share this reef"}
      className="relative shrink-0 rounded-full text-muted-strong hover:text-foreground"
    >
      {copied ? <Check className="h-4 w-4 text-brand" /> : <Share2 className="h-4 w-4" />}
      <span role="status" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </Button>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-border" />;
}

/** Quiet placeholder bars while the explanation is loading. */
function ExplanationSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="h-3 w-24 rounded bg-muted motion-safe:animate-pulse" />
      <div className="h-4 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-2 w-full rounded-full bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-border p-4">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm text-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
          Try again
        </Button>
      </div>
    </div>
  );
}

/**
 * Detailed analysis for one reef: headline probability, environmental
 * predictors, the model explanation, a plain-language insight and reef imagery.
 * Purely presentational; data loading lives in `useReefDetail` and `useReefPhotos`.
 */
export default function ReefAnalysisPanel({
  reef,
  explanation,
  status,
  error,
  photos,
  photosStatus,
  photosReefId,
  onRetry,
  onPhotosRetry,
  onClose,
  layout = "stacked",
  headingId,
  closeButtonRef,
}: ReefAnalysisPanelProps) {
  const wide = layout === "wide";
  const [view, setView] = useState<PanelView>(readView);
  const plain = view === "plain";
  const changeView = (next: PanelView) => {
    setView(next);
    writeView(next);
  };
  const ready = explanation !== null && explanation.reefId === reef.id;
  const ownPhotos = photosReefId === undefined || photosReefId === reef.id;

  return (
    <article key={reef.id} className="animate-slide-up px-6 pb-8" aria-labelledby={headingId}>
      {/* Sticky top bar: the explanation style is always one tap away. */}
      <div
        className={cn(
          "sticky z-20 -mx-6 flex items-center gap-2 border-b border-border bg-card px-6 py-3",
          wide ? "top-[84px]" : "top-0",
        )}
      >
        <div className="flex-1">
          <ViewSwitch view={view} onChange={changeView} />
        </div>
        <ShareButton reef={reef} />
        <Button
          ref={closeButtonRef}
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close reef analysis"
          className="shrink-0 rounded-full text-muted-strong hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <header className="pt-5">
        <h2 id={headingId} className="font-display text-2xl font-medium leading-tight text-foreground">
          {reef.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{reef.region}</p>
        <ReefSupport reefId={reef.id} />
      </header>

      <div className={cn("mt-6", wide && "md:grid md:grid-cols-2 md:gap-10")}>
        <div>
          <ResilienceScore probability={reef.resilienceProbability} category={reef.category} />
          {plain ? (
            <div className="mt-4">
              <PlainSummary reef={reef} />
            </div>
          ) : (
            <>
              {reef.noaaGap && (
                <div className="mt-4">
                  <NoaaGapNote reef={reef} />
                </div>
              )}
              <Divider />
              <div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">Environmental predictors</h3>
                <EnvironmentalMetrics metrics={reef.metrics} />
              </div>
            </>
          )}
          {reef.metrics.dhwMax12w != null && (
            <>
              <Divider />
              <HeatTimeline reefId={reef.id} />
              <Divider />
              <HeatScenario
                key={reef.id}
                latitude={reef.latitude}
                longitude={reef.longitude}
                initialDhw={reef.metrics.dhwMax12w}
                sstAnomaly={reef.metrics.sstAnomaly}
                currentProbability={reef.resilienceProbability}
              />
            </>
          )}
        </div>

        <div className={cn(wide && "md:border-l md:border-border md:pl-10")}>
          <div className={cn(wide && "md:hidden")}>
            <Divider />
          </div>
          {plain ? (
            <>
              <SurveyHistory reefId={reef.id} />
              <Divider />
              <ReefNews reefId={reef.id} />
            </>
          ) : status === "error" && error ? (
            <DetailError message={error} onRetry={onRetry} />
          ) : ready ? (
            <>
              <FeatureContributions
                contributions={explanation.contributions}
                category={explanation.category}
              />
              <Divider />
              <ReefInsight reef={reef} explanation={explanation} />
              <Divider />
              <SurveyHistory reefId={reef.id} />
              <Divider />
              <ReefNews reefId={reef.id} />
            </>
          ) : (
            <>
              <span className="sr-only" role="status">
                Loading model explanation…
              </span>
              <ExplanationSkeleton />
            </>
          )}
        </div>
      </div>

      <Divider />
      <ReefImagery
        reef={reef}
        photos={ownPhotos ? photos : []}
        status={ownPhotos ? photosStatus : "loading"}
        onRetry={onPhotosRetry}
      />
    </article>
  );
}
