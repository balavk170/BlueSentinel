import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { useScrolledPast } from "@/hooks/useScroll";
import { cn } from "@/lib/utils";

interface NavbarProps {
  active: string;
  onNavigate: (id: string) => void;
}

const NAV_ITEMS = [
  { id: "explore", label: "Explore" },
  { id: "restore", label: "Restore" },
  { id: "insights", label: "Insights" },
  { id: "about", label: "About" },
];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function StatusIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-white/80 px-2.5 py-1 shadow-soft sm:px-3">
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-70 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
      </span>
      <span className="whitespace-nowrap text-[11px] font-medium text-foreground sm:text-xs">
        Focus: Indonesia
      </span>
    </div>
  );
}

/** Where the sliding highlight sits: the active link's box inside the link row. */
function useIndicator(active: string) {
  const items = useRef<Record<string, HTMLButtonElement | null>>({});
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const measure = useCallback(() => {
    const el = items.current[active];
    setBox(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [active]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    // Link widths change once the web font arrives.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return { items, box };
}

export default function Navbar({ active, onNavigate }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const scrolled = useScrolledPast(24);
  // At the top of the page the bar floats, chrome-less, inside the photo frame.
  const floating = !scrolled && !open;
  const { items, box } = useIndicator(active);
  const go = (id: string) => {
    onNavigate(id);
    setOpen(false);
  };

  // Escape, or a tap outside the bar, closes the mobile menu.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-2 pt-2 sm:px-3 sm:pt-3">
      <div
        ref={barRef}
        className={cn(
          "pointer-events-auto mx-auto max-w-[1240px] border transition-[margin,padding,background-color,border-color,box-shadow,border-radius] duration-500 ease-out",
          floating
            ? "mt-2 rounded-[22px] border-transparent bg-transparent px-4 sm:mt-3 sm:px-8"
            : "mt-0 rounded-2xl border-border/80 bg-white px-3 shadow-[0_16px_40px_-24px_rgba(10,37,64,0.35)] sm:px-5",
        )}
      >
        <div className="relative flex h-16 items-center justify-between gap-3">
          <button
            onClick={() => go("top")}
            className={cn("flex items-center gap-2.5 rounded-md motion-safe:animate-drop-in", FOCUS_RING)}
            style={{ animationDelay: "350ms" }}
            aria-label="Blue Sentinel home"
          >
            <img
              src="/logo-mark.png"
              alt="Blue Sentinel"
              width={297}
              height={184}
              className="h-7 w-auto shrink-0"
              decoding="async"
            />
            <span
              className="font-display text-[19px] font-medium tracking-tight text-foreground max-[359px]:hidden"
            >
              Blue Sentinel
            </span>
          </button>

          <nav
            className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex"
            aria-label="Primary"
          >
            <div
              className={cn(
                "relative flex items-center gap-1 rounded-full border p-1 transition-[background-color,border-color,box-shadow] duration-500",
                floating ? "border-border/80 bg-white/90 shadow-soft" : "border-transparent",
              )}
            >
              {box && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-1 rounded-full border transition-[left,width,background-color,border-color] duration-500 ease-out",
                    "border-border bg-secondary",
                  )}
                  style={{ left: box.left, width: box.width }}
                />
              )}
              {NAV_ITEMS.map((item, i) => (
                <button
                  key={item.id}
                  ref={(el) => {
                    items.current[item.id] = el;
                  }}
                  onClick={() => go(item.id)}
                  aria-current={active === item.id ? "true" : undefined}
                  className={cn(
                    "relative rounded-full px-4 py-1.5 text-sm transition-colors duration-300 motion-safe:animate-drop-in",
                    FOCUS_RING,
                    active === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={{ animationDelay: `${450 + i * 70}ms` }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <div
            className="flex items-center gap-2 motion-safe:animate-drop-in sm:gap-3"
            style={{ animationDelay: "700ms" }}
          >
            <StatusIndicator />
            <button
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "rounded-full p-2 md:hidden",
                "text-foreground hover:bg-secondary",
                FOCUS_RING,
              )}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <nav
            id="mobile-nav"
            className="border-t border-border pb-2 pt-1 animate-slide-up md:hidden"
            aria-label="Mobile"
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                aria-current={active === item.id ? "true" : undefined}
                className={cn(
                  "block w-full rounded-xl px-3 py-3 text-left text-[15px] hover:bg-secondary",
                  FOCUS_RING,
                  active === item.id ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
