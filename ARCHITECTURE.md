# Holdsworth — Technical Architecture Report
> Generated 2026-03-20 for external AI review and enhancement recommendations

---

## Executive Summary

Holdsworth is a baseball card collection management and appraisal platform. It combines AI-driven card identification (Google Gemini Vision), real-time market pricing (130point.com + eBay Browse API), and a responsive dark-themed web interface for cataloguing, AI grading, and portfolio analysis. The stack is a TypeScript monorepo using Next.js 15 (web), a Node.js worker (pricing engine), and PostgreSQL (Google Cloud SQL).

**Owner context:** Cameron is a Canadian non-developer building this as a personal project with aspirations to release it as a community platform. All infrastructure is on Google Cloud Platform. The app uses the Holdsworth brand identity — burgundy/charcoal dark theme, DM Serif Display display font, Karla body font, IBM Plex Mono monospace.

---

## 1. Monorepo Structure

```
CardScanner/
├── apps/
│   ├── web/              # Next.js 15.3 (React 19, App Router, Server Components)
│   └── scraper/          # Pricing engine worker (standalone Node.js process)
├── packages/
│   └── db/               # Drizzle ORM schema, migrations, job queue utilities
├── turbo.json            # Turborepo — build/dev/db tasks
├── pnpm-workspace.yaml   # Workspace declarations
├── .env.example          # Environment template
└── pnpm-lock.yaml
```

### Build tooling
- **Package manager:** pnpm (workspace protocol)
- **Orchestration:** Turborepo 2.4 (build, dev, db:generate, db:migrate, db:push)
- **TypeScript:** 5.7 (strict mode, path aliases)
- **No CI/CD pipeline yet** — no GitHub Actions, no Docker Compose

---

## 2. Database Layer (packages/db)

### Technology
- **ORM:** Drizzle ORM 0.38.4 with drizzle-kit
- **Driver:** pg (node-postgres)
- **Host:** Google Cloud SQL (PostgreSQL), accessed via Cloud SQL Auth Proxy locally
- **Connection:** `postgresql://holdsworth_app:***@localhost:5432/holdsworth`
- **Auth Proxy instance:** `holdsworth-app:us-central1:holdsworth-db`

### Complete Schema (17 tables)

#### Core Collection Tables

**`cards`** — Main inventory (primary entity)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto-generated |
| playerId | fk → players | nullable |
| setId | fk → sets | nullable |
| cardNumber | varchar(50) | e.g., "46", "90A-LAC" |
| year | integer | publication year |
| parallelVariant | varchar(255) | "Gold /2025", "Red Refractor /75" |
| isRookieCard | boolean | default false |
| condition | varchar(50) | AI or manual estimate |
| conditionNotes | text | grading observations |
| graded | boolean | has PSA/BGS/SGC slab |
| gradingCompany | varchar(50) | "PSA", "BGS", etc. |
| grade | varchar(20) | "10", "9.5", etc. |
| quantity | integer | default 1 |
| purchasePrice | numeric(10,2) | what user paid |
| purchaseCurrency | varchar(3) | default "CAD" |
| purchaseDate | timestamp | |
| purchaseSource | varchar(255) | "LCS", "eBay", etc. |
| status | varchar(50) | "in_collection" / "for_sale" / "sold" / "traded" |
| salePrice | numeric(10,2) | when sold |
| saleCurrency | varchar(3) | |
| saleDate | timestamp | |
| salePlatform | varchar(100) | |
| referenceCardId | fk → referenceCards | master checklist link |
| subsetOrInsert | varchar(255) | "Real One Autographs" |
| isAutograph | boolean | |
| isRelic | boolean | |
| aiCorrected | boolean | true when AI matched reference DB |
| aiRawResponse | jsonb | full Gemini scan JSON |
| metadata | jsonb | { gradeReport: GradeReport } |
| createdAt, updatedAt | timestamp | |
| **Indexes** | | (playerId, setId, year), (status), (year) |

**`cardPhotos`** — Photo storage (GCS URLs)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cardId | fk → cards | cascade delete |
| originalUrl | text | GCS public URL or data: URL |
| displayUrl | text | optional resized |
| thumbnailUrl | text | optional thumbnail |
| photoType | varchar(20) | "front" or "back" |
| width, height, fileSize | integer | optional metadata |
| createdAt | timestamp | |

**`players`** — Player registry
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(255) | not null |
| team | varchar(255) | team on card face |
| position | varchar(100) | |
| active | boolean | default true |
| createdAt, updatedAt | timestamp | |

**`manufacturers`** — Card makers
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(255) | unique, not null — "Topps", "Panini" |
| createdAt | timestamp | |

**`sets`** — Card set/product
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(255) | not null — "Topps Series 1" |
| year | integer | not null |
| manufacturerId | fk → manufacturers | |
| setProductId | fk → setProducts | link to reference data |
| sport | varchar(100) | default "baseball" |
| createdAt | timestamp | |

#### Reference Data (Master Checklists)

**`setProducts`** — Every known product release
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| manufacturerId | fk → manufacturers | |
| name | varchar(255) | "2025 Topps Series 1" |
| year | integer | |
| sport | varchar(100) | default "baseball" |
| releaseDate | date | |
| baseSetSize | integer | total cards in base set |
| sourceUrl | varchar(1000) | checklist source |
| lastScrapedAt | timestamp | |
| **Unique** | | (name, year) |

**`subsets`** — Insert sets within a product
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| setProductId | fk → setProducts | not null |
| name | varchar(255) | "Future Stars", "Real One Autographs" |
| subsetType | varchar(50) | "base" / "insert" / "autograph" / "relic" |
| numberingPattern | varchar(100) | "90A-*" for regex matching |
| totalCards | integer | |
| isAutograph, isRelic | boolean | |

**`referenceCards`** — Master checklist entries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| setProductId | fk → setProducts | not null |
| subsetId | fk → subsets | |
| cardNumber | varchar(50) | as printed on card |
| playerName | varchar(255) | |
| team | varchar(255) | |
| isRookieCard, isAutograph, isRelic, isShortPrint | boolean | |
| **Unique** | | (setProductId, cardNumber) |
| **Indexes** | | (cardNumber), (playerName) |

**`parallelTypes`** — Variant definitions per product
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| setProductId, subsetId | fk | |
| name | varchar(255) | "Gold /2025", "Red Refractor /75" |
| printRun | integer | 2025, 75, 1, etc. |
| serialNumbered | boolean | |

#### Pricing & Market Data

**`priceEstimates`** — Cached card valuation (one per card)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cardId | fk → cards | unique, cascade delete |
| estimatedValueUsd, estimatedValueCad | numeric(10,2) | |
| confidence | varchar(20) | "high" / "medium" / "low" |
| sampleSize | integer | # comps used |
| priceTrend | varchar(20) | "up" / "down" / "stable" |
| trendPercentage | numeric(6,2) | % change |
| lastUpdated | timestamp | |

**`priceHistory`** — Individual comp sales
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cardId | fk → cards | cascade delete |
| sourceId | fk → priceSources | |
| priceUsd, priceCad | numeric(10,2) | |
| currencyRate | numeric(10,6) | |
| saleDate | timestamp | |
| listingUrl | varchar(1000) | clickable link |
| listingTitle | varchar(500) | for match context |
| matchScore | integer | 0-100 relevance |
| condition | varchar(50) | |
| graded | boolean | |
| grade | varchar(20) | |
| **Indexes** | | (cardId, sourceId, saleDate), (saleDate) |

**`priceSources`** — Vendor registry
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(100) | unique — "130point.com", "eBay Active" |
| baseUrl | varchar(500) | |
| scraperType | varchar(50) | "api" or "html" |
| active | boolean | |

**`pricingJobs`** — Worker queue (PostgreSQL-based)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cardId | fk → cards | cascade delete |
| jobType | varchar(50) | "price_lookup" / "price_refresh" |
| status | varchar(20) | "pending" / "running" / "completed" / "failed" |
| priority | integer | higher = first (default 0) |
| payload | jsonb | CardPricePayload with search params |
| result | jsonb | completion result |
| errorMessage | text | |
| errorCount | integer | default 0 |
| maxRetries | integer | default 3 |
| lockedAt | timestamp | distributed lock |
| lockedBy | varchar(100) | worker-{pid} |
| scheduledFor | timestamp | default now |
| completedAt | timestamp | |
| **Indexes** | | (status, priority, scheduledFor), (cardId), (lockedAt) |

**`currencyRates`** — Exchange rate tracking
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| fromCurrency, toCurrency | varchar(3) | "USD" → "CAD" |
| rate | numeric(10,6) | |
| recordedAt | timestamp | |

#### Supporting Tables

**`scanSessions`** — Scan analytics
- id, status, photoUrl, aiProvider, aiResponse (jsonb), identifiedCardId, confidenceScore, processingTimeMs

**`alerts`** — Price threshold notifications
- id, alertType, entityType, entityId, message, thresholdValue, triggeredValue, isRead

**`userSettings`** — Per-user config (single row for now)
- id, province (for tax), updateFrequency, alertThreshold, preferences (jsonb)

**`tags`** + **`cardTags`** — Tagging/collections system
- Tags have name + color; junction table links cards to tags (cascade delete)

**`vendors`** + **`vendorProducts`** + **`vendorPriceHistory`** — Wax product deal tracking
- Track sealed product prices across vendors with landed cost (CAD) calculation

### Database Job Queue

The pricing engine uses PostgreSQL as a job queue (no Redis/SQS):
- Jobs claimed via `FOR UPDATE SKIP LOCKED` (safe concurrent access)
- Stale lock recovery: jobs locked > 10 minutes are reclaimed
- Exponential backoff on failures: 30s → 60s → 120s
- Max 3 retries before permanent failure
- Worker ID: `worker-{process.pid}`

### Schema exports (packages/db/src/index.ts)
```typescript
export { db } from "./drizzle-client"
export * from "./schema/cards"
export * from "./schema/players"
export * from "./schema/sets"
export * from "./schema/manufacturers"
export * from "./schema/photos"
export * from "./schema/prices"
export * from "./schema/pricing-jobs"
export * from "./schema/alerts"
export * from "./schema/currency"
export * from "./schema/scan-sessions"
export * from "./schema/reference"
export * from "./schema/vendors"
export * from "./schema/settings"
export * from "./schema/tags"
export { enqueuePriceLookup } from "./jobs"
```

---

## 3. Web Application (apps/web)

### Tech Stack
| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.3 |
| UI Library | React | 19 |
| Styling | Tailwind CSS | 4.1 |
| Components | Radix UI (via Shadcn) | various |
| Icons | Lucide React | latest |
| Validation | Zod | 4.3 |
| ORM | Drizzle | 0.38.4 |
| AI | @google/genai | latest |
| Storage | @google-cloud/storage | 7.19 |
| Scraping | Cheerio | latest |

### Application Routes

| Route | Type | Purpose |
|-------|------|---------|
| `/` | Server | Dashboard — stats grid, recent pulls, top holdings |
| `/cards` | Server | Binder — card grid with filters, pagination, sort |
| `/cards/new` | Client | Manual card entry form |
| `/cards/[id]` | Server | Card detail — photo, metadata, comps, tags, grade |
| `/cards/[id]/edit` | Client | Edit card fields |
| `/scan` | Client | AI scanner — dual camera capture, Gemini identification |
| `/prices` | Server | Portfolio — aggregate value, top cards, movers, comps |
| `/vendors` | Server | Wax product deal tracking |
| `/settings` | Client | User preferences (province, update freq, alerts) |
| `/api/export` | API GET | CSV/JSON export with filter params |
| `/api/health` | API GET | DB health check endpoint |

### Server Actions (apps/web/src/actions/)

#### cards.ts (Core CRUD)
- `createCard(input)` — Transactional: player/set/manufacturer find-or-create → card insert → GCS photo upload → enqueue pricing job. Zod validated.
- `updateCard(cardId, input)` — Transactional update with cascading entity upserts.
- `deleteCard(id)` — Cascade delete via FK constraints.
- `getCards(filters?)` — Paginated (30/page), SQL-side search via `ilike()` on player name / set name / card number. Supports year, status, sort (name/year/value/created).
- `getCardById(id)` — Full detail with photos, price estimates, joins.
- `getCardComps(cardId)` — Price estimate + 15 most recent comp sales.
- `getCardPricingStatus(cardId)` — Poll pricing job state.
- `rescoutCard(cardId)` — Clear old data, re-enqueue pricing job.
- `getDashboardStats()` — Total cards + total portfolio value.

#### scanner.ts (AI Identification)
- `scanCard(formData)` — Accepts front image (required) + back (optional), max 20MB each, validates MIME types.
  - Pipeline: base64 encode → Gemini Vision scan → reference DB match → bounding box detection → scan session recording
  - Parallel execution: scan + front bounds + back bounds run concurrently via `Promise.allSettled`
  - Returns: `CardScanResponse` + crop bounds + processing time

#### portfolio.ts (Analytics)
- `getPortfolioStats()` — Aggregates: total value USD/CAD, cost basis, unrealized gain, top 5 by value (with thumbnails), biggest movers (by trend %), recent 10 comps, cards by status.

#### grading.ts (AI Condition Assessment)
- `gradeCard(cardId)` — Fetches photos from `cardPhotos`, sends to Gemini 2.5-flash with detailed PSA grading prompt.
  - 6 dimensions scored 1-10: centering, corners, edges, surface, print quality, eye appeal
  - Weighted average with cap rules (worst dimension limits overall)
  - Returns: `GradeReport` with PSA-equivalent label, confidence %, photo quality assessment
  - Stores in `cards.metadata.gradeReport`
- `getCardGradeReport(cardId)` — Retrieve cached report from metadata.

#### tags.ts
- Full CRUD: `getTags()`, `createTag(name, color)`, `deleteTag(tagId)`, `getCardTags(cardId)`, `addTagToCard()`, `removeTagFromCard()`

#### settings.ts
- `getSettings()` / `saveSettings(data)` — Zod-validated user preferences.

### AI Integration (apps/web/src/lib/ai/)

#### Gemini Client (gemini.ts)
- **Singleton pattern:** `getGemini()` returns cached `GoogleGenAI` instance
- **Model:** `gemini-2.5-flash` for all operations
- **Card scanning:** structured JSON mode (`responseMimeType: "application/json"`)
- **Bounding box detection:** `box_2d` object detection with 4-5% padding
- **Grading:** long-form prompt with PSA scoring rules, free-text response parsed to JSON

#### Prompts (prompts.ts)
- `CARD_SCAN_SYSTEM_PROMPT` — 150+ line encyclopedic prompt covering:
  - Manufacturer identification (Topps, Bowman, Panini, Upper Deck, etc.)
  - Set identification with series numbers
  - Year detection priority: copyright > front print > design match > NOT career timeline
  - Parallel detection: shimmer, serial numbers, color variants, autographs, relics
  - Condition assessment: centering ratios, corner/edge/surface defects
  - Output: strict 20+ field JSON schema

#### Reference Matcher (reference-matcher.ts)
- `matchAgainstReference(aiResult)` — queries `referenceCards` by card number + year
- Fallback: loose card number match (if only 1 result)
- `applyReferenceCorrections(aiResult, match)` — merges reference data, flags `_aiCorrected`

### Cloud Storage (lib/gcs.ts)
- **Bucket:** `gs://holdsworth-card-photos` (public read)
- `uploadCardPhoto(dataUrl, cardId, photoType)` — parses data URL → uploads buffer to GCS → returns public URL
  - Path: `cards/{cardId}/{front|back}-{timestamp}.{ext}`
- `deleteCardPhotos(cardId)` — deletes all files with prefix `cards/{cardId}/`

### Validation (lib/validators.ts)
- `createCardSchema` — Zod schema for card creation (field lengths, types, ranges)
- `settingsSchema` — Zod schema for user settings (enum for updateFrequency, range for threshold)

### Component Architecture

#### Layout
- `AppShell` — Main wrapper with sidebar navigation
- `Sidebar` — Fixed nav with links: Home, Binder, Pull, Portfolio, Vendors, Settings
- `Header` — Page-level title + action buttons

#### Card Components
- `CardGridItem` — Binder thumbnail card (image, name, set, value, trend, context menu)
- `CardFilters` — Search bar + year/status/sort dropdowns (URL-driven state)
- `CardComps` — Market data display (estimate card + scrollable comp table with source links)
- `CardGrade` — AI grading report (6-dimension bar chart, PSA label, confidence, detailed breakdown)
- `CardTags` — Tag pills with add/remove/create UI
- `DeleteCardButton` — Confirmation dialog for card removal

#### UI Primitives (Shadcn/Radix)
Button, Card, Input, Badge, Dialog, Select, DropdownMenu, Tabs, Tooltip, Toast

### Loading States
Skeleton loading components for: Home, Binder, Card Detail, Portfolio

---

## 4. Pricing Engine / Scraper (apps/scraper)

### Tech Stack
- **Runtime:** Node.js via `tsx` (TypeScript executor with watch mode)
- **Scraping:** Cheerio (HTML parsing), native fetch
- **AI:** Google Gemini 2.5-flash (semantic re-scoring)
- **Database:** Same Drizzle ORM / pg connection as web app

### Architecture: Job Queue + Worker

```
┌─────────────────────────────────────────────────────┐
│  Web App                                             │
│  createCard → enqueuePriceLookup(cardId, payload)    │
│  rescoutCard → clear old + re-enqueue                │
└──────────────────────┬──────────────────────────────┘
                       │ INSERT INTO pricingJobs
                       ▼
┌─────────────────────────────────────────────────────┐
│  PostgreSQL (pricingJobs table)                      │
│  status: pending → running → completed/failed        │
│  FOR UPDATE SKIP LOCKED (concurrent safe)            │
└──────────────────────┬──────────────────────────────┘
                       │ Poll every 5 seconds
                       ▼
┌─────────────────────────────────────────────────────┐
│  Scraper Worker (apps/scraper)                       │
│                                                      │
│  1. claimJob() — lock row                            │
│  2. handlePriceLookup(jobId, cardId, payload)        │
│     a. Build search query                            │
│     b. Scrape 130point (POST → HTML parse)           │
│     c. Scrape eBay (OAuth → Browse API)              │
│     d. Pre-filter: multi-dimension scoring (55+)     │
│     e. Gemini re-score (semantic analysis)           │
│     f. Calculate trend vs previous estimate          │
│     g. Upsert priceEstimates                         │
│     h. Store top 20 comps in priceHistory            │
│  3. completeJob() or failJob()                       │
│                                                      │
│  Startup: recoverStaleLocks + updateCurrencyRates    │
│  Interval: currency update every 24 hours            │
└─────────────────────────────────────────────────────┘
```

### Pricing Pipeline Detail

#### Step 1: Query Building (query-builder.ts)
- Primary: `"{playerName} {year} {setName} #{cardNumber}"`
- Fallback: `"{playerName} {year} {manufacturer}"` if card # search fails
- Special handling: autographs, relics, subsets

#### Step 2: 130point Scraping (scrape-130point.ts)
- POST to `https://back.130point.com/sales/`
- Params: query, type=1, sort=EndTimeSoonest, tz=America/Toronto
- Cheerio parses HTML table rows
- Extracts: title, price, sale date, image URL
- Detects "best offer accepted" via `#auctionLabel` element + `propsData` Best Offer Price field

#### Step 3: eBay Browse API (scrape-ebay-api.ts)
- OAuth2 client credentials flow (token cached)
- `GET https://api.ebay.com/buy/browse/v1/item_summary/search`
- Params: q, category_ids=213 (sports cards), limit=20, sort=BEST_MATCH
- Returns: title, price (USD), condition, URL, image

#### Step 4: Multi-Dimension Scoring Matrix
Scores each comp listing 0-100:

| Dimension | Points | Notes |
|-----------|--------|-------|
| Card # match | 25 | Strongest signal |
| Player full name | 15 | |
| Player last name only | 8 | Fallback |
| Year | 10 | |
| Set/product | 8 | |
| Manufacturer | 4 | |
| Insert/subset | 5 | |
| Autograph match | 5 | Penalty if mismatch |
| Rookie match | 3 | |
| Condition type | 5 | Graded vs raw |
| Recency | 5 | Recent sales weighted |
| Clean listing | 5 | No lots, no best offer |
| Completeness bonus | 5 | If 7+ dimensions hit |

**Disqualifiers:** Lot/bundle (-30 pts), Best Offer (-25 pts)
**Parallel multiplier:** base × numbered (0.15-0.40), base × color (0.50), parallel mismatch (0.35)
**Include threshold:** 55+, High confidence: 75+

#### Step 5: Gemini Semantic Re-scoring
- Sends card description + top 25 listings to Gemini 2.5-flash
- Prompt: "Identify only listings matching EXACT parallel + condition type"
- Returns: low/mid/high USD estimate, confidence level
- Filters listings by Gemini's match assessment

#### Step 6: Price Estimation
- Uses Gemini's mid estimate, or falls back to scoring-matrix filtered median
- Confidence: high (10+ comps), medium (5-9), low (<5)
- Trend: compares new vs previous estimate: >= +5% = "up", <= -5% = "down", else "stable"
- Stores in `priceEstimates` (upsert on cardId)
- Top 20 comps stored in `priceHistory` with source, match score, URL, title

#### Currency Handler (currency-update.ts)
- Fetches from `https://v6.exchangerate-api.com/v6/{key}/latest/USD`
- Stores in `currencyRates` table
- `getUsdToCad()` reads latest, falls back to 1.38
- Runs on startup + every 24 hours

---

## 5. AI Grading System (Current State)

### How It Works
1. Fetches card photos from `cardPhotos` table
2. Sends front image (+ optional back) to Gemini 2.5-flash
3. Long prompt with PSA grading standards (scoring rules, cap rules, dimension weights)
4. Returns structured grade report

### Grading Dimensions (PSA-style)
| Dimension | Weight | What It Assesses |
|-----------|--------|-----------------|
| Centering | 15% | L/R and T/B border ratios |
| Corners | 25% | All 4 corners: sharp → dinged → bent |
| Edges | 20% | All 4 edges: clean → chipping → heavy wear |
| Surface | 25% | Scratches, creases, staining, print defects |
| Print Quality | 10% | Registration, focus, ink coverage |
| Eye Appeal | 5% | Overall visual impression |

### Cap Rules
- If any dimension ≤ 5 → overall cannot exceed dimension + 2
- If any dimension ≤ 3 → overall cannot exceed dimension + 1

### Limitations (Current)
- **Single-source assessment:** Only Gemini Vision — no specialized image analysis tools
- **Photo quality dependency:** Low-res photos reduce confidence but no image enhancement
- **No centering measurement tool:** Gemini estimates centering visually, not precisely
- **No surface analysis tooling:** Cannot detect micro-scratches or print defects at scale
- **No back assessment workflow:** Back photo is optional and secondary
- **No grade aggregation:** Individual card grades exist but no collection-level quality metrics
- **No community benchmarking:** No way to compare library quality across users

---

## 6. Infrastructure & Deployment

### Current Environment
| Service | Provider | Details |
|---------|----------|---------|
| Database | Google Cloud SQL | PostgreSQL, us-central1 |
| Photo Storage | Google Cloud Storage | `holdsworth-card-photos` bucket, public read |
| AI | Google AI (Gemini) | `gemini-2.5-flash` via @google/genai SDK |
| Web Host | Local dev | Next.js dev server on :3000 |
| Scraper | Local dev | tsx watch process |
| eBay API | eBay Developer | Browse API v1, OAuth2 |
| Currency | ExchangeRate API | Free tier, daily updates |

### Environment Variables
```
DATABASE_URL=postgresql://holdsworth_app:***@localhost:5432/holdsworth
GOOGLE_AI_API_KEY=***           # Gemini Vision + text
EBAY_APP_ID=***                 # eBay OAuth client ID
EBAY_CERT_ID=***                # eBay OAuth client secret
EXCHANGERATE_API_KEY=***        # Currency rates (optional)
```

### What's Missing
- **No Docker/containerization** — runs directly on local machine
- **No CI/CD** — no automated testing, linting, or deployment
- **No authentication** — single-user, no login
- **No rate limiting** — API routes and server actions are unprotected
- **No error monitoring** — console.log only, no Sentry/LogRocket
- **No CDN** — GCS public URLs served directly
- **No caching layer** — no Redis, ISR, or CDN-level caching
- **No backup strategy** — Cloud SQL automated backups assumed but not configured
- **No staging environment** — dev only

---

## 7. Data Flow Diagrams

### Card Scanning → Cataloguing → Pricing
```
User opens /scan
    │
    ▼
Capture front photo (camera or upload)
    │ Optional: capture back photo
    ▼
Client-side preprocessing
    ├── Compress to max 1000px width
    ├── Convert to JPEG/WebP
    └── Send as FormData to scanCard()
    │
    ▼
scanCard() server action
    ├── [Parallel] Gemini Vision identification
    ├── [Parallel] Gemini bounding box detection (front)
    └── [Parallel] Gemini bounding box detection (back)
    │
    ▼
Reference matcher
    ├── Query referenceCards by (cardNumber, year)
    ├── Correct set name, subset, variant flags
    └── Set _aiCorrected = true
    │
    ▼
Return to client: CardScanResponse + bounds
    │
    ▼
User reviews + edits fields on scan result screen
    │
    ▼
handleCatalogue() → createCard() server action
    ├── [Transaction] Find/create player, manufacturer, set
    ├── [Transaction] Insert card row
    ├── [Transaction] Upload photos to GCS, insert cardPhotos
    └── enqueuePriceLookup(cardId, payload)
    │
    ▼
Scraper worker picks up job (5s poll)
    ├── Scrape 130point + eBay
    ├── Score + filter comps
    ├── Gemini semantic re-score
    ├── Upsert priceEstimate
    └── Store comps in priceHistory
    │
    ▼
Frontend polls getCardPricingStatus()
    └── Shows estimate + comps when complete
```

### AI Grading Flow
```
User clicks "Grade Card" on /cards/[id]
    │
    ▼
gradeCard(cardId) server action
    ├── Fetch photos from cardPhotos table
    ├── Convert to base64 via fetch
    ├── Send to Gemini 2.5-flash with PSA prompt
    ├── Parse JSON response
    ├── Calculate overall grade (weighted + caps)
    ├── Store in cards.metadata.gradeReport
    └── Update cards.condition + conditionNotes
    │
    ▼
Client receives GradeReport
    └── Renders 6-dimension bar chart + PSA label
```

---

## 8. Design System

### Brand: Holdsworth
- **Theme:** Dark mode only (burgundy + charcoal)
- **Primary:** `#8B2252` (burgundy) — used for accents, links, values
- **Light burgundy:** hover states, highlights
- **Green:** `var(--color-green-light)` — positive trends, gains
- **Background:** Charcoal with card components in slightly lighter shade

### Typography
| Role | Font | Usage |
|------|------|-------|
| Display | DM Serif Display | Page titles, card names, section headers |
| Body | Karla | Body text, descriptions |
| Mono | IBM Plex Mono | Prices, card numbers, metadata, labels |

### Component Patterns
- **Labels:** `font-mono text-[10px] tracking-wider uppercase text-muted-foreground`
- **Values:** `text-sm text-white` or `text-[var(--color-burg-light)]` for prices
- **Cards:** Shadcn Card with dark background, subtle border
- **Badges:** Small, rounded, for RC/Auto/Graded indicators
- **Interactive:** Hover reveals (context menus, detail toggles)

---

## 9. Known Technical Debt & Gaps

### Architecture
1. **No authentication/multi-tenancy** — Single user, no user ID on any table
2. **No API layer** — Server actions only, no REST/GraphQL for external consumption
3. **No WebSocket/SSE** — Pricing status uses polling instead of push
4. **Scraper runs as separate process** — No shared deployment, manual restart needed
5. **No background job dashboard** — Can't see queue depth, failure rates, etc.

### Data
6. **No data validation on scraper output** — Trust cheerio parsing without sanity checks
7. **Currency rate hardcoded fallback** — If API fails, uses stale 1.38 rate
8. **No deduplication** — Same card can be added multiple times without warning
9. **Reference DB is sparse** — Only 2025 Topps Series 1 seeded

### Performance
10. **No database connection pooling config** — Default pg pool settings
11. **No query optimization** — Several N+1 patterns in getCards joins
12. **Photo URLs may be data: URIs** — GCS upload failures leave massive base64 strings in DB
13. **No image optimization pipeline** — Original photos served as-is, no responsive sizes
14. **No pagination on comps** — All 15 comps loaded at once

### Security
15. **No input sanitization beyond Zod** — Server actions trust client data
16. **No CORS/CSP headers configured** — Next.js defaults only
17. **No rate limiting on scan/grade** — Could exhaust Gemini quota
18. **GCS bucket is publicly readable** — Anyone with URL can access photos
19. **Database credentials in .env** — No secrets management

### UX
20. **No offline support** — No service worker, no PWA manifest
21. **No onboarding flow** — New users see empty states without guidance
22. **No undo for delete** — Card deletion is immediate and permanent
23. **No bulk operations** — Can't multi-select, tag, or delete cards
24. **No keyboard navigation** — No shortcuts for power users
25. **No accessibility audit** — No ARIA labels, screen reader support untested

---

## 10. Dependency Inventory

### Web App (apps/web/package.json)
```
next: 15.3
react / react-dom: 19
@google/genai: latest
@google-cloud/storage: 7.19
@radix-ui/*: various (dialog, dropdown, select, slot, tabs, tooltip)
cheerio: latest
class-variance-authority: latest
clsx: latest
drizzle-orm: 0.38.4
lucide-react: latest
tailwind-merge: latest
tailwindcss: 4.1
typescript: 5.7
zod: 4.3
```

### Scraper (apps/scraper/package.json)
```
@google/genai: latest
cheerio: latest
drizzle-orm: 0.38.4
pg: latest
tsx: latest (dev dependency, runtime)
```

### Database (packages/db/package.json)
```
drizzle-orm: 0.38.4
drizzle-kit: latest (dev)
pg: latest
```

---

## 11. Questions for Enhancement Review

1. **Grading Enhancement:** What GCP Vision API features (object detection, image properties, OCR) could supplement Gemini for more precise centering measurement, surface analysis, and corner sharpness assessment? What about Cloud Vision's `CROP_HINTS` or `IMAGE_PROPERTIES` for photo quality improvement?

2. **Collection Quality Metrics:** How should aggregate quality scores work? Average grade across all cards? Weighted by value? Should there be per-team, per-set, per-year breakdowns? What gamification elements (achievements, streaks, leaderboards) would drive community engagement?

3. **Scalability:** Current PostgreSQL job queue works for single-user. What's the right migration path for multi-tenant? Cloud Tasks? Pub/Sub? What about connection pooling (PgBouncer)?

4. **Image Pipeline:** Should we add Cloud Vision API for image enhancement before grading? Auto-crop, color correction, resolution upscaling? What about generating multiple sizes (thumbnail, display, original) on upload?

5. **Community Features:** When multi-user is added, what social features would differentiate Holdsworth? Trade offers? Collection comparisons? Market-maker matching? Price prediction models?

6. **Mobile/PWA:** What's the fastest path to a mobile-native experience? PWA with camera API? React Native wrapper? What camera preprocessing would improve scan accuracy?

7. **Data Sources:** Beyond 130point and eBay, which pricing sources should be integrated? COMC? PSA cert verification? Beckett? What about Cardboard Connection for checklist data?

8. **AI Model Selection:** Is Gemini 2.5-flash the right model for all tasks? Should grading use a different (more capable) model? Should scanning use a faster/cheaper model?

---

*Report generated for Holdsworth v0.1 (pre-release) — March 2026*
