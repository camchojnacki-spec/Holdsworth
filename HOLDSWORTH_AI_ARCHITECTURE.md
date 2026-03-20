# Holdsworth AI & Intelligence Architecture
## Comprehensive Technical Reference for Review

**Date:** March 2026
**Stack:** Next.js 15 (App Router) · Drizzle ORM · PostgreSQL · Google Gemini 2.5 · eBay Browse API · 130point.com
**AI Provider:** Google Gemini (all models via `@google/genai` SDK)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Card Identification (Gemini Vision)](#2-card-identification)
3. [AI Grading Engine](#3-ai-grading-engine)
4. [Pricing Intelligence Pipeline](#4-pricing-intelligence-pipeline)
5. [Data Sources & Scrapers](#5-data-sources--scrapers)
6. [Known Weaknesses & Open Questions](#6-known-weaknesses--open-questions)
7. [Complete Prompt Catalog](#7-complete-prompt-catalog)

---

## 1. System Overview

### Architecture

```
┌─────────────────────────────────┐
│   User scans card (camera/upload) │
└──────────────┬──────────────────┘
               ▼
┌──────────────────────────────────┐
│  STAGE 1: Card Identification     │
│  • Gemini Vision (gemini-2.5-flash)│
│  • Front + optional back image    │
│  • Returns 42-field JSON          │
│  • Confidence score 0.0-1.0       │
└──────────────┬──────────────────┘
               ▼
┌──────────────────────────────────┐
│  STAGE 2: AI Grading (on demand)  │
│  • Centering pre-analysis call    │
│  • Main grading call (PSA-style)  │
│  • Autograph verification         │
│  • Graded vs raw recommendation   │
│  • Few-shot calibration           │
└──────────────┬──────────────────┘
               ▼
┌──────────────────────────────────┐
│  STAGE 3: Pricing Intelligence    │
│  • Query builder → search terms   │
│  • 130point scraping (sold data)  │
│  • eBay Browse API (active)       │
│  • 4-layer validation pipeline:   │
│    L1: Structural hard-kills      │
│    L2: Gemini comp validation     │
│    L3: Comparable player search   │
│    L4: Gemini price analysis      │
└──────────────────────────────────┘
```

### Gemini API Configuration

| Use Case | Model | Temperature | Max Tokens | Response Mode |
|----------|-------|-------------|------------|---------------|
| Card identification | gemini-2.5-flash | 0.1 | 4096 | application/json |
| Card bounds detection | gemini-2.5-flash | 0.5 | 512 | application/json |
| Centering pre-analysis | gemini-2.5-flash or pro | 0.1 | 512 | application/json |
| Main grading | gemini-2.5-flash or pro | 0.2 | 3072 | text (JSON extracted) |
| Comp validation | gemini-2.5-flash | 0.1 | 2048 | text (JSON extracted) |
| Comparable player suggestions | gemini-2.5-flash | 0.3 | 256 | text (JSON extracted) |
| Price analysis | gemini-2.5-flash | 0.2 | 256 | text (JSON extracted) |

### Singleton Pattern

Both the web app and scraper use singleton Gemini clients to avoid creating new instances per call:

```typescript
let _geminiClient: GoogleGenAI | null = null;
export function getGemini(): GoogleGenAI {
  if (!_geminiClient) {
    _geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return _geminiClient;
}
```

---

## 2. Card Identification

### File: `apps/web/src/lib/ai/gemini.ts` + `apps/web/src/lib/ai/prompts.ts`

### Flow

1. User captures/uploads front image (required) and back image (optional)
2. Images converted to base64
3. Both images + system prompt sent to Gemini Vision in a single call
4. Response parsed as structured JSON (42 fields)
5. Optional: reference database matching to correct AI output
6. Card stored in PostgreSQL

### Identification Protocol (8 Steps)

The system prompt instructs Gemini to follow an 8-step protocol:

**Step 1: Manufacturer & Set Identification**
- Identify manufacturer (Topps, Panini, Upper Deck, Bowman, Donruss, Fleer)
- Determine EXACT set name including series number
  - Critical distinction: "Topps Series 1" vs "Topps Series 2" vs "Topps Update" are different products
  - "Topps Chrome" vs "Topps Chrome Update" are different products
- Current date awareness: "Today's date is March 2026 — 2025 and 2026 releases exist"

**Step 2: Player Identification**
- Read player name from card face
- Use uniform number, team, photo, and era context for partially obscured names
- Note team shown (may differ from current team)

**Step 3: Card Number & Subset**
- Read card number exactly as printed (e.g., "T65-12", "RC-5", "#123")
- Identify subset/insert set membership

**Step 4: Parallel & Variant Detection**
- **This is the most value-critical field**
- Only identify parallels with CLEAR visual evidence (numbered, different border, refractor shimmer)
- DO NOT invent parallels — colored team logos are NOT parallels
- Detection targets:
  - Refractor/prizm effects (rainbow shimmer, color shifts)
  - Colored borders differing from base (Gold, Blue, Red, Green, Pink, Orange, Purple, Black)
  - Serial numbering ("/199", "/75", "/25", "/10", "/5", "/1")
  - Named variants: Refractor, Prizm, Xfractor, Gold Wave, Sapphire, Atomic, Mojo, Superfractor
  - Special stocks: Chrome, acetate, canvas, wood grain, silk
  - Autograph indicators: ink signatures, sticker autos, "Certified Autograph" labels
  - Relic/memorabilia: embedded jersey, bat pieces, patch cards

**Step 5: Rookie Card Status**
- Check for "RC" logo, "Rookie" text, rookie card symbols
- Bowman 1st cards are prospects, NOT technically RCs
- First flagship Topps/Panini base card = true RC

**Step 6: Condition Assessment**
- Centering (border ratios), corners, edges, surface
- Conservative grading — when in doubt, grade lower

**Step 7: Card Back Analysis** (when back image provided)
- Copyright year (most reliable year source)
- Card number, stats, bio, serial numbering
- Variation indicators

**Step 8: Additional Details**
- Printing errors, short prints (SP/SSP)
- Reprint/counterfeit/custom card flags
- Grading company slab detection (PSA, BGS, SGC, CGC)

### Year Identification Priority Order

1. Copyright year on card back (MOST reliable — always use if visible)
2. Year printed on card front
3. Set design matching a known year
4. NEVER guess from player career timeline alone
5. Back image copyright overrides any front-only guess

### Output Schema (42 fields)

```json
{
  "player_name": "string",
  "team": "string",
  "position": "string | null",
  "year": "number",
  "set_name": "string",
  "subset_or_insert": "string | null",
  "card_number": "string",
  "manufacturer": "string",
  "parallel_variant": "string | null",
  "serial_number": "string | null",
  "is_rookie_card": "boolean",
  "is_prospect_card": "boolean",
  "is_autograph": "boolean",
  "is_relic": "boolean",
  "is_short_print": "boolean",
  "graded": "boolean",
  "grading_company": "string | null",
  "grade": "string | null",
  "cert_number": "string | null",
  "condition_estimate": "string (Gem Mint/Mint/Near Mint/Excellent/VG/Good/Poor)",
  "centering_estimate": "string (e.g., '55/45 LR, 60/40 TB')",
  "condition_notes": "string",
  "is_authentic": "boolean",
  "authenticity_notes": "string | null",
  "confidence": "number 0.0-1.0",
  "identification_notes": "string (MANDATORY explanation if confidence < 0.7)"
}
```

### Card Bounds Detection

Separate Gemini call to detect the physical card region within the photo:

- Uses `box_2d` object detection (Gemini's native bounding box)
- Returns coordinates normalized to 0-1 scale (converted from Gemini's 0-1000 scale)
- Adds smart padding: 4% horizontal, 5% vertical (Gemini tends to clip bottom)
- Handles multiple response formats: `[{box_2d: [...]}]`, `[[y,x,y,x]]`, `[y,x,y,x]`

### Low-Confidence Enforcement

When confidence < 0.7, the server-side action (`scanner.ts`) enforces that `identification_notes` must contain an explanation. If the AI doesn't provide one, a generic explanation is injected:

```typescript
if (aiResult.confidence < 0.7 && !aiResult.identification_notes) {
  aiResult.identification_notes = "Low confidence identification. Please verify...";
}
```

---

## 3. AI Grading Engine

### File: `apps/web/src/actions/grading.ts`

### Flow

1. Fetch front (required) and back (optional) card photos from GCS/DB
2. **Centering Pre-Analysis** — dedicated Gemini call measuring border pixels
3. **Main Grading** — Gemini Vision with few-shot calibration + centering data injected
4. **Autograph Verification** — classified within main grading call
5. **Graded vs Raw Calculation** — code-based multiplier math against current raw estimate
6. Store report in card metadata JSONB column

### Few-Shot Calibration (3 Known PSA Examples)

Embedded directly in the grading prompt to anchor the AI's scale:

**PSA 10 (Gem Mint) — 2022 Topps Chrome Julio Rodriguez RC #200:**
- Centering: 50/50 LR, 51/49 TB — perfect
- Corners: All four razor sharp, zero wear
- Edges: All clean, no chipping whatsoever
- Surface: Pristine chrome finish, zero scratches
- "This is the standard — anything less than this is NOT a 10"

**PSA 8 (NM-MT) — 2019 Topps Update Pete Alonso RC #US198:**
- Centering: 62/38 LR, 55/45 TB — noticeably off-center
- Corners: Three sharp, one slight touch (barely visible)
- Edges: Two tiny white chips on left edge
- Surface: One very faint hairline scratch
- "The centering alone (62/38) limits this to PSA 8 territory"

**PSA 6 (EX-MT) — 1987 Topps Barry Bonds RC #320:**
- Centering: 55/45 LR, 58/42 TB — acceptable
- Corners: Two sharp, one fuzzy, one slightly dinged
- Edges: Minor chipping on three edges
- Surface: Light wax stain, two hairline scratches
- "The dinged corner caps this at 6"

### Centering Pre-Analysis (PR-009)

Dedicated Gemini call BEFORE main grading for precise border measurement:

**Prompt instructs:**
1. Identify printed area boundary (design meets border)
2. Measure border width on each side in relative pixel units
3. Calculate LR and TB ratios
4. Determine maximum PSA grade allowed by centering:
   - 55/45 or better → PSA 10 eligible
   - 60/40 or better → PSA 9 eligible
   - 65/35 or better → PSA 8 eligible
   - 70/30 or better → PSA 7 eligible
   - Worse than 70/30 → PSA 6 or below

The centering data is then injected into the main grading prompt so the grading model uses precise measurements instead of estimating.

### Grading Dimensions & Weights

| Dimension | Weight | Max Impact |
|-----------|--------|------------|
| Centering | 15% | 55/45+ = PSA 10, 60/40 = PSA 9, 65/35 = PSA 8 |
| Corners | 25% | 1 fuzzy caps at PSA 8, 1 dinged caps at PSA 6 |
| Edges | 20% | Any chipping caps at PSA 8, moderate = PSA 6 |
| Surface | 25% | Any crease (even hairline) caps at PSA 8, visible crease = PSA 5 |
| Print Quality | 10% | Off-registration, focus issues |
| Eye Appeal | 5% | Overall visual presentation |

**Grade Cap Rules:**
- If any dimension ≤ 5, overall cannot exceed that dimension + 2
- If any dimension ≤ 3, overall cannot exceed that dimension + 1
- Conservative approach: "when in doubt, grade lower"

### Autograph Verification (B-023)

Classified within the grading call:

| Type | Description | Value Impact |
|------|-------------|-------------|
| ink | Hand-signed directly on card surface | Highest value |
| sticker | Signed on separate sticker affixed to card | Lower than ink |
| cut | Cut signature from another source, embedded | Variable |
| facsimile | Printed/stamped signature (NOT real auto) | No value add |
| none | No autograph present | N/A |

**Key rule:** Facsimile signatures are NOT real autographs — `is_autograph` must be `false`.

### Graded vs Raw Price Split (B-008)

Code-based calculation after grading:

**PSA Grade Multipliers over Raw Value:**

| PSA Grade | Multiplier | Example ($10 raw card) |
|-----------|-----------|----------------------|
| PSA 10 | 3.5x | $35.00 |
| PSA 9 | 1.8x | $18.00 |
| PSA 8 | 1.2x | $12.00 |
| PSA 7 | 0.95x | $9.50 |
| PSA 6 | 0.75x | $7.50 |
| PSA 5 | 0.60x | $6.00 |
| PSA 4 | 0.45x | $4.50 |
| PSA 3 | 0.35x | $3.50 |
| PSA 2 | 0.25x | $2.50 |
| PSA 1 | 0.15x | $1.50 |

**PSA Submission Cost Tiers:**

| Card Raw Value | Grading Cost |
|---------------|-------------|
| < $100 | $20 (Economy) |
| $100-$199 | $35 |
| $200-$499 | $50 |
| $500+ | $75 |

**Net Benefit = (Raw × Multiplier) - Raw - Grading Cost**

Recommendation thresholds:
- Grade ≥ 9 AND net benefit > $10 → "Worth grading"
- Grade ≥ 8 AND net benefit > $5 → "Marginal"
- Grade ≥ 8 AND net benefit ≤ $5 → "Not worth the cost"
- Below that → "Do not grade"

### Configurable Models (B-041)

| Model | ID | Use Case |
|-------|-----|---------|
| Standard (default) | gemini-2.5-flash | Fast, good for most cards |
| Premium | gemini-2.5-pro | Higher accuracy, slower |

User can toggle in the UI. Model ID stored in the grade report.

---

## 4. Pricing Intelligence Pipeline

### File: `apps/scraper/src/handlers/price-lookup.ts`

### Pipeline Overview

```
CardPricePayload
    ▼
buildSearchQueries() → ["2025 Topps Series 1 46 Henderson Gold Parallel", ...]
    ▼
┌── scrape130Point(query) → sold listings with prices/dates/eBay URLs
│   └── POST to https://back.130point.com/sales/ (HTML → Cheerio parse)
│
├── scrapeEbayApi(query) → active listings with prices/URLs
│   └── GET https://api.ebay.com/buy/browse/v1/item_summary/search
    ▼
LAYER 1: Structural Hard-Kills (code, instant, zero tolerance)
    ▼
LAYER 2: Gemini Comp Validation (AI classifies each listing)
    ▼
LAYER 3: Comparable Player Search (AI fallback when comps sparse)
    ▼
LAYER 4: Gemini Price Analysis (AI estimates fair market value)
    ▼
LAYER 5: Dead Link Verification (HEAD-request URLs, nullify expired links)
    ▼
Store: priceEstimates + priceHistory tables
```

### LAYER 1: Structural Hard-Kills

Binary rules that immediately reject a listing. No amount of keyword matches can overcome these.

| Rule | Logic | Rationale |
|------|-------|-----------|
| **Player name missing** | Player last name not in listing title | If the player isn't mentioned, it's a different card |
| **Year mismatch (>1yr)** | Listing mentions a year >1 away from the card | A 2025 card ≠ 2023 card. ±1 year is allowed with -10 penalty (sets span years, seller typos) |
| **Novelty/parody set** | Title contains known novelty set names | "Texas Taters" is not "Topps Series 1" |
| **Lot/bundle** | Title contains lot indicators | Price is for multiple cards, not one |
| **Graded vs raw mismatch** | Card is raw but listing is graded (or vice versa) | Huge value difference |
| **Autograph mismatch** | Card is auto but listing isn't (or vice versa) | Huge value difference |

**Blocked Novelty/Parody Sets:**
- Texas Taters, Garbage Pail Kids, Wacky Packages, Mars Attacks
- Topps Project 2020, Project70, Topps Now, Topps Living, Topps X
- Reprints, replicas, facsimiles, art cards, sketch cards, printing plates

**Lot/Bundle Indicators:**
- "lot", "bundle", "x2/x3/x4/x5", "lot of", "card lot", "team lot"
- "you pick", "pick your", "base set", "complete set", "full set"

### LAYER 1B: Two-Phase Scoring (survivors of hard-kills)

After hard-kills, remaining listings get a two-phase score:

**Phase 1: Raw keyword score (0-85 max)**

| Factor | Points | Notes |
|--------|--------|-------|
| Full player name (first + last) | +25 | Both names found in title |
| Last name only | +10 | Already confirmed by hard-kill |
| Year exact match | +15 | Card year found in title |
| Year ±1 year | -10 | Adjacent year penalty (not killed) |
| Card number match | +15 | Number variants checked |
| Set keyword match | +15 (proportional) | Each matching set word scores proportionally |
| Best offer | -30 | Price unreliable — heavy penalty |

**Phase 2: Multiplicative parallel factor**

The core fix for wrong-parallel pricing: instead of additive penalties (which high-scoring cards can overcome), wrong parallels are multiplied down.

`Final Score = (raw × multiplier) + bonus`

| Scenario | Multiplier | Bonus | Example: raw 85 → final |
|----------|-----------|-------|------------------------|
| Base card, listing is base | 1.0 | +15 | **100** ✓ |
| Base card, listing /1-25 | 0.15 | 0 | **13** ✗ |
| Base card, listing /26-99 | 0.25 | 0 | **21** ✗ |
| Base card, listing /100-199 | 0.4 | 0 | **34** ✗ |
| Base card, listing color parallel (unnumbered) | 0.5 | 0 | **42** ✗ |
| Specific parallel, listing matches | 1.0 | +15 | **100** ✓ |
| Specific parallel, listing doesn't match | 0.35 | 0 | **30** ✗ |

**Threshold: 55** (listings below this are excluded before Gemini validation)

### LAYER 2: Gemini Comp Validation

**The key intelligence layer.** Sends batch of surviving listing titles to Gemini for semantic classification.

**Prompt structure:**
```
MY CARD:
Player: Gunnar Henderson
Year: 2025
Set: Topps Series 1
Parallel: Gold Parallel
[etc.]

LISTINGS TO VALIDATE:
1. "$38.36 — 2025 Topps Series 2 Texas Taters 46/50 Gold Foil #409 MLB" [ebay-active]
2. "$141.95 — 2025 Topps Series 1 Gunnar Henderson Black Parallel /10" [130point]
3. "$7.50 — 2025 Topps Series 1 Gunnar Henderson #65 Gold /2025" [130point]
...
```

**Classification rules given to Gemini:**

| Verdict | Criteria |
|---------|---------|
| **exact** | Same player, same set/product line, same year, same parallel type, same condition category |
| **close** | Same player but different parallel, year, or condition type — useful as reference |
| **wrong** | Different card entirely — wrong set, novelty/parody, different player, lot/bundle |

**Specific rules in the prompt:**
1. "Topps Series 1" ≠ "Texas Taters" even if same player
2. Different numbered parallels are "close" not "exact" (e.g., /50 vs base)
3. Graded vs raw = "close" not "exact"
4. Different years = "close" not "exact"
5. Autograph vs non-autograph = "wrong" (huge value difference)
6. Different inserts within same product = "close" not "exact"
7. Lots and bundles = "wrong"
8. Best Offer listings = "close" at best

**Score adjustments after validation:**
- "exact" → score boosted to minimum 85
- "close" → score capped at 65
- "wrong" → excluded

**Fallback when Gemini fails to return parseable JSON:**
- Strip markdown code fences
- Try array extraction, full JSON parse, individual object regex
- If all fail, apply strict keyword threshold (65) instead of keeping all

### LAYER 3: Comparable Player Search

**Triggers when:** Fewer than 5 **exact** sold comps from Layer 2. (Previously was <3 total, which never triggered for popular players with many "close" matches.)

**Process:**
1. Ask Gemini for 3-4 comparable players at similar market value tier
2. For each player, search 130point with exact same set/year/parallel
3. Listings prefixed with "[Comp: Player Name]" in the UI
4. Scored at 60 (moderate confidence)
5. Max 6 comparable comps added

**Gemini prompt:**
```
Suggest 3-4 players who are at a SIMILAR market value tier as Gunnar Henderson.
Consider: similar position, career stage, prospect/star status.
Would trade for roughly the same value in the same set/parallel.
```

### LAYER 4: Gemini Price Analysis

Final Gemini call that estimates fair market value from the validated comps.

**Input structure separates comps by quality:**
```
EXACT MATCHES (same card):
  1. $7.50 — "2025 Topps Series 1 Henderson #65 Gold /2025" [130point, 2026-01-15]

CLOSE MATCHES (reference only):
  1. $141.95 — "2025 Topps Series 1 Henderson Black Parallel /10" [130point, 2026-03-19]

COMPARABLE PLAYER COMPS (different player, same set/parallel):
  1. $6.00 — "[Comp: Bobby Witt Jr] 2025 Topps Series 1 Witt #23 Gold /2025" [130point]
```

**Pricing rules in prompt:**
1. Exact matches are primary basis
2. Close matches are secondary reference — discounted weight
3. Comparable player comps are sanity check only
4. Weight recent sales more heavily
5. Ignore outliers
6. Note low confidence if only close/comparable matches

**Output:** `{"low": X, "mid": Y, "high": Z}`
- "mid" = what a buyer would reasonably pay today

### LAYER 5: Dead Link Verification

Before storing comps, HEAD-requests the top 20 listing URLs to detect expired eBay links.

**Process:**
- Only checks 130point/sold links (eBay active links are current)
- 3-second timeout per URL, all checks run in parallel via `Promise.allSettled`
- Dead link detection: HTTP 404, eBay error/help page redirect, 5xx errors
- Dead URLs are nullified (set to empty string) so UI doesn't show broken links
- Timeouts/network errors are NOT treated as dead (link might just be slow)

**Rationale:** 130point URLs point to eBay item pages, which expire after ~90 days. Without this check, users click links that go to eBay error pages.

### Confidence Calculation

```
if (exactCount >= 5 && avgMatchScore >= 70) → "high"
if (exactCount >= 3 && avgMatchScore >= 60) → "high"
if (exactCount >= 2 || (exact >= 1 && close >= 2)) → "medium"
else → "low"
```

### Price Trend Calculation

Compares current estimate to previous estimate in DB:
- ≥ +5% → "up"
- ≤ -5% → "down"
- Otherwise → "stable"

### Currency Conversion

Real-time USD→CAD rate fetched at job start. Stored per-comp for historical accuracy. Fallback: 1.38 if API fails.

---

## 5. Data Sources & Scrapers

### 130point.com (Sold Listings)

**File:** `apps/scraper/src/scrapers/scrape-130point.ts`

- **Endpoint:** `POST https://back.130point.com/sales/`
- **Method:** Form-encoded POST with Cheerio HTML parsing
- **Data:** Real eBay sold data (prices, dates, eBay item URLs)
- **Best Offer Detection:** Checks `#auctionLabel` for "best offer" text + `props-data` for "Best Offer Price:" field
- **Rate:** No explicit rate limiting (single requests per job)

**Request body:**
```
query=2025+Topps+Series+1+Gunnar+Henderson+Gold
type=1
tab_id=1
tz=America/Toronto
sort=EndTimeSoonest
```

**Parsed per listing:**
- Title (from `#titleText a`)
- Price (from `data-price` attribute on `tr`)
- Date (from `#dateText`, parsed to ISO)
- URL (eBay item link from `href`)
- Image URL (from `#imgCol img`)
- Sale type ("best_offer" if detected)

### eBay Browse API (Active Listings)

**File:** `apps/scraper/src/scrapers/scrape-ebay-api.ts`

- **Endpoint:** `GET https://api.ebay.com/buy/browse/v1/item_summary/search`
- **Auth:** OAuth2 client credentials (`appId:certId` → base64 → token)
- **Token cache:** Cached with 5-minute buffer before expiry
- **Category:** 213 (Trading Cards)
- **Limit:** 20 results per query
- **Sort:** BEST_MATCH
- **Marketplace:** EBAY_US

### Query Builder

**File:** `apps/scraper/src/scrapers/query-builder.ts`

Builds 6 progressively-broader query variants from card data:

1. **Most specific:** `{year} {set|manufacturer} {cardNumber} {player} {auto} {parallel}`
2. **Set + parallel:** `{year} {setName} {player} {auto} {parallel}`
3. **Set only (no parallel):** `{year} {setName} {player} {auto}` — finds base card comps
4. **Insert/subset:** `{year} {insert} {player} {auto}`
5. **Broadest:** `{year} {player} {auto} {manufacturer}`
6. **Graded-specific:** `{year} {set|manufacturer} {player} {gradingCompany} {grade}`

Player names are Unicode-normalized (accents removed) for search compatibility.
Queries are deduplicated before returning.

### Worker Architecture

**File:** `apps/scraper/src/worker.ts`

- PostgreSQL-based job queue with `FOR UPDATE SKIP LOCKED` for atomic claim
- Recovers stale locks (>10 min old) from crashed workers
- Exponential backoff on retry: 30s → 60s → 120s
- Max retries: 3
- Single worker process with `tsx watch` for hot-reloading

---

## 6. Known Weaknesses & Open Questions

### Card Identification Issues

1. **Year guessing:** Gemini sometimes guesses the year from player career instead of reading copyright. Back image significantly improves accuracy but isn't always provided.
2. **Parallel hallucination:** AI occasionally invents parallels that don't exist (e.g., calling a standard border a "Gold" parallel). The prompt explicitly warns against this but it still happens.
3. **Set confusion:** "Topps Series 1" vs "Topps Series 2" vs "Topps Chrome" can be confused when the design is similar. Series number isn't always visible.
4. **Insert set identification:** Minor insert sets (e.g., "Fan Favorites", "Future Stars") are sometimes missed or misidentified.
5. **Custom/novelty cards:** The system can be fooled by high-quality custom cards that look authentic.

### Grading Issues

1. **Photo-dependent accuracy:** Grading quality is directly proportional to photo quality. Low-res photos produce unreliable grades.
2. **Surface defects under-detected:** Hairline scratches and wax stains are often invisible in photos.
3. **Back condition unknown:** Most scans only have front photos, so back condition can't be assessed.
4. **Chrome/refractor reflections:** Reflective card surfaces cause inconsistent grading due to lighting effects.
5. **Centering measurement precision:** Even with the pre-analysis call, border measurement from photos is approximate at best.

### Pricing Issues

1. **Search query limitations:** The query builder constructs keyword strings, but 130point's search doesn't support structured queries (set name + parallel name as separate fields).
2. **Parallel discrimination:** Even with hard-kills and Gemini validation, distinguishing between similar parallels ("/2025 Gold" vs "/50 Gold" vs "Gold Foil") remains difficult.
3. **Card number vs card number in parallel context:** Card #46 in a listing title might be the card number OR a print run number ("/46").
4. **Best Offer price unreliability:** 130point shows the listing price, not the accepted offer price. A "$100" listing accepted at "$60" shows as a "$100" comp.
5. **Comparable player accuracy:** Gemini's player tier suggestions are subjective. A "comparable" player might be worth 2-5x more or less.
6. **130point link expiration:** Individual eBay sold item URLs expire after ~90 days but are still the best available link.
7. **eBay API limitations:** Browse API only returns active listings (not sold). Sold data comes exclusively from 130point scraping.
8. **Single data source for sold comps:** 130point is the only sold data source. If their site changes or goes down, pricing stops working.

### Architectural Gaps

1. **No card reference database:** No structured database of all sets, their cards, print runs, and known parallels. Would dramatically improve both identification and pricing accuracy.
2. **No image-to-image comparison:** Comps are matched by text title only. Image comparison (e.g., "does this listing photo show a Gold card?") would catch text mismatches.
3. **No historical price modeling:** No trend analysis, seasonal patterns, or price prediction. Each lookup is independent.
4. **No cross-source price validation:** If 130point shows $5 and eBay active shows $50, there's no reconciliation logic.
5. **No community data:** No crowd-sourced corrections, price confirmations, or identification fixes.

### Open Questions for Review Team

1. **Should we use Google Cloud Vision API** for precise centering measurement instead of Gemini Vision? Cloud Vision has object detection with pixel-level accuracy.
2. **Should we add image similarity search** (e.g., Google Vision API label/web detection) to verify that a listing photo matches the card being priced?
3. **Would a card reference database** (e.g., from Cardboard Connection, Beckett, or TCDB) significantly improve accuracy? How to maintain it?
4. **Should comparable player suggestions** be based on a structured model (WAR, prospect rankings, contract value) instead of Gemini's general knowledge?
5. **Is the 4-layer validation pipeline optimal**, or should we collapse layers (e.g., one Gemini call for both validation + pricing)?
6. **Should we add COMC, PSA, or Beckett** as additional pricing sources?
7. **Would fine-tuning a model** on card identification data improve accuracy over prompt engineering?
8. **Should the grading engine use** separate specialized models for each dimension (centering, corners, edges, surface)?

---

## 7. Complete Prompt Catalog

### Prompt 1: Card Identification System Prompt

**Used in:** `apps/web/src/lib/ai/prompts.ts` → `CARD_SCAN_SYSTEM_PROMPT`
**Called by:** `scanCardWithGemini()` in `gemini.ts`
**Model:** gemini-2.5-flash, temp 0.1, 4096 tokens, application/json

```
You are Holdsworth's card identification engine — an expert-level baseball card
appraiser with encyclopedic knowledge of every major card manufacturer, set,
insert, parallel, and variant produced from 1880 to present.

Your task: analyze the provided card image with extreme precision and extract
every identifiable detail. Treat this like a professional authentication and
cataloguing process.

[Full 8-step identification protocol as described in Section 2]

## OUTPUT FORMAT
Return ONLY valid JSON matching this exact schema...
{42-field JSON schema}
```

### Prompt 2: Card Bounds Detection

**Used in:** `apps/web/src/lib/ai/gemini.ts` → `detectCardBounds()`
**Model:** gemini-2.5-flash, temp 0.5, 512 tokens, application/json

```
Detect the trading card in this image. Return bounding boxes as a JSON array.
Each entry has "box_2d" (array of [ymin, xmin, ymax, xmax] as integers 0-1000)
and "label". Never return masks or code fencing.
```

### Prompt 3: Centering Pre-Analysis

**Used in:** `apps/web/src/actions/grading.ts` → `CENTERING_PREANALYSIS_PROMPT`
**Model:** gemini-2.5-flash or pro, temp 0.1, 512 tokens, application/json

```
Analyze the centering of this baseball card with extreme precision.

TASK: Measure the border widths on all four sides and calculate centering ratios.

INSTRUCTIONS:
1. Identify the card's printed area boundary
2. Measure the border width on each side in relative pixel units
3. Calculate Left-Right ratio: left / (left + right), expressed as XX/YY
4. Calculate Top-Bottom ratio: top / (top + bottom), expressed as XX/YY
5. Determine the maximum PSA grade this centering allows:
   - 55/45 or better → PSA 10 eligible
   - 60/40 or better → PSA 9 eligible
   - 65/35 or better → PSA 8 eligible
   - 70/30 or better → PSA 7 eligible
   - Worse than 70/30 → PSA 6 or below

Return ONLY valid JSON: {leftBorderPx, rightBorderPx, topBorderPx, bottomBorderPx,
leftRightRatio, topBottomRatio, maxGradeForCentering}
```

### Prompt 4: Main Grading

**Used in:** `apps/web/src/actions/grading.ts` → `GRADING_PROMPT`
**Model:** gemini-2.5-flash or pro, temp 0.2, 3072 tokens

```
You are Holdsworth's AI Card Grading Engine — a professional-grade condition
assessor trained on tens of thousands of PSA, BGS, and SGC graded cards.

[3 Few-Shot Calibration Examples — PSA 10, 8, 6]

## GRADING PROTOCOL
[7 sections: Centering, Corners, Edges, Surface, Print Quality, Eye Appeal, Autograph Analysis]

## SCORING RULES
- Weighted average: Centering 15%, Corners 25%, Edges 20%, Surface 25%, Print 10%, Eye Appeal 5%
- Grade caps for low dimensions
- Conservative approach

## OUTPUT
Return JSON with overallGrade, confidence, dimensions{centering, corners, edges,
surface, printQuality, eyeAppeal}, autographAnalysis, gradingNotes, psaLikelihood
```

### Prompt 5: Comp Validation

**Used in:** `apps/scraper/src/handlers/price-lookup.ts` → `validateCompsWithGemini()`
**Model:** gemini-2.5-flash, temp 0.1, 2048 tokens

```
You are a baseball card identification expert. I need you to validate whether
each listing below is actually the SAME card as mine, or a different card entirely.

MY CARD:
[Card details: player, year, set, manufacturer, card number, parallel, auto, graded]

LISTINGS TO VALIDATE:
[Numbered list of listing titles with prices, sources, dates]

For EACH listing, classify as: "exact", "close", or "wrong"

[8 classification rules]

Return JSON array: [{"index": 1, "verdict": "exact|close|wrong", "reason": "..."}]
```

### Prompt 6: Comparable Player Suggestions

**Used in:** `apps/scraper/src/handlers/price-lookup.ts` → `findComparablePlayerComps()`
**Model:** gemini-2.5-flash, temp 0.3, 256 tokens

```
You are a baseball card market expert. I need comparable players for pricing a card.

CARD: {playerName} — {year} {setName} {parallelVariant}

Suggest 3-4 players who are at a SIMILAR market value tier as {playerName}.
Consider: similar position, career stage, prospect/star status.
Would trade for roughly the same value in the same set/parallel.

Return ONLY a JSON array of player names: ["Bobby Witt Jr", "Julio Rodriguez"]
```

### Prompt 7: Price Analysis

**Used in:** `apps/scraper/src/handlers/price-lookup.ts` → `analyzeWithGemini()`
**Model:** gemini-2.5-flash, temp 0.2, 256 tokens

```
You are a baseball card market analyst. Analyze these validated comparable
sales and estimate fair market value.

MY EXACT CARD: {cardDesc}

EXACT MATCHES (same card):
[listings]

CLOSE MATCHES (reference only):
[listings]

COMPARABLE PLAYER COMPS (different player, same set/parallel):
[listings]

STATS: Avg ${avg} | Median ${median} | Low ${low} | High ${high}

PRICING RULES:
1. Exact matches are primary basis
2. Close matches are secondary — discount significantly
3. Comparable player comps are sanity check only
4. Weight recent sales more heavily
5. Ignore outliers

Return JSON: {"low": 0, "mid": 0, "high": 0}
```

---

*End of document. This covers all AI prompts, scoring logic, validation rules, and architectural decisions in the Holdsworth pricing and identification system as of March 2026.*
