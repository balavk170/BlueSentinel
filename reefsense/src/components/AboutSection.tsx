import Reveal from "@/components/Reveal";

const POINTS = [
  {
    title: "Environmental & ecological data",
    body: "Each reef is characterised by predictors such as accumulated heat stress (Degree Heating Weeks), sea temperature anomalies, turbidity, depth, wave exposure and cyclone frequency.",
  },
  {
    title: "Model-based estimates",
    body: "A gradient-boosted classifier estimates the chance a reef avoids significant bleaching (10% or more of colonies) and reports each predictor's contribution, so every estimate is explainable.",
  },
  {
    title: "Decision support, not proof",
    body: "Outputs are predictions, not guarantees. They are intended to support prioritisation alongside field assessment, not to replace it.",
  },
];

export default function AboutSection() {
  return (
    <section id="about" className="scroll-mt-24 border-t border-border">
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <Reveal variant="mask">
              <h2 className="text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.03em] text-foreground sm:text-5xl">
                A transparent lens on{" "}
                <span className="font-display font-normal italic tracking-[-0.02em] text-brand">
                  reef climate resilience
                </span>
              </h2>
            </Reveal>
            <Reveal as="p" delay={150} className="mt-6 text-base leading-relaxed text-muted-strong">
              Blue Sentinel is a research-oriented GIS platform that helps scientists and
              restoration teams explore where coral reef environments show stronger potential to
              persist under climate stress. It pairs an interactive map of reefs across Asia with explainable,
              model-based predictions.
            </Reveal>
            <Reveal as="p" delay={220} className="mt-4 text-sm leading-relaxed text-muted-strong">
              Bleaching labels and reef conditions come from the Global Coral-Bleaching Database
              (van Woesik &amp; Kratochwill 2022, CC BY 4.0); live heat stress comes from NOAA Coral
              Reef Watch daily 5 km satellite products. Training heat metrics (CoRTAD) and live
              ones (Coral Reef Watch) are related but distinct products. Non-heat conditions come
              from each reef&apos;s own survey where one exists, otherwise from the nearest surveyed
              reefs.
            </Reveal>
            <Reveal as="p" delay={260} className="mt-4 text-xs leading-relaxed text-muted-strong">
              Reef area: UNEP-WCMC, WorldFish Centre, WRI, TNC (2010). Global distribution of
              warm-water coral reefs, compiled from multiple sources including the Millennium Coral
              Reef Mapping Project. Version 4.1, released 2021. Cambridge (UK): UNEP World
              Conservation Monitoring Centre.{" "}
              <a
                href="https://www.unep-wcmc.org"
                target="_blank"
                rel="noopener"
                className="text-brand underline underline-offset-2 hover:text-foreground"
              >
                unep-wcmc.org
              </a>
            </Reveal>
          </div>

          <ul className="divide-y divide-border border-y border-border">
            {POINTS.map((p, i) => (
              <Reveal as="li" key={p.title} delay={i * 120} className="py-7">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
