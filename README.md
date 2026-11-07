# Blue Sentinel

Blue Sentinel is the renamed product branding for this existing coral-reef climate-risk project. It combines an explainable bleaching model, recent satellite heat-stress data, and a web map to help users explore reef conditions and restoration priorities. This is a rename of the existing ReefSense implementation, not a claim that the underlying implementation was created from scratch.

The existing project credits its original implementation to Antonio Owen Putra Amadeus and Glenn Putra Laymando, built for ForgeHacks 2026, AI + Climate. Those credits and the source-data attributions remain applicable after this branding change.

## Problem

Coral bleaching can occur when ocean heat remains elevated. NOAA Coral Reef Watch measures accumulated heat as degree heating weeks (DHW); its Alert Level 1 threshold begins at 4 DHW. The project compares this heat signal with observations in the Global Coral-Bleaching Database and estimates the probability of avoiding significant bleaching. Its intended use is decision support for reef surveys and restoration planning, alongside field assessment, not as a replacement for observations.

## Features

- An interactive map of scored reef sites, focused on reefs across Asia, with filters and reef selection.
- Predicted probability of avoiding bleaching of 10% or more of colonies, with environmental measurements and NOAA heat-stress context.
- Explanations showing how model features contribute to each estimate.
- A 12-week heat-history timeline and nearby historical bleaching-survey records.
- A what-if heat prediction using the model-backed `POST /api/predict` endpoint.
- An NOAA-gap view for reefs the model flags where NOAA's heat alert did not reach Alert Level 1 over the recent 12-week window.
- Restoration-priority ranking using available bleaching-risk and coral-cover criteria. Refugia and connectivity are supported as scoring criteria but are not populated in the checked-in data.
- Reef reports with regional coral-news results, attributed openly licensed iNaturalist photographs, satellite imagery, and curated conservation-support links.
- A bleaching-history replay, model metrics, responsive layouts, and shareable reef links.

Predictions are estimates, not observations or guarantees of resilience. Some optional map layers and data depend on local source files.

## Technology stack

| Area | Technologies |
| --- | --- |
| Web application | React 18, TypeScript, Vite 5, Tailwind CSS, shadcn/ui primitives, React Leaflet, Leaflet, Recharts, Lucide React |
| API | Python, FastAPI, Uvicorn |
| Model and pipeline | LightGBM, scikit-learn, pandas, NumPy, joblib; GeoPandas for the optional reef-area tile pipeline |
| Data sources | NOAA Coral Reef Watch, Global Coral-Bleaching Database (GCBD), MERMAID, iNaturalist, Mongabay, and UNEP-WCMC reef extent |
| Tests | Vitest for the TypeScript application; pytest for API and data-pipeline tests |
| Deployment configuration | Dockerfile and Fly.io configuration in `fly.toml` |

The primary TypeScript application is in `reefsense/`. `frontend/` contains the original, separate single-panel React application; both use the same API.

## Architecture

```text
GCBD survey observations ──> data preparation ──> LightGBM model
NOAA Coral Reef Watch ──────────────────────────> heat inputs
                                                    │
GCBD-derived site data ────────────────────────────┤
                                                    v
                                           site scoring and
                                      feature-contribution outputs
                                                    │
                                                    v
                                              FastAPI backend
                                                    │ /api
                                                    v
                                      React + TypeScript + Vite
                                      Leaflet maps / Recharts
```

The checked-in `data/processed/sites_scored.json` supplies the precomputed reef map. Live what-if predictions and survey-history features also use the trained `data/processed/bleaching_model.joblib` and source surveys in `data/raw/gcbd.csv`; those raw/model artifacts are ignored by Git and must be prepared locally for those features.

## Requirements

- Python 3.11 or newer, with `py` available in PowerShell.
- Node.js 18 or newer and npm.
- Git, to clone the repository.
- Internet access for public dataset and satellite-data downloads, external map imagery, and regional news.
- No API keys are required by the documented data pipeline or local app.
- Docker is optional for container-based deployment; it is not needed for local development.

## Installation and first-time data setup (Windows)

Run commands from the repository root (`reefsense/` in this repository).

### 1. Create a virtual environment and install Python dependencies

```powershell
py -3.11 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

`backend/requirements.txt` includes the pipeline requirements as well as the API dependencies.

### 2. Prepare model input and local scores

The full training workflow needs the GCBD SQLite release. Download the real dataset from the [BCO-DMO GCBD dataset page](https://www.bco-dmo.org/dataset/773466) and place its SQLite database file (for example, `Global_Coral_Bleaching_Database_SQLite.db`) in `data\raw\`. Do not substitute fabricated or placeholder survey data.

Then run the existing pipeline from the repository root:

```powershell
& .\.venv\Scripts\python.exe pipeline\01b_import_gcbd_sqlite.py
& .\.venv\Scripts\python.exe pipeline\00_check_feasibility.py
& .\.venv\Scripts\python.exe pipeline\01c_make_gcbd_sites.py
& .\.venv\Scripts\python.exe pipeline\02_fetch_crw.py --days 180
& .\.venv\Scripts\python.exe pipeline\02b_fetch_crw_grid.py
& .\.venv\Scripts\python.exe pipeline\03_train_bleaching.py --region global
& .\.venv\Scripts\python.exe pipeline\04_score_sites.py
```

The pipeline downloads NOAA heat data, so run it with network access. The grid fetcher can take several minutes and relies on the upstream ERDDAP service being available. The resulting model is stored in ignored `data\processed\bleaching_model.joblib`; scored sites are written to `data\processed\sites_scored.json`.

The repository documents `pipeline\01_fetch_gcbd.py` as an alternative ERDDAP download, but notes that this copy may be a subset and may not contain the site fields required to build the current site list. Use the full dataset required by the workflow above.

Optional pipeline steps and their source-data requirements are documented in [pipeline/README.md](pipeline/README.md). Reef-area tiles require the UNEP-WCMC source archive and are not included in the repository.

### 3. Install frontend dependencies

In a second PowerShell terminal:

```powershell
Set-Location .\reefsense
npm ci
```

The frontend lockfile is committed, so `npm ci` installs its locked dependencies.

## Run locally

Keep the API and frontend running in separate PowerShell terminals.

### Terminal 1: API

From the repository root:

```powershell
$env:REEFCAST_DATA = Join-Path $PWD 'data\processed\sites_scored.json'
Set-Location .\backend
& ..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

If you have not trained the model, the checked-in scored-sites file can still serve the precomputed map, but model-backed prediction and survey-history routes need the trained model and GCBD input described above.

### Terminal 2: web application

From the repository root:

```powershell
Set-Location .\reefsense
npm run dev -- --host 127.0.0.1 --port 5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The Vite development server proxies `/api` requests to `http://localhost:8000`; the default `VITE_API_BASE_URL` is empty. Check API readiness at [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health). Press **Ctrl+C** in each terminal to stop its server.

The API also serves the built web application when it exists. To build the production frontend:

```powershell
Set-Location .\reefsense
npm run build
```

## Usage

1. Open the local web address and choose a reef from the map or the featured reef links.
2. Review the predicted probability, environmental conditions, model explanation, and recent heat history.
3. Switch between plain-language and expert views; where the model and survey data are installed, explore heat scenarios and nearby historical surveys.
4. Use the NOAA-gap map and restoration-priority ranking to compare sites. Missing scoring criteria are not invented.
5. Share a reef using its URL, such as `?reef=NP01`.

The API is available under `/api`. Common routes include:

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Backend and scored-data readiness |
| `GET /api/reefs` and `GET /api/reefs/{id}` | Reef list and reef details |
| `GET /api/reefs/{id}/explanation` | Per-reef model contributions |
| `GET /api/reefs/{id}/heat-history` | Recent daily DHW series |
| `GET /api/reefs/{id}/survey-history` | Nearby survey history |
| `GET /api/reefs/{id}/photos` | Cached iNaturalist photos |
| `GET /api/reefs/{id}/news` and `GET /api/reefs/{id}/support` | Regional news and curated support organisations |
| `GET /api/bleaching-history` and `GET /api/noaa-gap` | Survey-history replay data and NOAA-gap summary |
| `GET /api/model` and `POST /api/predict` | Model metrics and heat-scenario inference |
| `GET /api/ranking` | Weighted restoration-priority ranking |

## Tests and builds

```powershell
# Frontend tests and production type-check/build
Set-Location .\reefsense
npm test
npm run build

# Python tests (install test-only packages into the local environment first)
Set-Location ..
& .\.venv\Scripts\python.exe -m pip install pytest httpx2
& .\.venv\Scripts\python.exe -m pytest -q backend\test_main.py pipeline\test_data_sync.py
```

Some backend tests require the locally prepared GCBD survey file and trained model. The pipeline synchronization tests are designed to run offline.

## Configuration and deployment

The frontend accepts `VITE_API_BASE_URL`; leave it empty for the Vite `/api` proxy. If using a separate API origin, configure the backend's `REEFCAST_CORS` setting for that origin. The backend also supports `REEFCAST_DATA`, `REEFCAST_PHOTOS`, `REEFCAST_SUPPORT`, `REEFCAST_WEB_DIST`, and optional `REEFCAST_WARM_NEWS` settings; their defaults and behavior are defined in `backend/main.py`.

The existing Dockerfile builds the TypeScript app and serves it with FastAPI. `fly.toml` and the deployment guides (`DEPLOY.md`, `DEPLOY-AZURE.md`, `DEPLOY-CLOUD-RUN.md`) retain the original deployment identifiers and configuration. This title-only change does not rename deployed apps, domains, package identifiers, or API metadata; a deployment rename would require separate configuration changes.

## Data attribution and limitations

- The existing README credits the implementation to **Antonio Owen Putra Amadeus and Glenn Putra Laymando** for ForgeHacks 2026, AI + Climate. Blue Sentinel is the requested new product branding for that existing implementation.
- GCBD (van Woesik & Kratochwill 2022) is identified by the project as **CC BY 4.0**. Attribute the dataset and its authors when redistributing or presenting derived material.
- NOAA Coral Reef Watch data is identified as public domain by the project.
- iNaturalist photos are included only when the individual observation has an accepted Creative Commons license; retain the photographer attribution, license, and observation link shown with each image.
- MERMAID data is subject to per-project attribution and terms.
- The UNEP-WCMC reef-area layer is subject to its non-commercial data license. The project serves derived image tiles rather than exposing the source data; commercial use requires permission from UNEP-WCMC.
- The hero reef photograph is credited in the UI to Akbar raf, CC BY-SA 4.0. Map imagery and map tiles retain their provider attribution.
- Predictions are based on survey labels and satellite products, are not field observations, and do not establish long-term resilience. Training heat metrics and live NOAA heat inputs come from distinct products.

No repository-wide source-code license file was present when this README was written. Do not infer a source-code license from the dataset licenses above.
