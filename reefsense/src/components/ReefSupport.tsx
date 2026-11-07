import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ExternalLink, HeartHandshake } from "lucide-react";
import { getReefSupport } from "@/api/client";
import { useReefResource } from "@/hooks/useReefResource";
import { hasSupport, languageNote, reachLabel } from "@/lib/support";
import { cn } from "@/lib/utils";

const DISCLAIMER =
  "Independent organisations working on reef conservation in this region. Blue Sentinel does not receive or handle donations, and funds may not go to this specific site.";

/**
 * "Support reef conservation": a compact disclosure under the reef title listing curated
 * organisations near the reef (GET /api/reefs/{id}/support). An inline list rather than a floating
 * popover, so it works the same in the side rail, the tablet layout and the mobile bottom sheet.
 * Renders nothing while loading, on error, or when there is no organisation to show.
 */
export default function ReefSupport({ reefId }: { reefId: string }) {
  const { data, status } = useReefResource(reefId, getReefSupport);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (status !== "ready" || !hasSupport(data)) return null;

  // Escape closes the list only: stopping propagation keeps the page's own Escape handler
  // (which closes the whole reef panel) from running.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="mt-3" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-coral/50 hover:text-coral-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <HeartHandshake className="h-3.5 w-3.5 text-coral" aria-hidden="true" />
        Support reef conservation
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          role="region"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="mt-3 rounded-md border border-border bg-background/60 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:animate-fade-in"
        >
          <p id={titleId} className="text-[11px] font-medium uppercase tracking-wide text-brand">
            Community reef conservation
          </p>
          <ul className="mt-2 divide-y divide-border">
            {data.organisations.map((org) => {
              const note = languageNote(org.language);
              return (
                <li key={org.id} className="py-2.5 first:pt-0 last:pb-0">
                  <a
                    href={org.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-start gap-1 rounded text-sm font-medium leading-snug text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {org.name}
                    <ExternalLink
                      className="mt-1 h-3 w-3 shrink-0 text-muted-foreground group-hover:text-brand"
                      aria-hidden="true"
                    />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  <p className="mt-0.5 text-[11px] text-muted-strong">
                    {reachLabel(org)}
                    {note ? ` · ${note}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{org.description}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            {DISCLAIMER}
          </p>
        </div>
      )}
    </div>
  );
}
