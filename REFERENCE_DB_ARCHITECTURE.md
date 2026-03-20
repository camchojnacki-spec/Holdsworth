# Reference Database Architecture

**Holdsworth Card Scanner** -- Technical Architecture & Product Vision

---

## 1. Overview

The Reference Database is Holdsworth's structured knowledge layer for the trading card market. It is the canonical source of truth for what cards exist, what variants are available, and how they relate to each other. Every major feature in the application depends on it.

### What it does

The reference database stores every known card in every known set -- a master checklist of the trading card universe. When a user scans a card, the reference database is the first place Holdsworth looks before asking AI to identify anything from scratch. When the pricing engine searches for comparable sales, the reference database tells it exactly what set name, parallel variant, and print run to search for.

### Why it matters

Without reference data, card identification is a pure AI vision problem -- expensive, slow, and unreliable. With reference data, identification becomes a constrained lookup problem: read the card number off the card, find it in the database, and confirm visually. The difference is dramatic:

| Capability | Without Reference DB | With Reference DB |
|---|---|---|
| Card identification | Full Gemini vision call (~2s, $0.003) | Text extraction + DB lookup (~200ms, $0.0003) |
| Set name accuracy | AI guesses (often wrong) | Exact match from checklist |
| Parallel detection | Open-ended AI classification | Constrained dropdown of known variants |
| Pricing search queries | Vague ("2025 Topps baseball card") | Precise ("2025 Topps Series 1 #65 Gold /2025") |
| Rookie card flags | AI inference (unreliable) | Authoritative from checklist data |
| Insert identification | AI must recognize subset names | Subset/insert mapping from reference |
| Price multiplier fallback | No fallback available | Base price x known multiplier |

The reference database is the foundation for five interconnected systems:

1. **Card identification** -- matching scanned cards to known checklists
2. **Pricing accuracy** -- generating targeted search queries and validating comparables
3. **Variant detection** -- constraining parallel identification to known variants
4. **Collection management** -- linking user cards to verified reference entries
5. **Future wax product tracking** -- estimating sealed product value from insert hit rates

---

## 2. Data Model

### Entity-Relationship Diagram

```
 manufacturers
 +------------------+
 | id (PK)          |
 | name             |       set_products
 +--------+---------+       +-------------------------+
          |                 | id (PK)                 |
          +---------------->| manufacturer_id (FK)    |
                            | name                    |
                            | year                    |
                            | sport                   |
                            | release_date            |
                            | base_set_size           |
                            | source_url              |
                            | last_scraped_at         |
                            +-----+---+---+-----------+
                                  |   |   |
                 +----------------+   |   +-------------------+
                 |                    |                       |
                 v                    v                       v
          subsets                reference_cards        parallel_types
  +------------------+    +---------------------+    +---------------------+
  | id (PK)          |    | id (PK)             |    | id (PK)             |
  | set_product_id   |    | set_product_id (FK) |    | set_product_id (FK) |
  | name             |    | subset_id (FK)  ----+--->| subset_id (FK)      |
  | subset_type      |    | card_number         |    | name                |
  | numbering_pattern|    | player_name         |    | print_run           |
  | total_cards      |    | team                |    | serial_numbered     |
  | is_autograph     |    | is_rookie_card      |    | color_family        |
  | is_relic         |    | is_autograph        |    | finish_type         |
  +------------------+    | is_relic            |    | exclusive_to        |
                          | is_short_print      |    | price_multiplier    |
                          | position            |    +---------------------+
                          | jersey_number       |
                          | print_run           |
                          | image_variation     |
                          | notes               |
                          +---------+-----------+
                                    |
                                    | referenced by
                                    v
     cards (user collection)   price_history        price_estimates
     +--------------------+    +----------------+   +-------------------+
     | id (PK)            |    | id (PK)        |   | id (PK)           |
     | reference_card_id -+--->| card_id (FK)   |   | card_id (FK)      |
     | set_id (FK)        |    | source_id (FK) |   | estimated_value   |
     | player_name        |    | price_usd      |   | confidence        |
     | parallel_variant   |    | sale_date      |   | sample_size       |
     | ...                |    | listing_url    |   | price_trend       |
     +--------------------+    | match_score    |   +-------------------+
              |                +----------------+
              v
     correction_log              player_canonical
     +--------------------+      +-------------------+
     | id (PK)            |      | id (PK)           |
     | card_id (FK)       |      | canonical_name    |
     | correction_type    |      | aliases[]         |
     | field_name         |      | sport             |
     | ai_original_value  |      | position          |
     | user_corrected     |      | team              |
     | ref_matched_after  |      | market_tier       |
     +--------------------+      +-------------------+
```

### Core Hierarchy: set_products -> reference_cards -> parallel_types

The data model mirrors how the physical card market works:

**set_products** represents what you buy at the store. "2025 Topps Series 1" is a set product. It has a manufacturer, a year, a sport, and a base set size. The unique constraint on `(name, year)` prevents duplicates.

**reference_cards** represents every individual card in a set product. Card #1 Aaron Judge, Card #2 Kyle Schwarber, etc. The unique constraint on `(set_product_id, card_number)` means each card number appears exactly once per set product. Reference cards carry metadata about the card: rookie status, autograph, relic, short print, position, jersey number.

**parallel_types** represents the color/numbered variants available for cards in a set product. A single set product like "2025 Topps Series 1" might have 20+ parallel types: Gold /2025, Blue /199, Red /75, Purple /50, Black /1, etc. Each parallel type has a `print_run` (how many exist), a `color_family`, a `finish_type`, and critically, a `price_multiplier` that represents how much more valuable this parallel is compared to the base card.

### Subsets and Insert Sets

**subsets** represent distinct card subsets within a product: insert sets, autograph sets, relic sets, or subset groupings within the base set. Each subset has a `subset_type`:

| subset_type | Description | Example |
|---|---|---|
| `base` | Main base set cards | Cards #1-330 in Topps Series 1 |
| `insert` | Insert/chase cards | "1990 Topps Baseball" retro inserts |
| `autograph` | Autographed cards | On-card autograph inserts |
| `relic` | Game-used material cards | Jersey/bat relic cards |
| `sp` | Short print variations | Photo variation short prints |
| `auto` | Auto-detected subset type | Inferred from checklist data |

Both `reference_cards` and `parallel_types` can optionally belong to a subset via `subset_id`. This allows different insert sets to have different parallel structures (e.g., the autograph insert might only come in Gold /25 and Black /1, while the base set has 15 parallels).

### player_canonical and Alias Resolution

The `player_canonical` table normalizes player names across the system. A single player might appear as "Ronald Acuna Jr.", "Ronald Acuna Jr", "Ronald Acuna", or "R. Acuna Jr." on different cards and in different listings.

| Field | Purpose |
|---|---|
| `canonical_name` | The authoritative spelling (e.g., "Ronald Acuna Jr.") |
| `aliases` | Array of known alternative spellings |
| `market_tier` | Player's market value tier for comparable player matching |
| `position`, `team` | Current position and team for disambiguation |

The `market_tier` field is used by the comparable player search (Layer 3 of the pricing engine) to find players at a similar value level when exact comps are scarce.

### correction_log and Feedback Loop

Every time a user corrects an AI identification, a record is created in `correction_log`:

| Field | Purpose |
|---|---|
| `card_id` | Which scanned card was corrected |
| `correction_type` | Type of correction (e.g., "identification", "parallel") |
| `field_name` | Which field was wrong (e.g., "set_name", "parallel_variant") |
| `ai_original_value` | What the AI originally identified |
| `user_corrected_value` | What the user changed it to |
| `reference_matched_after` | Whether the correction led to a reference DB match |

This data serves two purposes:
1. **Immediate**: Corrections trigger re-pricing with the corrected identification
2. **Future**: Aggregate correction patterns reveal systematic AI failures that can be addressed with better prompts or reference data coverage

---

## 3. Card Identification Pipeline

The scan pipeline is a four-stage process that progressively narrows the identification space. Reference data is the key to skipping expensive stages.

### Stage 1: Text Extraction (Gemini Flash)

The first stage reads all visible text from the card image using Gemini 2.5 Flash with zero thinking budget and a 256-token limit. This is the cheapest possible AI call -- it does not attempt identification.

**Input:** Front image (required), back image (optional)

**Output:** `CardTextExtraction` object:
```
{
  cardNumber: "65",
  copyrightYear: 2025,
  playerNameAsWritten: "Gunnar Henderson",
  manufacturerText: "Topps",
  serialNumber: "043/199",
  otherText: ["Baltimore Orioles", "SS"]
}
```

This runs in parallel with bounding box detection for image cropping. Total time: ~300ms.

### Stage 2: Reference DB Lookup (multiPassReferenceLookup)

Using the extracted text, the system searches the reference database with three progressive strategies:

| Strategy | Query | When Used |
|---|---|---|
| Strategy 1 | `card_number` + exact `year` | Always tried first |
| Strategy 2 | `card_number` + `year +/- 1` | When Strategy 1 returns 0 results |
| Strategy 3 | `card_number` only | When Strategy 2 returns 0 results |

If manufacturer text was extracted, it is used to disambiguate multiple matches (e.g., distinguishing Topps #65 from Panini #65 in the same year).

**Result types:**

- **exact** (1 match): High confidence. Skip full vision identification entirely.
- **multiple** (2-5 matches): Need visual disambiguation from known candidates.
- **none** (0 matches): Fall through to full AI identification.

When matches are found, the system also loads all `parallel_types` for the matched set product(s). These known variants are passed to Stage 4.

### Stage 3: Constrained Visual Identification

The path taken depends on Stage 2 results:

**Exact match path** (`exact`): The reference data is trusted directly. A high-confidence result (0.95) is built from reference fields (set name, rookie status, autograph, relic, short print) combined with text extraction fields (player name, card number, serial number). No full vision AI call needed.

**Candidate disambiguation path** (`multiple`): Gemini receives the card image along with 2-5 candidate identities from the reference database. Instead of open-ended identification, it chooses which candidate matches the image. This is significantly more accurate than unconstrained identification.

**Full identification path** (`none`): Falls back to the original full Gemini vision call that identifies everything from scratch. This is the most expensive and least accurate path.

### Stage 4: Parallel Detection with Known Variants

When Stage 2 found reference matches, the system knows exactly which parallel variants exist for this set product. Instead of asking Gemini "what parallel is this?" (open-ended), it asks "which of these 20 specific parallels does this card match?" (constrained choice).

The `detectParallelConstrained` function receives:
- The card image
- The list of known parallels (name, print run, color family)
- The text extraction results (serial number is critical here)

This constrained approach eliminates hallucinated parallel names and ensures the identified variant actually exists in the set.

### Confidence Improvement with Reference Data

```
Without reference data:           With reference data:
  Stage 1: Text extraction          Stage 1: Text extraction
  Stage 2: No match (skip)          Stage 2: Exact match found
  Stage 3: Full AI identification   Stage 3: SKIPPED (reference trusted)
  Stage 4: Open-ended parallel      Stage 4: Constrained parallel detection

  Confidence: 0.70-0.85             Confidence: 0.95
  API calls: 2-3 Gemini calls       API calls: 1-2 Gemini calls
  Latency: 2-4 seconds              Latency: 0.5-1.5 seconds
  Cost: ~$0.003-0.005               Cost: ~$0.0003-0.001
```

---

## 4. Pricing Engine Integration

The pricing engine (`handlePriceLookup`) uses reference data at every stage to improve accuracy.

### Query Building with Reference Data

The `buildSearchQueries` function generates an ordered list of search queries from most specific to broadest. When reference data is available, it produces significantly better queries:

**Without reference data:**
```
1. "2025 Topps 65 Henderson Gold"         (generic manufacturer, no print run)
2. "2025 Topps Series 1 Henderson Gold"   (might have wrong set name)
3. "2025 Henderson Topps"                 (very broad)
```

**With reference data (confirmedSetProduct + confirmedParallel):**
```
1. "2025 Topps Series 1 #65 Gunnar Henderson Gold /2025"   (exact match query)
2. "2025 Topps Series 1 Gunnar Henderson Gold /2025"       (without card number)
3. "2025 Topps Series 1 Gunnar Henderson Gold"             (without print run)
4. "2025 Topps Series 1 Gunnar Henderson"                  (base card fallback)
```

The reference-enhanced queries are tried first, with standard queries serving as fallbacks.

### Multiplicative Parallel Scoring

The pre-filter uses a two-phase scoring system to match listings against the target card. Phase 1 computes a raw keyword score (0-85 max), and Phase 2 applies a multiplicative parallel factor.

**Phase 1 -- Raw Score Components:**

| Component | Points | Description |
|---|---|---|
| Full player name (first + last) | +25 | Both names present in listing title |
| Last name only | +10 | Only last name found |
| Exact year match | +15 | Year appears in listing |
| Adjacent year (+-1) | -10 | Penalty for off-by-one year |
| Card number match | +15 | Card number found in title |
| Set name keywords | +15 (proportional) | Fraction of set words matched |
| Best offer penalty | -30 | Best Offer sales have unreliable prices |
| **Raw max** | **85** | Clamped before multiplier |

**Phase 2 -- Parallel Multiplier:**

This is the critical innovation. Additive penalties cannot reliably separate wrong parallels from correct ones when the raw score is high. Multiplication ensures wrong parallels are suppressed regardless of keyword matches.

| Scenario | Multiplier | Bonus | Effect |
|---|---|---|---|
| Card is Gold /2025, listing matches "Gold" | 1.0 | +15 | Full score + bonus |
| Card is Gold /2025, listing has no parallel keywords | 0.35 | 0 | Score crushed to ~30% |
| Card is base, listing is base | 1.0 | +15 | Full score + bonus |
| Card is base, listing is /1 to /25 | 0.15 | 0 | Score crushed to ~15% |
| Card is base, listing is /26 to /99 | 0.25 | 0 | Score crushed to ~25% |
| Card is base, listing is /100 to /199 | 0.40 | 0 | Score crushed to ~40% |
| Card is base, listing has unnumbered color parallel | 0.50 | 0 | Score crushed to ~50% |

**Example calculation:**

Card: 2025 Topps Series 1 #65 Gunnar Henderson Gold /2025
Listing: "2025 Topps Series 1 Gunnar Henderson Blue /199 #65" -- $8.50

```
Phase 1 (raw score):
  Full name "Gunnar Henderson"  = +25
  Year "2025"                   = +15
  Card number "65"              = +15
  Set words "series", "1"       = +15
  Raw total                     = 70

Phase 2 (parallel multiplier):
  Card parallel keywords: ["gold"]
  Listing contains "blue" but NOT "gold"
  Multiplier: 0.35

Final score = round(70 * 0.35) + 0 = 25
Threshold = 55
Result: EXCLUDED (correct -- this is a different parallel)
```

### Gemini Comp Validation Against Reference Data

After keyword pre-filtering, surviving listings are sent to Gemini for semantic validation. Gemini classifies each listing as:

- **exact**: Same card (same player, set, year, parallel, condition type)
- **close**: Similar card but different parallel, year, or condition -- useful as reference
- **wrong**: Different card entirely (wrong set, novelty card, lot, etc.)

This catches semantic mismatches that keywords cannot detect, such as "Texas Taters" novelty cards that share player names with real Topps cards.

### Comparable Player Fallback

When fewer than 5 exact sold comps are found, Gemini suggests 3-4 comparable players at a similar market value tier. The system then searches for those players' cards with the exact same set, year, and parallel. These comps are marked with `source: "comparable"` and `aiVerdict: "close"` so the pricing analysis weights them appropriately.

### Parallel Hierarchy Bracketing

When exact comps for a specific parallel are scarce (fewer than 3), the system uses reference data to find adjacent parallels by print run and establishes a price bracket:

```
Example: Card is Purple /50

Reference DB parallel hierarchy (sorted by rarity):
  Black /1    -- too rare, skip
  Platinum /5 -- adjacent rarer (/50 should be LESS than this)
  Purple /50  -- THIS IS OUR CARD
  Red /75     -- adjacent more common (/50 should be MORE than this)
  Blue /199   -- too common, skip

Bracket search:
  Search "2025 Topps Series 1 Henderson Platinum /5" -> median $150
  Search "2025 Topps Series 1 Henderson Red /75"     -> median $25

Result: Purple /50 should be priced between $25 and $150
This bracket context is passed to Gemini's price analysis.
```

---

## 5. Dynamic Price Multipliers

### How Multipliers Work

Each `parallel_types` record has a `price_multiplier` field representing how many times more valuable that parallel is compared to a base card. For example:

| Parallel | Print Run | Multiplier | Base card = $2.00 |
|---|---|---|---|
| Base | unlimited | 1.0 | $2.00 |
| Gold | /2025 | 2.5 | $5.00 |
| Blue | /199 | 5.0 | $10.00 |
| Red | /75 | 12.0 | $24.00 |
| Purple | /50 | 20.0 | $40.00 |
| Black | /1 | 200.0 | $400.00 |

### The Multiplier Fallback

When the pricing engine cannot find any direct comps for a specific parallel (no exact or close matches survive filtering), it falls back to the multiplier:

1. Search for base card comps of the same player/set/year
2. Filter results to exclude numbered/color parallels
3. Calculate median base card price
4. Multiply by `price_multiplier` from reference data

```
Example:
  Card: 2025 Topps Series 1 #65 Henderson Magenta /25
  No direct comps found for Magenta /25

  Fallback:
    Base card median: $3.50
    Magenta /25 multiplier: 35.0
    Estimated value: $3.50 * 35.0 = $122.50 (low confidence)
```

This estimate is stored with `confidence: "low"` and `sampleSize: 0` to signal that it is derived, not observed.

### Feedback Loop

The multiplier system creates a data quality feedback loop:

```
1. User scans card
     |
2. Reference DB identifies card + parallel
     |
3. Pricing engine searches for comps
     |
4. Comps stored in price_history (with match_score)
     |
5. Estimate stored in price_estimates
     |
6. [Future] Aggregate price_history data by parallel type
     |
7. [Future] Compute observed multipliers from real sales data
     |
8. [Future] Update parallel_types.price_multiplier with computed values
     |
9. Better multiplier -> better fallback pricing -> repeat
```

### Multiplier Resolution Chain

When pricing a parallel card, the system resolves the multiplier in order:

1. **Computed multiplier** (future) -- derived from aggregated sales data
2. **Seed multiplier** -- hardcoded in seed-checklists.ts during initial data load
3. **1.0** (default) -- no multiplier data available, treated as base

---

## 6. Insert Sets & Subsets

### How Inserts Differ from Parallels

Parallels are different-colored versions of the same card. Every base card in a set has the same set of parallels available. A Gold /2025 version of card #1 and a Gold /2025 version of card #65 are different cards but the same parallel type.

Inserts are entirely separate card sets packaged within the same product. They have different designs, different card numbering, and different checklists from the base set. Insert sets may have their own parallel structure.

```
2025 Topps Series 1 (the product)
  |
  +-- Base Set (330 cards, #1-330)
  |     +-- Gold /2025
  |     +-- Blue /199
  |     +-- Red /75
  |     ...
  |
  +-- "1990 Topps Baseball" Insert (30 cards, 90A-1 through 90A-30)
  |     +-- Gold /50
  |     +-- Black /1
  |
  +-- Future Stars Insert (25 cards, FS-1 through FS-25)
  |     +-- Autograph /25
  |
  +-- Relic Insert (20 cards, R-1 through R-20)
        +-- Gold /25
        +-- Platinum /1
```

### Subset Types in the Schema

| Type | Description | Impact on Pricing |
|---|---|---|
| `base` | Main base set | Standard pricing, most comps available |
| `insert` | Chase/insert cards | Often more valuable than base, fewer comps |
| `autograph` | Autographed inserts | Significantly more valuable, grading matters |
| `relic` | Game-used material | Variable value, condition of relic matters |
| `sp` | Short print variations | Scarce, often priced 5-50x base |
| `auto` | Auto-detected type | Inferred during TCDB scraping |

### How Insert Cards Are Identified

Insert cards have distinctive numbering patterns (e.g., "90A-15", "FS-3", "R-7") that differ from the sequential base set numbering. The reference database stores the `numbering_pattern` for each subset, which helps the multi-pass lookup distinguish between a base card #15 and an insert card 90A-15.

### How Insert Cards Are Priced Differently

Insert cards require different search queries because their market names differ from base cards:

```
Base card query:   "2025 Topps Series 1 #65 Gunnar Henderson"
Insert card query: "2025 Topps 1990 Baseball Henderson"
```

The `subset_or_insert` field in the query builder ensures the insert set name is included in search queries.

### Future: Wax Product Value Estimation

Insert hit rates (how many packs/boxes you need to open to find an insert) are a critical input for estimating sealed product value. The reference database's subset structure is designed to support this:

```
Product: 2025 Topps Series 1 Hobby Box
  Base cards per box: ~330 (one complete set)
  Insert odds:
    "1990 Topps Baseball" = 1:4 packs (6 per box)
    "Future Stars" = 1:8 packs (3 per box)
    Autograph = 1 per box guaranteed
    Relic = 1 per box guaranteed

  Expected value = sum of (insert_probability * average_insert_value)
                 + base_set_value
                 + parallel_probability * average_parallel_value
```

---

## 7. Data Sources & Import

### TCDB Scraping and Import

The primary data source is The Trading Card Database (TCDB), which maintains comprehensive checklists for most products. Two import paths exist:

**Web-side import** (`reference-import.ts`): Server action available in the settings UI. Accepts a TCDB URL or set ID, scrapes the checklist via HTML parsing, and upserts into the reference database. Uses lightweight regex-based HTML parsing to avoid pulling cheerio into the web bundle.

**Scraper-side import** (`checklist-ingest.ts`): Used by the scraper service for bulk ingestion. Supports product metadata overrides when TCDB data is incomplete or unavailable.

Both paths follow the same upsert logic:
1. Resolve or create the manufacturer
2. Upsert the set product (unique on `name + year`)
3. Upsert reference cards (unique on `set_product_id + card_number`)
4. Upsert parallel types (matched by `set_product_id + name`)
5. Create subsets on-demand when subset names are encountered

### Manual Seed Data

The `seed-checklists.ts` script provides hardcoded reference data for high-priority products. This is the reliability backstop -- even when TCDB scraping fails, core products have reference data.

Currently seeded products (Tier 1):
- 2026 Topps Series 1 (100 key cards)
- 2025 Topps Series 1 (full 330-card checklist)
- 2025 Topps Series 2 (75 cards)
- 2025 Bowman (50 base + 30 Chrome prospects)
- 2025 Topps Chrome (50 cards)
- 2024 Topps Series 1, Series 2, Bowman, Chrome
- 2023 Topps Series 1, Chrome

Each seeded product includes cards with positions, jersey numbers, team names, and rookie card flags. Parallel types include print runs and seed multipliers.

### User Corrections as Implicit Data

When a user corrects an AI identification (via the Edit Identification UI), the correction is logged in `correction_log`. If the corrected values match a reference entry (`reference_matched_after = true`), this confirms the reference data is correct. If corrections consistently point to cards not in the reference database, it signals coverage gaps.

### Future Data Sources

| Source | Data Type | Status |
|---|---|---|
| TCDB checklists | Card checklists, subsets | Active |
| Manual seed data | Key products, parallels, multipliers | Active |
| User corrections | Implicit validation | Active |
| Beckett | Pricing benchmarks, pop reports | Planned |
| PSA Pop Reports | Population data for graded cards | Planned |
| Cardboard Connection | Product breakdowns, insert odds | Planned |
| Sports Card Investor | Market analytics, trending cards | Planned |

---

## 8. Collection Tracking

### How Scanned Cards Link to Reference Data

When a card is scanned and identified, the resulting `cards` record stores a `reference_card_id` FK that links it to the authoritative `reference_cards` entry. This link enables:

- **Verified set names**: The card's set name comes from the reference database, not AI guessing
- **Accurate parallel matching**: The card's `parallel_variant` is constrained to known variants
- **Pricing queries**: The pricing engine resolves the card's `reference_card_id` -> `set_product_id` -> `setProducts.name` for precise search queries
- **Collection completeness**: Users can see what percentage of a set they have

The `cards` table also stores a `set_id` FK to the user's `sets` table, which itself has a `set_product_id` FK to the reference database. This creates a second path to reference data for cards that were saved before the reference matcher was implemented.

### Verification Status

Cards progress through three trust levels:

| Status | How it happens | Confidence |
|---|---|---|
| AI identified | Scanned and identified by Gemini without reference match | Low-Medium |
| Reference matched | AI result confirmed against reference database | High |
| User corrected | User manually edited identification fields | Highest |

When a user edits a card's identification through the Edit Identification panel, the system:
1. Updates the card record with corrected values
2. Logs the correction in `correction_log`
3. Searches for matching set products and loads their parallel types
4. Presents a constrained parallel dropdown (not free-text)
5. Triggers re-pricing with the corrected identification

### Portfolio Valuation

Each card's estimated value (from `price_estimates`) can be aggregated for portfolio valuation. The confidence level of each estimate affects the portfolio confidence:

```
Portfolio value = SUM(estimated_value_usd) for all cards
Portfolio confidence:
  - High: >70% of cards have high-confidence estimates
  - Medium: >50% have medium+ confidence
  - Low: otherwise
```

Reference data improves portfolio valuation accuracy by ensuring more cards have high-confidence price estimates (more exact comps, better search queries, multiplier fallbacks).

---

## 9. Wax Product Integration (Future)

### How the Reference DB Enables Wax Value Estimation

The reference database's hierarchical structure (product -> subsets -> cards -> parallels) maps directly to sealed product composition. A sealed box is a probability distribution over the reference database.

### Product Value Calculation Model

```
Box Expected Value (EV) = Base Set Value
                        + SUM(Insert Set EV)
                        + SUM(Parallel EV)
                        + Premium Hits EV

Where:
  Base Set Value = cards_per_box * avg_base_card_value

  Insert Set EV = insert_odds_per_box * avg_insert_value_for_set
    (avg_insert_value computed from reference_cards in that subset
     linked to price_estimates)

  Parallel EV = SUM(parallel_odds * avg_parallel_value)
    (parallel_odds from product specs, avg_parallel_value from
     price_estimates with that parallel_type applied)

  Premium Hits EV = guaranteed_hits * avg_hit_value
    (e.g., 1 auto per hobby box * average autograph card value)
```

### Data Requirements

To calculate box EV, the reference database needs:

| Data | Current Status | Source |
|---|---|---|
| Full checklist per product | Partially complete | TCDB + seed data |
| Insert set checklists | Partially complete | TCDB |
| Insert odds per product | Not yet stored | Cardboard Connection |
| Parallel odds per product | Not yet stored | Manufacturer specs |
| Guaranteed hits per box type | Not yet stored | Product specifications |
| Box type definitions | Not yet stored | Hobby vs Retail vs Blaster |

### Sealed Product Price Tracking

Future schema additions would include:

```
wax_products
  - set_product_id (FK)
  - box_type (hobby, retail, blaster, mega, etc.)
  - packs_per_box
  - cards_per_pack
  - guaranteed_hits (JSON: {auto: 1, relic: 1})
  - retail_price
  - current_market_price

wax_insert_odds
  - wax_product_id (FK)
  - subset_id (FK)
  - odds_per_pack (e.g., "1:4" = 1 in 4 packs)
  - cards_per_box (derived)
```

---

## 10. Evolution Strategy

### Data Quality Feedback Loops

The system is designed to improve automatically over time through multiple feedback loops:

```
Loop 1: Identification Accuracy
  More reference data -> more exact matches -> fewer full AI calls
  -> fewer misidentifications -> fewer user corrections needed

Loop 2: Pricing Accuracy
  More reference data -> better search queries -> more exact comps
  -> higher confidence estimates -> more reliable portfolio values

Loop 3: Multiplier Calibration
  More scans -> more price_history records -> enough data to compute
  observed multipliers -> replace seed multipliers with computed ones
  -> better multiplier fallback pricing

Loop 4: Coverage Expansion
  User corrections on unmatched cards -> identify coverage gaps
  -> prioritize TCDB imports for missing products -> more coverage
```

### Community Contribution Model

User corrections create implicit community contributions:

1. **Correction mining**: When multiple users correct the same AI error pattern, it signals a systematic issue. Example: if AI consistently misidentifies "Topps Chrome" as "Topps Series 1", the text extraction prompt can be improved.

2. **Coverage voting**: Cards scanned without reference matches are implicitly "votes" for which products to import next. The most-scanned unmatched products should be prioritized for TCDB import.

3. **Multiplier refinement**: As price_history accumulates, observed price ratios between parallels can replace seed multipliers.

### Automated Checklist Expansion

Future automation for reference data expansion:

| Priority | Approach | Trigger |
|---|---|---|
| P0 | Seed data for new flagship products | Annual release schedule |
| P1 | TCDB import for user-requested products | Scan without reference match |
| P2 | Bulk TCDB import for current year products | Quarterly sweep |
| P3 | Historical product backfill | User collection patterns |

### Market Data Aggregation Over Time

The `price_history` table accumulates sales data over time. This enables:

- **Trend detection**: Is a player's card value increasing or decreasing?
- **Seasonal patterns**: Do prices spike around All-Star break or postseason?
- **Market-wide analysis**: Are vintage cards outperforming modern? Are parallels overvalued?

### Coverage Metrics and Gap Detection

Key metrics for reference database health:

| Metric | Formula | Target |
|---|---|---|
| Scan match rate | Scans with reference match / total scans | >80% |
| Exact match rate | Exact matches / total reference matches | >60% |
| Correction rate | User corrections / total scans | <10% |
| Product coverage | Products with reference data / products scanned | >90% |
| Parallel coverage | Products with parallel data / products with reference data | >70% |
| Multiplier coverage | Parallels with multipliers / total parallel types | >50% |

---

## 11. Technical Implementation

### Key Queries and Their Purpose

**Card identification lookup** (most performance-critical):
```sql
-- Strategy 1: card number + exact year
SELECT rc.*, sp.name, sp.year, m.name, s.name
FROM reference_cards rc
INNER JOIN set_products sp ON rc.set_product_id = sp.id
LEFT JOIN manufacturers m ON sp.manufacturer_id = m.id
LEFT JOIN subsets s ON rc.subset_id = s.id
WHERE rc.card_number = $1 AND sp.year = $2
```

**Parallel loading for matched set**:
```sql
SELECT name, print_run, color_family
FROM parallel_types
WHERE set_product_id = $1
```

**Reference data for pricing** (resolves card -> reference_card -> set_product -> parallels):
```sql
-- Step 1: Get card's reference link
SELECT reference_card_id, set_id, parallel_variant FROM cards WHERE id = $1

-- Step 2: Resolve set product via reference card
SELECT rc.set_product_id, sp.name, sp.year
FROM reference_cards rc
INNER JOIN set_products sp ON rc.set_product_id = sp.id
WHERE rc.id = $1

-- Step 3: Match parallel type for multiplier
SELECT name, print_run, color_family, price_multiplier
FROM parallel_types
WHERE set_product_id = $1
```

**Reference DB search** (settings page):
```sql
SELECT rc.*, sp.name, sp.year
FROM reference_cards rc
INNER JOIN set_products sp ON rc.set_product_id = sp.id
WHERE rc.player_name ILIKE $1
   OR rc.card_number ILIKE $1
   OR sp.name ILIKE $1
ORDER BY sp.year, rc.card_number
LIMIT 100
```

### Indexes and Performance

The schema defines the following indexes:

| Table | Index | Purpose |
|---|---|---|
| `set_products` | `(year)` | Fast year-based filtering |
| `set_products` | `(name, year)` UNIQUE | Deduplication on upsert |
| `subsets` | `(set_product_id)` | Load subsets for a product |
| `reference_cards` | `(set_product_id, card_number)` UNIQUE | Primary lookup + dedup |
| `reference_cards` | `(card_number)` | Cross-product card number search |
| `reference_cards` | `(player_name)` | Player name search |
| `parallel_types` | `(set_product_id)` | Load parallels for a product |
| `player_canonical` | `(canonical_name)` | Name resolution |
| `player_canonical` | `(team)` | Team-based lookup |
| `correction_log` | `(card_id)` | Corrections for a card |
| `correction_log` | `(created_at)` | Time-based correction analysis |
| `price_history` | `(card_id, source_id, sale_date)` | Price lookup by card |
| `price_history` | `(sale_date)` | Time-range queries |

The most performance-critical query is the card identification lookup (Strategy 1), which uses the `(card_number)` index on `reference_cards` combined with the `(year)` index on `set_products` via the join. For sets with thousands of cards, the unique constraint on `(set_product_id, card_number)` ensures O(1) lookup.

### Data Freshness and Staleness Management

| Data Type | Freshness Requirement | Refresh Strategy |
|---|---|---|
| Checklists | Stable after initial load | One-time TCDB import per product |
| Parallel types | Stable after product release | Updated when new parallels discovered |
| Price multipliers (seed) | Stable | Manual updates in seed data |
| Price multipliers (computed) | Monthly | Future: automated from price_history |
| `last_scraped_at` | Informational | Updated on each TCDB re-scrape |

Staleness is tracked per set product via `last_scraped_at`. Products that have never been scraped (`last_scraped_at = null`) were created from seed data and may have incomplete checklists. The `source_url` field links back to the TCDB page for re-scraping.

---

*This document describes the reference database as of March 2026. The system is designed for incremental expansion -- each new product imported, each user correction logged, and each price history record stored makes the entire system more accurate.*
