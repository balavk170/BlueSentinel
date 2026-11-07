import type {
  BleachingHistory,
  HeatHistory,
  ModelMetrics,
  NoaaGapSummary,
  PredictRequest,
  PredictResponse,
  Reef,
  ReefExplanation,
  ReefNews,
  ReefPhoto,
  StressTest,
  ReefSupport,
  SurveyHistory,
} from "@/types/reef";

/**
 * Frontend API layer. Every function calls the ReefCast FastAPI backend
 * (backend/main.py); there is no mock fallback.
 *
 *   GET  /api/reefs                   -> listReefs()
 *   GET  /api/reefs/{id}              -> getReef(id)
 *   POST /api/predict                 -> predict(input)
 *   GET  /api/reefs/{id}/explanation  -> getExplanation(id)
 *   GET  /api/reefs/{id}/photos       -> getReefPhotos(id)
 *   GET  /api/reefs/{id}/heat-history -> getHeatHistory(id)
 *   GET  /api/reefs/{id}/survey-history -> getSurveyHistory(id)
 *   GET  /api/reefs/{id}/news         -> getReefNews(id)
 *   GET  /api/reefs/{id}/support      -> getReefSupport(id)
 *   GET  /api/bleaching-history       -> getBleachingHistory()
 *   GET  /api/model                   -> getModelMetrics()
 *   GET  /api/noaa-gap                -> getNoaaGap()
 */

export interface ApiConfig {
  /** Backend origin without trailing slash. Empty = same-origin `/api`. */
  baseUrl: string;
}

/** Read on every call so the configuration can be changed in tests. */
export function getApiConfig(): ApiConfig {
  return { baseUrl: (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "") };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl } = getApiConfig();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("The Blue Sentinel API is unreachable.");
  }
  if (!res.ok) throw new ApiError(`Request to ${path} failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

/** Like `http`, but resolves to `null` for 404 Not Found. */
async function httpOrNull<T>(path: string): Promise<T | null> {
  try {
    return await http<T>(path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** GET /api/reefs */
export function listReefs(): Promise<Reef[]> {
  return http<Reef[]>("/reefs");
}

/** GET /api/reefs/{id} */
export function getReef(id: string): Promise<Reef | null> {
  return httpOrNull<Reef>(`/reefs/${encodeURIComponent(id)}`);
}

/** GET /api/reefs/{id}/explanation */
export function getExplanation(id: string): Promise<ReefExplanation | null> {
  return httpOrNull<ReefExplanation>(`/reefs/${encodeURIComponent(id)}/explanation`);
}

/** GET /api/reefs/{id}/photos: community photos near the reef (404 or none -> []). */
export async function getReefPhotos(id: string): Promise<ReefPhoto[]> {
  return (await httpOrNull<ReefPhoto[]>(`/reefs/${encodeURIComponent(id)}/photos`)) ?? [];
}

/** GET /api/reefs/{id}/heat-history: daily Degree Heating Weeks over the recent window. */
export function getHeatHistory(id: string): Promise<HeatHistory | null> {
  return httpOrNull<HeatHistory>(`/reefs/${encodeURIComponent(id)}/heat-history`);
}

/**
 * Caches a request that returns fixed data (the survey archive does not change while the page is
 * open), so several components can ask for it without repeating the request. Failures are not cached.
 */
function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let hit = cache.get(key);
  if (!hit) {
    hit = load().catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, hit);
  }
  return hit;
}

const surveyHistoryCache = new Map<string, Promise<SurveyHistory | null>>();
const bleachingHistoryCache = new Map<string, Promise<BleachingHistory>>();

/** Clears cached responses (for tests). */
export function clearApiCache(): void {
  surveyHistoryCache.clear();
  bleachingHistoryCache.clear();
}

/** GET /api/reefs/{id}/survey-history: past bleaching surveys near the reef, by year. */
export function getSurveyHistory(id: string): Promise<SurveyHistory | null> {
  return cached(surveyHistoryCache, id, () =>
    httpOrNull<SurveyHistory>(`/reefs/${encodeURIComponent(id)}/survey-history`),
  );
}

/** GET /api/bleaching-history: every observed bleaching survey since 1998, for the replay map. */
export function getBleachingHistory(): Promise<BleachingHistory> {
  return cached(bleachingHistoryCache, "all", () => http<BleachingHistory>("/bleaching-history"));
}

/** GET /api/reefs/{id}/news: coral news about the reef's region. */
export function getReefNews(id: string): Promise<ReefNews | null> {
  return httpOrNull<ReefNews>(`/reefs/${encodeURIComponent(id)}/news`);
}

/** GET /api/reefs/{id}/support: reef conservation organisations near the reef (curated). */
export function getReefSupport(id: string): Promise<ReefSupport | null> {
  return httpOrNull<ReefSupport>(`/reefs/${encodeURIComponent(id)}/support`);
}

/** POST /api/predict: score any location under a given heat-stress scenario. */
export function predict(input: PredictRequest): Promise<PredictResponse> {
  return http<PredictResponse>("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** GET /api/model: cross-validated performance of the served model. */
interface RawValidation {
  time_splits?: { split: string; n: number; model_roc_auc: number; dhw_roc_auc: number }[];
  country_holdouts?: { country: string; n: number; model_roc_auc: number; dhw_roc_auc: number }[];
}

/** Plain labels for the stress tests, in the order they read best. */
function stressTests(v: RawValidation | null | undefined): StressTest[] {
  if (!v) return [];
  const time = (v.time_splits ?? []).map((t) => ({
    label: t.split.includes("2016") ? "The 2016 global bleaching event, unseen" : "Later years (2013–2020), unseen",
    surveys: t.n,
    modelAuc: t.model_roc_auc,
    heatAuc: t.dhw_roc_auc,
  }));
  const places = (v.country_holdouts ?? []).map((c) => ({
    label: `${c.country}, never seen in training`,
    surveys: c.n,
    modelAuc: c.model_roc_auc,
    heatAuc: c.dhw_roc_auc,
  }));
  return [...time, ...places];
}

export async function getModelMetrics(): Promise<ModelMetrics | null> {
  const { metrics, validation } = await http<{ metrics: ModelMetrics; validation?: RawValidation | null }>(
    "/model",
  );
  return metrics?.model ? { ...metrics, stressTests: stressTests(validation) } : null;
}

/** GET /api/noaa-gap: reefs at elevated predicted risk while NOAA's current alert is below Warning. */
export function getNoaaGap(): Promise<NoaaGapSummary> {
  return http<NoaaGapSummary>("/noaa-gap");
}

/**
 * Leaflet tile URL for the coral reef extent layer (UNEP-WCMC v4.1). Images only: the source license
 * forbids making the underlying data downloadable.
 */
export function reefAreaTileUrl(): string {
  return `${getApiConfig().baseUrl}/api/tiles/reef-area/{z}/{x}/{y}.png`;
}
