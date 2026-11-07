import Reveal from "@/components/Reveal";

export default function Footer() {
  return (
    <footer className="bg-[#F4EBD8]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <Reveal>
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-mark.png"
              alt=""
              width={297}
              height={184}
              className="h-8 w-auto"
              loading="lazy"
              decoding="async"
            />
            <span className="font-display text-2xl font-medium tracking-tight text-foreground">
              Blue Sentinel
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-strong">
            AI-powered insight into coral reef{" "}
            <span className="font-display italic text-foreground">climate resilience.</span>
          </p>
          <p className="mt-1 text-xs text-muted-strong">Powered by environmental and ecological data</p>
        </Reveal>
        <Reveal as="p" delay={120} className="max-w-sm text-xs leading-relaxed text-muted-strong sm:text-right">
          Data: Global Coral-Bleaching Database (CC BY 4.0), NOAA Coral Reef Watch and UNEP-WCMC
          coral reef extent v4.1 (2021, non-commercial use). Predictions
          are model-based estimates and do not prove that any reef is resilient.
        </Reveal>
      </div>
    </footer>
  );
}
