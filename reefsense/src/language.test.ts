import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the scientific framing of user-facing copy: predictions are
 * probabilities, never "resilience scores", and never proof.
 */
const SRC = fileURLToPath(new URL(".", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SRC).filter(
  (f) =>
    !f.endsWith(".test.ts") &&
    (f.endsWith(".tsx") || relative(SRC, f).replace(/\\/g, "/").startsWith("data/")),
);
const sources = files.map((f) => ({ file: relative(SRC, f), text: readFileSync(f, "utf8") }));

describe("scientific language", () => {
  it("scans the UI and data sources", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it("never calls the prediction a 'resilience score'", () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/resilience score/i);
    }
  });

  it("never claims the model proves resilience", () => {
    for (const { file, text } of sources) {
      const cleaned = text.replace(/\bdo(?:es)?\s+not\s+prove\b/gi, "");
      expect(cleaned, file).not.toMatch(/\bproves?\b/i);
    }
  });

  it("contains the required spec copy", () => {
    const components = sources
      .filter((s) => s.file.replace(/\\/g, "/").startsWith("components/"))
      .map((s) => s.text)
      .join("\n");
    for (const phrase of [
      "Predicted probability of high climate resilience",
      "Model prediction based on environmental and ecological predictors.",
      "Model explanation",
      "Most coral bleaching starts before the alarm sounds.",
      "Focus: Indonesia",
      "Explore the map",
      "Powered by environmental and ecological data",
      "Climate Resilience",
    ]) {
      expect(components).toContain(phrase);
    }
  });

  it("uses the Blue Sentinel product name", () => {
    const components = sources
      .filter((s) => s.file.replace(/\\/g, "/").startsWith("components/"))
      .map((s) => s.text)
      .join("\n");
    expect(components).toContain("Blue Sentinel");

    // The old product name must not survive in source or config. The spaced
    // phrase "reef resilience" is the scientific concept and stays allowed.
    const OLD_NAME = /reef[-_]?resilience/i;
    const code = walk(SRC).filter(
      (f) => /\.(ts|tsx|css)$/.test(f) && !f.endsWith(".test.ts"),
    );
    expect(code.length).toBeGreaterThan(10);
    for (const f of code) {
      expect(readFileSync(f, "utf8"), relative(SRC, f)).not.toMatch(OLD_NAME);
    }
    for (const name of ["../index.html", "../package.json"]) {
      const text = readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
      expect(text, name).not.toMatch(OLD_NAME);
    }
  });
});
