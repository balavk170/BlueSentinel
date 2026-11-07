"""ReefCast API: serves precomputed site scores, an adjustable restoration-priority ranking,
and the ReefSense contract (/api/reefs, /api/predict, /api/reefs/{id}/photos for cached
iNaturalist reef photos from pipeline/06_fetch_reef_photos.py, /api/reefs/{id}/support for curated
reef conservation organisations from data/sites/support_links.json).

uvicorn main:app --reload --port 8000   (run from the backend/ folder)

ReefSense framing: the model predicts bleaching (>= 10% of colonies) under the past 12 weeks of
satellite heat stress. "Probability of high climate resilience" is reported as 1 - P(bleaching), and
feature contributions are sign-flipped so that positive values raise predicted resilience.
"""
import base64
import csv
import json
import os
import sys
import threading
import time
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, timedelta
from functools import lru_cache
from math import cos, radians
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

try:
    from .news import news_for_region
except ImportError:  # direct script execution from backend/
    from news import news_for_region

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = Path(os.getenv("REEFCAST_DATA", ROOT / "data/processed/sites_scored.json"))
PHOTOS_PATH = Path(os.getenv("REEFCAST_PHOTOS", ROOT / "data/processed/reef_photos.json"))
# Curated reef conservation organisations per place (hand-made, see the file's _rule).
SUPPORT_PATH = Path(os.getenv("REEFCAST_SUPPORT", ROOT / "data/sites/support_links.json"))
REEF_AREA_TILES = ROOT / "data/processed/reef_area_tiles"  # pipeline/05_reef_area_tiles.py
HEAT_SERIES_PATH = ROOT / "data/processed/crw_heat_grid_series.json"  # pipeline/02b_fetch_crw_grid.py
# Returned for map tiles with no reef in them, so the map doesn't log a 404 per empty ocean tile.
EMPTY_TILE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
TILE_CACHE = {"Cache-Control": "public, max-age=86400"}
# Built ReefSense app (`npm run build` in reefsense/). When present, it is served from this
# origin too (see the end of this file), so the deployed site needs no CORS or proxy.
WEB_DIST = Path(os.getenv("REEFCAST_WEB_DIST", ROOT / "reefsense/dist")).resolve()
# Comma-separated countries whose case-study reefs (data/sites/demo_sites.csv) get their news fetched at
# startup and kept fresh, e.g. "Indonesia". Off by default so local runs do not call Mongabay on every reload.
WARM_NEWS_COUNTRIES = {c.strip() for c in os.getenv("REEFCAST_WARM_NEWS", "").split(",") if c.strip()}
NEWS_WARM_INTERVAL_S = 5 * 3600  # below news.CACHE_TTL_S (6 h), so warmed regions never go cold
sys.path.insert(0, str(ROOT / "pipeline"))

@asynccontextmanager
async def lifespan(_app):
    # Build the slow caches in the background, so the first visitor does not wait for them: the model and
    # survey index (first /api/predict, e.g. the first drag of the heat slider), the reef list and the
    # bleaching-history replay.
    threading.Thread(target=warm_caches, daemon=True).start()
    if WARM_NEWS_COUNTRIES:
        threading.Thread(target=warm_news, args=(WARM_NEWS_COUNTRIES,), daemon=True).start()
    yield


app = FastAPI(title="ReefCast API", version="0.3.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)  # thousands of reefs: the JSON compresses ~10x
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("REEFCAST_CORS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

CRITERIA = {
    "heat_safety": "Low near-term bleaching risk",
    "coral_cover": "Healthy coral cover today",
    "refugia": "Long-term climate refuge (50 Reefs+)",
    "connectivity": "Larval connectivity to nearby reefs",
}

# NOAA Coral Reef Watch Bleaching Alert Area levels.
ALERT_LABELS = ["No stress", "Watch", "Warning", "Alert level 1", "Alert level 2",
                "Alert level 3", "Alert level 4", "Alert level 5"]
TOP_CONTRIBUTIONS = 6
# NOAA's Bleaching Alert Level 1 ("bleaching likely") starts at 4 Degree Heating Weeks. A reef whose
# peak DHW stayed below 4 over the past 12 weeks never reached Alert Level 1 in that window. (NOAA's
# *current* alert is not used: it resets once water cools, even after a summer at alert level.)
NOAA_ALERT1_DHW = 4.0
NOAA_GAP_DEFINITION = (
    "Peak heat stress over the past 12 weeks stayed below 4 DHW, so NOAA Coral Reef Watch's alerts "
    "did not reach Alert Level 1 here, while the model predicts moderate or lower resilience (at least "
    "a 34% chance of bleaching of 10% or more of colonies)."
)
# Model features that measure recent heat (the rest describe the site or its long-term climate).
HEAT_FEATURES = {"TSA_DHW", "TSA_DHWMax", "SSTA_DHW", "SSTA", "TSA"}


@lru_cache(maxsize=1)
def _scored_data(path, mtime_ns):
    """Parsed sites_scored.json plus lookups, cached until the file changes (e.g. a pipeline re-run)."""
    data = json.loads(Path(path).read_text())
    scored = [s for s in data["sites"] if s.get("bleaching_probability") is not None]
    return data, scored, {s["site_id"]: s for s in scored}


def _cached():
    if not DATA_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=f"No scored sites at {DATA_PATH}. Run the pipeline (pipeline/04_score_sites.py) first.",
        )
    return _scored_data(str(DATA_PATH), DATA_PATH.stat().st_mtime_ns)


def load_data():
    """The scored-sites file. Shared between requests: treat it as read-only."""
    return _cached()[0]


def load_photos():
    """Reef photo cache (pipeline/06_fetch_reef_photos.py). Optional: missing file = no photos."""
    try:
        mtime = PHOTOS_PATH.stat().st_mtime_ns
    except FileNotFoundError:
        return {"photos": {}, "reefs": {}}
    return _read_photos(str(PHOTOS_PATH), mtime)


@lru_cache(maxsize=1)
def _read_photos(path, _mtime_ns):
    """Parsed once per (path, mtime): the weekly sync rewrites the file in place."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


SUPPORT_TIERS = ("site", "region", "country", "global")  # most specific first
SUPPORT_REACH = {"local", "national", "global"}


def validate_support_links(cfg):
    """Checks data/sites/support_links.json; raises ValueError naming the first problem found."""
    orgs = cfg.get("organisations")
    scopes = cfg.get("scopes")
    if not isinstance(orgs, dict) or not orgs:
        raise ValueError("'organisations' must be a non-empty object")
    if not isinstance(scopes, list) or not scopes:
        raise ValueError("'scopes' must be a non-empty list")
    for org_id, org in orgs.items():
        for key in ("name", "url", "description", "verified_on"):
            if not isinstance(org.get(key), str) or not org[key].strip():
                raise ValueError(f"organisation {org_id!r}: missing {key!r}")
        url = urlparse(org["url"])
        if url.scheme != "https" or not url.netloc:
            raise ValueError(f"organisation {org_id!r}: url must be https ({org['url']!r})")
        try:
            date.fromisoformat(org["verified_on"])
        except ValueError:
            raise ValueError(f"organisation {org_id!r}: verified_on must be an ISO date") from None
    for i, scope in enumerate(scopes):
        if scope.get("tier") not in SUPPORT_TIERS:
            raise ValueError(f"scope {i}: tier must be one of {', '.join(SUPPORT_TIERS)}")
        match = scope.get("match")
        if not isinstance(match, list) or not all(isinstance(m, str) for m in match):
            raise ValueError(f"scope {i}: 'match' must be a list of strings")
        entries = scope.get("orgs")
        if not isinstance(entries, list) or not 1 <= len(entries) <= 3:
            raise ValueError(f"scope {i}: needs 1-3 organisations")
        for entry in entries:
            if entry.get("org") not in orgs:
                raise ValueError(f"scope {i}: unknown organisation {entry.get('org')!r}")
            if entry.get("reach") not in SUPPORT_REACH:
                raise ValueError(f"scope {i}: reach must be one of {', '.join(sorted(SUPPORT_REACH))}")
            if not isinstance(entry.get("scope"), str) or not entry["scope"].strip():
                raise ValueError(f"scope {i}: missing 'scope' label")
    if sum(s["tier"] == "global" for s in scopes) != 1:
        raise ValueError("there must be exactly one global scope")
    return cfg


@lru_cache(maxsize=1)
def _read_support(path, _mtime_ns):
    """Parsed and validated once per (path, mtime)."""
    return validate_support_links(json.loads(Path(path).read_text(encoding="utf-8")))


def load_support_links():
    try:
        mtime = SUPPORT_PATH.stat().st_mtime_ns
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail=f"No support links at {SUPPORT_PATH}.") from None
    try:
        return _read_support(str(SUPPORT_PATH), mtime)
    except ValueError as err:  # also json.JSONDecodeError
        raise HTTPException(status_code=503, detail=f"Invalid support_links.json: {err}") from None


def support_keys(site, tier):
    """Labels a reef matches at a tier. Region labels are "Province, Country" (GCBD) or a place name (demo).
    nearest_country() is not used: for reefs outside Asia it would pick an Asian country."""
    region = site["region"]
    if tier == "site":
        return {site["site_id"]}
    keys = {region}
    if ", " in region:
        province, country = region.rsplit(", ", 1)
        keys.add(province if tier == "region" else country)
    return keys


def resolve_support(site, cfg):
    """(tier, scope) of the most specific scope matching the reef; the global scope always matches."""
    for tier in SUPPORT_TIERS:
        keys = set() if tier == "global" else support_keys(site, tier)
        for scope in cfg["scopes"]:
            if scope["tier"] == tier and (tier == "global" or keys & set(scope["match"])):
                return tier, scope
    raise ValueError("no global scope")  # validate_support_links guarantees one


def warm_caches():
    try:
        list_reefs()
        scorer()
        bleaching_history_payload()
    except HTTPException:
        pass  # no scored sites or trained model yet; the endpoints report it
    except Exception as err:  # the endpoint itself will raise it; the warm-up only logs it
        print(f"Cache warm-up failed: {err!r}", file=sys.stderr)


def case_study_sites():
    """Scored reefs from the hand-made site list (data/sites/demo_sites.csv): Bali, Nusa Penida and others."""
    from config import SITES_CSV
    with open(SITES_CSV, newline="") as f:
        ids = {row["site_id"] for row in csv.DictReader(f)}
    return [s for s in scored_sites() if s["site_id"] in ids]


def warm_news(countries):
    """Fetch, and keep refreshing, the news for case-study reefs in these countries. An uncached Mongabay
    search takes 10-20 s, which a first-time visitor would otherwise wait through on the reef they open."""
    while True:
        try:
            regions = {}
            for site in case_study_sites():
                country = nearest_country(site)
                if country in countries:
                    regions[site["region"]] = country
            for region, country in regions.items():
                news_for_region(region, country=country)
        except Exception as err:  # a warm-up problem must never take the API down
            print(f"News warm-up failed: {err!r}", file=sys.stderr)
        time.sleep(NEWS_WARM_INTERVAL_S)


@lru_cache(maxsize=1)
def scorer():
    try:
        from inference import Scorer
        return Scorer()
    except (SystemExit, FileNotFoundError) as err:
        raise HTTPException(status_code=503, detail=f"Model not available: {err}")


def criterion_values(site, conn_range):
    values = {}
    if site.get("bleaching_probability") is not None:
        values["heat_safety"] = 1 - site["bleaching_probability"]
    if site.get("coral_cover_pct") is not None:
        values["coral_cover"] = min(site["coral_cover_pct"] / 100, 1.0)
    if site.get("refugia_50reefs_plus") is not None:
        values["refugia"] = 1.0 if site["refugia_50reefs_plus"] else 0.0
    if site.get("connectivity") is not None:
        lo, hi = conn_range
        values["connectivity"] = 0.5 if hi == lo else (site["connectivity"] - lo) / (hi - lo)
    return values


# --- ReefSense helpers ---------------------------------------------------

def category(resilience):
    if resilience >= 0.66:
        return "High"
    return "Medium" if resilience >= 0.4 else "Low"


def heat_stress_level(dhw):
    """Qualitative accumulated heat stress from peak 12-week DHW (4 DHW = NOAA Alert Level 1).

    Deliberately not NOAA's alert level: that tracks *current* HotSpots and resets to "No stress"
    once water cools, even while 12 weeks of accumulated stress (what the model uses) remain.
    """
    if dhw is None:
        return None
    return "Low" if dhw < 2 else "Moderate" if dhw < 4 else "High"


def resilience_contributions(contributions, limit=None):
    flipped = [{"feature": c["label"], "contribution": round(-c["contribution"], 4)} for c in contributions]
    return flipped[:limit] if limit else flipped


def lower_first(label):
    """Lowercase a label for mid-sentence use without mangling acronyms like DHW."""
    return label[:1].lower() + label[1:]


def insight(resilience, contributions, dhw_max):
    up = next((c for c in contributions if c["contribution"] > 0), None)
    down = next((c for c in contributions if c["contribution"] < 0), None)
    text = (f"Under the past 12 weeks of satellite heat stress (peak {dhw_max:.1f} DHW), the model estimates "
            f"a {resilience:.0%} chance this reef avoids significant bleaching.")
    if up:
        text += f" {up['feature']} contributes most to raising this estimate"
        text += f", while {lower_first(down['feature'])} contributes most to lowering it." if down else "."
    elif down:
        text += f" {down['feature']} contributes most to lowering it."
    return text


def is_noaa_gap(site):
    """NOAA alerts stayed below Alert Level 1 for 12 weeks, but the model predicts moderate or lower resilience."""
    dhw = site["heat"].get("dhw_max_12w")
    resilience = 1 - site["bleaching_probability"]
    return dhw is not None and dhw < NOAA_ALERT1_DHW and category(resilience) != "High"


def top_driver_is_heat(site):
    contributions = site.get("contributions") or []
    return bool(contributions) and contributions[0]["feature"] in HEAT_FEATURES


def country_of(site):
    """Country from a "Province, Country" region label (GCBD sites); the label itself otherwise."""
    return site["region"].rsplit(", ", 1)[-1]


def nearest_country(site):
    """Country for a reef: from its "Province, Country" label, or else the nearest such reef's (demo sites
    are labelled with a local place name only)."""
    if ", " in site["region"]:
        return country_of(site)
    labelled = [s for s in load_data()["sites"] if ", " in s["region"]]
    if not labelled:
        return None
    lat, lon = site["lat"], site["lon"]
    nearest = min(labelled, key=lambda s: (s["lat"] - lat) ** 2 + ((s["lon"] - lon) * cos(radians(lat))) ** 2)
    return country_of(nearest)


def to_reef(site):
    """GET /api/reefs item. Explanation fields live in GET /api/reefs/{id}/explanation."""
    p = site["bleaching_probability"]
    resilience = round(1 - p, 4)
    heat = site["heat"]
    alert = heat.get("alert_level")
    site_cover = site.get("coral_cover_pct")
    return {
        "id": site["site_id"],
        "name": site["name"],
        "region": site["region"],
        "latitude": site["lat"],
        "longitude": site["lon"],
        "resilienceProbability": resilience,
        "bleachingProbability": p,
        "category": category(resilience),
        "metrics": {
            "seaSurfaceTemp": heat.get("sst_mean_30d"),
            "sstAnomaly": heat.get("ssta_mean_30d"),
            "coralCover": site_cover if site_cover is not None else site.get("survey_coral_cover_pct"),
            # "site list": entered in data/sites; "survey": latest GCBD survey at or near the reef.
            "coralCoverSource": "site list" if site_cover is not None else "survey",
            "coralCoverYear": None if site_cover is not None else site.get("survey_coral_cover_year"),
            "coralCoverKm": None if site_cover is not None else site.get("survey_coral_cover_km"),
            "depth": site.get("depth_m"),
            "dhwNow": heat.get("dhw_now"),
            "dhwMax12w": heat.get("dhw_max_12w"),
            "heatStress": heat_stress_level(heat.get("dhw_max_12w")),
            "alertLevel": None if alert is None else f"NOAA: {ALERT_LABELS[int(alert)].lower()} now",
        },
        "nearestSurveyKm": site.get("nearest_survey_km"),
        "asOf": heat.get("as_of"),
        "noaaGap": is_noaa_gap(site),
    }


def to_photo(photo_id, record, km):
    """GET /api/reefs/{id}/photos item."""
    return {
        "id": photo_id,
        "url": record["url"],
        "largeUrl": record["large_url"],
        "width": record["width"],
        "height": record["height"],
        "attribution": record["attribution"],
        "license": record["license"],
        "photographer": record["photographer"],
        "observationUrl": record["observation_url"],
        "observedOn": record.get("observed_on"),
        "taxon": record["taxon"],
        "distanceKm": km,
    }


@lru_cache(maxsize=2)
def _grid_series(mtime):
    return json.loads(HEAT_SERIES_PATH.read_text())


def grid_series():
    """Daily DHW per GCBD site from the regional grid download, or {} before 02b has run."""
    if not HEAT_SERIES_PATH.exists():
        return {}
    return _grid_series(HEAT_SERIES_PATH.stat().st_mtime)


def heat_points(site):
    """[{date, dhw}] for a site: the per-site series (demo sites) or the grid series (GCBD sites)."""
    series = site["heat"].get("series") or []
    if series:
        return [{"date": p["t"], "dhw": p["dhw"]} for p in series]
    grid = grid_series().get(site["site_id"])
    if not grid:
        return []
    start = date.fromisoformat(grid["start"])
    return [{"date": (start + timedelta(days=i)).isoformat(), "dhw": v} for i, v in enumerate(grid["dhw"])]


def scored_sites():
    return _cached()[1]


def find_site(reef_id):
    site = _cached()[2].get(reef_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"No scored reef with id {reef_id!r}.")
    return site


# --- Original ReefCast endpoints -----------------------------------------------

@app.api_route("/api/health", methods=["GET", "HEAD"])  # HEAD: some uptime monitors use it
def health():
    ready = DATA_PATH.exists()
    unscored = [] if not ready else [s["site_id"] for s in load_data()["sites"]
                                     if s.get("bleaching_probability") is None]
    return {"status": "ok", "data_ready": ready, "sites_without_heat_data": unscored}


@app.get("/api/sites")
def sites():
    return load_data()["sites"]


@app.get("/api/tiles/reef-area/{z}/{x}/{y}.png")
def reef_area_tile(z: int, x: int, y: int):
    """Coral reef extent (UNEP-WCMC v4.1, 2021) as raster tiles. Served as images only: the source
    license forbids making the data downloadable, so the vector outlines are never exposed."""
    path = REEF_AREA_TILES / str(z) / str(x) / f"{y}.png"
    if path.is_file():
        return FileResponse(path, media_type="image/png", headers=TILE_CACHE)
    return Response(EMPTY_TILE, media_type="image/png", headers=TILE_CACHE)


VALIDATION_PATH = ROOT / "data/processed/model_validation.json"  # pipeline/06_validate_model.py


@app.get("/api/model")
def model():
    validation = json.loads(VALIDATION_PATH.read_text()) if VALIDATION_PATH.exists() else None
    return {"metrics": load_data().get("model", {}), "criteria": CRITERIA, "validation": validation}


@app.get("/api/ranking")
def ranking(
    heat_safety: float = Query(0.45, ge=0),
    coral_cover: float = Query(0.25, ge=0),
    refugia: float = Query(0.20, ge=0),
    connectivity: float = Query(0.10, ge=0),
):
    """Transparent multi-criteria score. Missing criteria are excluded per site and weights renormalised."""
    weights = {"heat_safety": heat_safety, "coral_cover": coral_cover,
               "refugia": refugia, "connectivity": connectivity}
    data = load_data()["sites"]
    conns = [s["connectivity"] for s in data if s.get("connectivity") is not None]
    conn_range = (min(conns), max(conns)) if conns else (0, 0)

    ranked = []
    for site in data:
        values = criterion_values(site, conn_range)
        used = {k: w for k, w in weights.items() if k in values and w > 0}
        total = sum(used.values())
        score = None if total == 0 else round(100 * sum(values[k] * w for k, w in used.items()) / total, 1)
        ranked.append({
            "site_id": site["site_id"], "name": site["name"], "region": site["region"],
            "score": score,
            "components": {k: round(v, 3) for k, v in values.items()},
            "missing": [CRITERIA[k] for k, w in weights.items() if w > 0 and k not in values],
        })
    ranked.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
    return {"weights": weights, "sites": ranked}


# --- ReefSense endpoints ----------------------------------------------------

@lru_cache(maxsize=1)
def _reef_list_json(path, mtime_ns):
    return json.dumps([to_reef(s) for s in scored_sites()], separators=(",", ":")).encode()


@app.get("/api/reefs")
def list_reefs():
    # Built and encoded once per data version: thousands of reefs, requested on every page load.
    _cached()  # 503 before the pipeline has run
    return Response(_reef_list_json(str(DATA_PATH), DATA_PATH.stat().st_mtime_ns), media_type="application/json")


@app.get("/api/reefs/{reef_id}")
def get_reef(reef_id: str):
    return to_reef(find_site(reef_id))


@app.get("/api/reefs/{reef_id}/explanation")
def get_explanation(reef_id: str):
    site = find_site(reef_id)
    reef = to_reef(site)
    contributions = resilience_contributions(site.get("contributions", []), TOP_CONTRIBUTIONS)
    return {
        "reefId": reef["id"],
        "category": reef["category"],
        "probability": reef["resilienceProbability"],
        "contributions": contributions,
        "units": "log-odds of avoiding bleaching",
        "summary": insight(reef["resilienceProbability"], contributions,
                           site["heat"].get("dhw_max_12w") or 0.0),
    }


@app.get("/api/reefs/{reef_id}/photos")
def get_photos(reef_id: str):
    """Openly licensed iNaturalist coral photos within 10 km of the reef, in cache order ([] if none)."""
    find_site(reef_id)
    data = load_photos()
    photos = data.get("photos", {})
    return [to_photo(pid, photos[pid], km)
            for pid, km in data.get("reefs", {}).get(reef_id, []) if pid in photos]


@app.get("/api/reefs/{reef_id}/heat-history")
def heat_history(reef_id: str):
    """Daily NOAA Coral Reef Watch Degree Heating Weeks at the reef's 5 km pixel over the recent window."""
    site = find_site(reef_id)
    return {
        "reefId": reef_id,
        "asOf": site["heat"].get("as_of"),
        "source": "NOAA Coral Reef Watch, Degree Heating Weeks (5 km, daily)",
        "alertThresholds": [{"dhw": NOAA_ALERT1_DHW, "label": "Alert Level 1"},
                            {"dhw": 8.0, "label": "Alert Level 2"}],
        "points": heat_points(site),
    }


@app.get("/api/reefs/{reef_id}/survey-history")
def survey_history(reef_id: str):
    """Past bleaching and coral cover surveys (Global Coral-Bleaching Database) near the reef, by year."""
    site = find_site(reef_id)
    return {"reefId": reef_id, **scorer().survey_history(site["lat"], site["lon"])}


@app.get("/api/reefs/{reef_id}/news")
def reef_news(reef_id: str):
    """Coral news about the reef's region (Mongabay). Matched by place name, not by the reef itself."""
    site = find_site(reef_id)
    return {"reefId": reef_id, "region": site["region"],
            **news_for_region(site["region"], country=nearest_country(site))}


@app.get("/api/reefs/{reef_id}/support")
def reef_support(reef_id: str):
    """Reef conservation organisations near the reef (curated, data/sites/support_links.json).
    Most specific match wins: site, region, country, then global."""
    site = find_site(reef_id)
    cfg = load_support_links()
    tier, scope = resolve_support(site, cfg)
    orgs = cfg["organisations"]
    return {
        "reefId": reef_id,
        "tier": tier,
        "organisations": [{
            "id": e["org"],
            "name": orgs[e["org"]]["name"],
            "url": orgs[e["org"]]["url"],
            "description": orgs[e["org"]]["description"],
            "scope": e["scope"],
            "reach": e["reach"],
            "language": orgs[e["org"]].get("language"),
            "verifiedOn": orgs[e["org"]]["verified_on"],
        } for e in scope["orgs"]],
    }


HISTORY_FIRST_YEAR = 1998  # earlier years have under 30 bleaching surveys each


@lru_cache(maxsize=1)
def bleaching_history_payload():
    """Every GCBD bleaching survey from HISTORY_FIRST_YEAR on, averaged per location and year."""
    from config import BLEACH_THRESHOLD
    samples = scorer().samples
    s = samples[samples["bleach"].notna() & (samples["year"] >= HISTORY_FIRST_YEAR)].copy()
    s["year"] = s["year"].astype(int)
    s["country"] = s["country"].fillna("Unknown") if "country" in s else "Unknown"
    s["bleached"] = s["bleach"] >= BLEACH_THRESHOLD
    s["lat3"], s["lon3"] = s["lat"].round(3), s["lon"].round(3)

    countries = sorted(s["country"].unique())
    index = {c: i for i, c in enumerate(countries)}
    loc = (s.groupby(["lat3", "lon3", "year"])
           .agg(mean=("bleach", "mean"), max=("bleach", "max"), n=("bleach", "size"), country=("country", "first"))
           .reset_index())
    points = [[float(r.lat3), float(r.lon3), int(r.year), round(float(r.mean), 1), round(float(r.max), 1),
               int(r.n), index[r.country]] for r in loc.itertuples()]

    years = []
    for year, g in s.groupby("year"):
        by_country = (g.groupby("country").agg(surveys=("bleached", "size"), bleached=("bleached", "mean"))
                      .sort_values("surveys", ascending=False).head(5))
        years.append({
            "year": int(year),
            "surveys": len(g),
            "locations": int(g.groupby(["lat3", "lon3"]).ngroups),
            "bleachedShare": round(float(g["bleached"].mean()), 3),
            "meanBleachedPct": round(float(g["bleach"].mean()), 1),
            "topCountries": [{"country": c, "surveys": int(r.surveys), "bleachedShare": round(float(r.bleached), 3)}
                             for c, r in by_country.iterrows()],
        })
    return {
        "source": "Global Coral-Bleaching Database (van Woesik & Kratochwill 2022)",
        "thresholdPct": BLEACH_THRESHOLD,
        "countries": countries,
        # [lat, lon, year, mean % bleached, max % bleached, surveys, country index]
        "points": points,
        "years": years,
    }


@app.get("/api/bleaching-history")
def bleaching_history():
    """Observed bleaching, year by year: every survey location, and per-year totals (for the replay map)."""
    return bleaching_history_payload()


class PredictInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    dhwMax12w: float = Field(ge=0, description="Peak Degree Heating Weeks over the past 12 weeks")
    sstAnomaly: float | None = Field(None, description="Mean sea temperature anomaly, last 30 days (°C)")
    depth: float | None = Field(None, ge=0, description="Reef depth (m)")


@app.get("/api/noaa-gap")
def noaa_gap():
    """Reefs the model flags as at elevated bleaching risk although NOAA's alerts stayed below Alert
    Level 1 for the past 12 weeks."""
    sites = scored_sites()
    below = [s for s in sites if s["heat"].get("dhw_max_12w") is not None
             and s["heat"]["dhw_max_12w"] < NOAA_ALERT1_DHW]
    gaps = sorted((s for s in below if is_noaa_gap(s)), key=lambda s: -s["bleaching_probability"])
    return {
        "definition": NOAA_GAP_DEFINITION,
        "count": len(gaps),
        "belowAlert1Count": len(below),
        "total": len(sites),
        # Caveat, reported rather than hidden: for some flagged reefs the model's largest driver is a
        # site attribute (e.g. cyclone frequency) rather than recent heat.
        "nonHeatTopDriverCount": sum(not top_driver_is_heat(s) for s in gaps),
        "asOf": max((s["heat"].get("as_of") or "" for s in sites), default=None) or None,
        "byCountry": [{"country": c, "count": n}
                      for c, n in Counter(country_of(s) for s in gaps).most_common()],
        "reefIds": [s["site_id"] for s in gaps],
    }


@app.post("/api/predict")
def predict(body: PredictInput):
    """Score any location under a given heat-stress scenario. Non-heat conditions come from nearby surveys."""
    s = scorer()
    heat = {"dhw_max_12w": body.dhwMax12w, "ssta_mean_30d": body.sstAnomaly}
    row, nearest_km = s.feature_row(body.latitude, body.longitude, heat, {"Depth_m": body.depth})
    p, contributions = s.explain(row)
    resilience = round(1 - p, 4)
    return {
        "probability": resilience,
        "bleachingProbability": round(p, 4),
        "category": category(resilience),
        "contributions": resilience_contributions(contributions, TOP_CONTRIBUTIONS),
        "nearestSurveyKm": round(nearest_km, 1),
    }


# --- Web app (production) ---------------------------------------------------------
# Registered last, so every /api route above takes precedence. In development Vite serves the app instead.

class HashedAssets(StaticFiles):
    """Vite's /assets files carry a content hash in their names, so browsers may cache them indefinitely."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


if (WEB_DIST / "index.html").is_file():
    if (WEB_DIST / "assets").is_dir():
        app.mount("/assets", HashedAssets(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def web_app(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        file = (WEB_DIST / path).resolve()
        if path and file.is_file() and WEB_DIST in file.parents:
            return FileResponse(file, headers={"Cache-Control": "public, max-age=3600"})  # logos, favicons
        # The app itself: never cached, so a redeploy shows up on the next page load.
        return FileResponse(WEB_DIST / "index.html", headers={"Cache-Control": "no-cache"})
