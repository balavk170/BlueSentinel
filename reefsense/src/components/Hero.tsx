import { Fragment, useRef } from "react";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Bubbles, FishSchool, LiveLayer, SunRays } from "@/components/SeaLife";
import { useScrollProgress } from "@/hooks/useScroll";

interface HeroProps {
  onExplore: () => void;
  /** Share of recorded bleaching events where heat reached NOAA's alert level (4 DHW); null while loading. */
  alertRecall: number | null;
  /** Dive surveys behind that figure. */
  surveys: number | null;
  reefCount: number | null;
}

// Spec copy, kept whole; the second clause is set in the italic serif.
const HEADLINE = "Most coral bleaching starts before the alarm sounds.";
const [HEADLINE_LEAD, HEADLINE_TAIL] = (() => {
  const i = HEADLINE.indexOf(" before ");
  return [HEADLINE.slice(0, i), HEADLINE.slice(i + 1)];
})();

/** "about 1 in 4" for a share like 0.26. */
const oneIn = (share: number) => `about 1 in ${Math.max(2, Math.round(1 / share))}`;

const PHOTO_SRCSET = [960, 1600, 2400]
  .map((w) => `/hero/raja-ampat-reef-${w}.webp ${w}w`)
  .join(", ");

const PHOTO_CREDIT = {
  place: "Coral reef at Arborek, Raja Ampat",
  author: "Akbar raf",
  source: "https://commons.wikimedia.org/wiki/File:Coral_in_Raja_Ampat.jpg",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/** Each word rises out of its own mask, staggered from `start` ms. */
function RisingWords({ text, start, step }: { text: string; start: number; step: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span className="word-mask">
            <span
              className="motion-safe:animate-word-rise"
              style={{ animationDelay: `${start + i * step}ms` }}
            >
              {word}
            </span>
          </span>
          {i < words.length - 1 && " "}
        </Fragment>
      ))}
    </>
  );
}

/** Scroll-linked values, all derived from --dive (0 at the top, 1 once the hero has scrolled away). */
const DIVE = {
  frame: {
    transform: "scale(calc(1 - var(--dive, 0) * 0.05))",
    transformOrigin: "50% 0%",
    willChange: "transform",
  },
  photo: {
    transform: "scale(calc(1 + var(--dive, 0) * 0.18)) translate3d(0, calc(var(--dive, 0) * 4%), 0)",
    willChange: "transform",
  },
  copy: {
    transform: "translate3d(0, calc(var(--dive, 0) * -110px), 0)",
    opacity: "calc(1 - var(--dive, 0) * 1.8)",
    willChange: "transform, opacity",
  },
} satisfies Record<string, CSSProperties>;

export default function Hero({ onExplore, alertRecall, surveys, reefCount }: HeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollProgress(sectionRef, "--dive");

  return (
    <section id="top" ref={sectionRef} className="relative px-2 pt-2 sm:px-3 sm:pt-3">
      {/* Outer frame: a white mat with a hairline, like a mounted photograph. */}
      <div
        className="relative h-[calc(100svh-1rem)] min-h-[600px] overflow-hidden rounded-[28px] border border-border bg-white p-2 shadow-soft motion-safe:animate-frame-open sm:h-[calc(100svh-1.5rem)] sm:rounded-[36px] sm:p-2.5"
        style={DIVE.frame}
      >
        {/* Inner panel: the reef, with sunlit surface water behind the headline. */}
        <div className="relative isolate h-full overflow-hidden rounded-[21px] sm:rounded-[27px]">
          <div className="absolute inset-0 -z-20 bg-ocean-blue" style={DIVE.photo}>
            <img
              src="/hero/raja-ampat-reef-1600.webp"
              srcSet={PHOTO_SRCSET}
              sizes="100vw"
              alt="Underwater view of a shallow coral reef at Arborek, Raja Ampat: table and branching corals under clear blue water."
              width={2400}
              height={1728}
              decoding="async"
              className="h-full w-full object-cover object-[50%_58%] motion-safe:animate-hero-settle"
            />
          </div>
          {/* Sunlight slanting through the water, under the surface wash. */}
          <LiveLayer className="pointer-events-none absolute inset-0 -z-[15] overflow-hidden">
            <SunRays />
          </LiveLayer>
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(243_248_251/0.94)_0%,rgb(243_248_251/0.86)_34%,rgb(243_248_251/0.4)_50%,rgb(243_248_251/0)_62%)]"
          />
          {/* A pool of light behind the copy so it reads over the coral, whatever the screen size. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_62%_50%_at_50%_38%,rgb(243_248_251/0.9)_0%,rgb(243_248_251/0.72)_48%,rgb(243_248_251/0)_78%)]"
          />
          {/* Life on the reef: bubbles rising and a school of fish crossing below the copy. */}
          <LiveLayer className="pointer-events-none absolute inset-0 -z-[5] overflow-hidden">
            <Bubbles height={420} opacity={0.9} />
            <FishSchool top="66%" duration={36} delay={9} scale={1.35} color="rgb(10 37 64 / 0.7)" />
            <FishSchool top="78%" duration={48} delay={28} scale={1.1} color="#F2A65A" stripe="#fff" />
          </LiveLayer>

          <div
            className="flex h-full flex-col items-center px-5 pb-20 pt-28 text-center sm:pt-32 lg:pt-[17vh]"
            style={DIVE.copy}
          >
            <h1 className="max-w-[18ch] text-balance text-[clamp(2.5rem,5.2vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:max-w-none">
              <span className="block">
                <RisingWords text={HEADLINE_LEAD} start={650} step={80} />
              </span>
              <span className="mt-[0.06em] block font-display text-[1.14em] font-normal italic leading-[1] tracking-[-0.025em] text-brand">
                <RisingWords text={HEADLINE_TAIL} start={950} step={90} />
              </span>
            </h1>

            <p
              className="mt-6 max-w-[34rem] text-pretty text-base font-medium leading-relaxed text-ink/85 motion-safe:animate-blur-in sm:text-lg"
              style={{ animationDelay: "1350ms" }}
            >
              {alertRecall != null && surveys != null ? (
                <>
                  In {surveys.toLocaleString()} dive surveys, the heat at which NOAA&apos;s alerts begin was
                  reached in only <strong className="font-semibold text-ink">{oneIn(alertRecall)}</strong>{" "}
                  bleaching events.{" "}
                </>
              ) : null}
              Blue Sentinel predicts bleaching risk for{" "}
              {reefCount ? `${reefCount.toLocaleString()} reefs` : "every mapped reef"}, focused on
              Indonesia, and explains every estimate.
            </p>

            <button
              type="button"
              onClick={onExplore}
              className={`group relative mt-9 inline-flex h-[52px] items-center gap-2.5 overflow-hidden rounded-full bg-ink px-7 text-[15px] font-medium text-white shadow-[0_18px_36px_-16px_rgba(10,37,64,0.55),inset_0_1px_0_rgb(255_255_255/0.15)] transition-[background-color,transform] duration-500 hover:bg-primary active:scale-[0.98] motion-safe:animate-blur-in ${FOCUS_RING}`}
              style={{ animationDelay: "1550ms" }}
            >
              {/* One sweep of light on arrival, another on hover. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent motion-safe:animate-sheen"
                style={{ animationDelay: "2500ms" }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[120%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-[320%] motion-reduce:hidden"
              />
              Explore the map
              <ArrowRight
                className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </button>
          </div>

          <p
            className="absolute bottom-3 right-3 max-w-[calc(100%-1.5rem)] rounded-full bg-white/90 px-3 py-1.5 text-[11px] leading-snug text-muted-strong shadow-soft motion-safe:animate-blur-in sm:bottom-4 sm:right-4"
            style={{ animationDelay: "1900ms" }}
          >
            {PHOTO_CREDIT.place}. Photo{" "}
            <a
              href={PHOTO_CREDIT.source}
              target="_blank"
              rel="noreferrer"
              className={`rounded-sm underline decoration-foreground/30 underline-offset-2 hover:text-foreground hover:decoration-foreground/70 ${FOCUS_RING}`}
            >
              {PHOTO_CREDIT.author}
            </a>
            ,{" "}
            <a
              href={PHOTO_CREDIT.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className={`whitespace-nowrap rounded-sm underline decoration-foreground/30 underline-offset-2 hover:text-foreground hover:decoration-foreground/70 ${FOCUS_RING}`}
            >
              {PHOTO_CREDIT.license}
            </a>
            , colour-adjusted
          </p>
        </div>
      </div>
    </section>
  );
}
