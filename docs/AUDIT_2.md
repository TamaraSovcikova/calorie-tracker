# Whole-App Audit — Sharing Readiness, Security, UX, Features

Written ahead of sharing the app with family + a few friends. Covers a
blocking multi-user problem, a security review, a UI/UX coherence pass, and
feature ideas drawn from MyFitnessPal & Nutracheck. **Plan only — no code
changed.** Severity: **P0** blocker · **P1** important · **P2** nice · **P3** polish.

---

## 1. CRITICAL — the app cannot support separate users yet (P0)

**This blocks sharing.** Right now every row in the app is stored under a
single user id (`currentUserId()` always returns `'local'`), and the sync
Worker returns *every* row to *anyone* holding the one shared `SYNC_TOKEN`
(`pullSince` has no `WHERE user_id` filter).

So if your sister and friends each install the app and enter the same token:
- On first sync, **everyone's diaries, weight logs, meals, pet and even
  Google-health tokens merge into one shared dataset.**
- Everyone sees everyone else's food and weight. There is no privacy and no
  separation — it's not "multi-user", it's "one shared account".

This is both a **functional blocker** (it won't work the way you want) and a
**privacy issue** (health data is personal).

### The fix — per-user data isolation

Each person gets their **own sync code** (a long random string). The code *is*
their account:
- **Worker** — derive a `user_id` from the token (e.g. a hash), and scope
  every sync query to it: `pullSince` gets `WHERE user_id = ?`; pushed rows
  are forced to that user_id. A short allowlist of valid codes (or just
  "any code = its own private space") replaces the single `SYNC_TOKEN`.
- **Client** — `currentUserId()` returns the id derived from the device's
  configured code, instead of the constant `'local'`. Every row is keyed to it.
- **Migration** — existing `'local'` rows (yours, already in D1 and on your
  devices) get rewritten to your new id in a one-time Dexie + D1 migration, so
  your current data isn't lost.

Effort: **moderate** — a focused piece touching the Worker auth/sync and the
client user-id, plus a careful one-time migration. The row schema already
carries `user_id` everywhere, which makes this tractable.

**Nothing else in this document should ship to other people before this is
done.**

---

## 2. Security review

| # | Severity | Finding |
|---|---|---|
| 2.1 | **P0** | **Shared token = shared data** — see §1. The single bearer token gives full read/write of all data to anyone who has it. |
| 2.2 | **P1** | **Google-health OAuth tokens sync in plaintext.** The `fitbit_tokens` table (access + refresh tokens) is stored unencrypted in D1 and synced. Per-user isolation (§1) stops *other users* seeing them, but they're still plaintext at rest. Acceptable for personal use given a private Cloudflare account — worth a conscious note. |
| 2.3 | P2 | **No rate limiting on the Worker.** A leaked sync code allows unbounded API calls. Low risk for a tiny private group; a simple per-token limit would harden it. |
| 2.4 | P3 | **Bundled USDA key** is visible in the client bundle. Already a known, accepted trade-off (free, rate-limited public-database key). Fine. |
| 2.5 | ✅ | **No SQL injection** — the Worker uses parameterised statements and fixed allow-lists for table/column names. |
| 2.6 | ✅ | **No XSS vectors found** — React escapes all rendered text; no `dangerouslySetInnerHTML`. |
| 2.7 | ✅ | **`/gh-api` proxy** is host-locked to `health.googleapis.com` — not an open proxy. |
| 2.8 | ✅ | **CORS `*`** is acceptable here — the bearer token is the gate, and a third-party site can't read another origin's localStorage to obtain it. |

Net: the security model is sound *for one private user*. **§1 is the only
real vulnerability**, and it's the same work as the multi-user fix.

---

## 3. UI/UX — coherence & unfinished edges

| # | Severity | Issue |
|---|---|---|
| 3.1 | **P1** | **"Fitbit" naming is stale.** The integration was rebuilt on the Google Health API, but Settings still says "Fitbit" and exercise rows show a "Fitbit" tag. Rename to "Google Health" / "Health sync" for honesty. |
| 3.2 | P2 | **Pet screen ↔ Today overlap.** The full Pet screen repeats today's calories, which the Today screen already shows. Either lean the Pet screen toward pure pet/wellbeing, or accept the small redundancy. |
| 3.3 | P2 | **Only 4 nutrients tracked** — calories, protein, carbs, fat. No fibre, sugar, sodium or saturated fat. Both MyFitnessPal and Nutracheck track more. A deliberate scope choice so far — fine to keep, but worth a conscious decision (see §4). |
| 3.4 | P3 | **Dead code from the revamp** — `streak.ts` + its test, `listLoggedDates`, and a couple of `foodSourceSettings`/`usda-api` exports are now unused (streak card and Food-sources section were removed). Harmless but should be pruned. |
| 3.5 | P3 | **Coach-tip copy** — re-read the in-app coach tips after the restructure to confirm they still describe the current screens. |
| 3.6 | P2 | **Unfinished UX-audit items** — water tracking, remembered portions, a clear net-calorie line, compact empty meal sections, and a microcopy pass were planned in `UX_AUDIT.md` and never built. Decide which still matter. |
| 3.7 | ✅ | Core flows (logging, meals, the diary, onboarding, the pet) are coherent and behave as expected after the revamp. |

---

## 4. Feature opportunities (from MyFitnessPal & Nutracheck)

What makes those apps loved — and what's realistically worth borrowing:

| # | Severity | Feature | Notes |
|---|---|---|---|
| 4.1 | **P1** | **Frequent foods / favourites** | MFP's single biggest "fast logging" win after recents. We have recents (30); add a *most-logged* list and/or a favourite ⭐ on foods. Low effort, high daily value. |
| 4.2 | P2 | **Food images in search & diary** | Nutracheck's verified DB with photos makes logging visual and fast. Open Food Facts already returns product image URLs — show thumbnails for OFF results (curated foods fall back to an icon). |
| 4.3 | P2 | **An exercise/activity picker** | Nutracheck has 1,000+ activities with calorie estimates. We only have free-text exercise + Google-health burn. A small MET-based activity list would make manual exercise logging real. |
| 4.4 | P2 | **A weekly digest** | We have a 7/14/30-day summary; a once-a-week "here's how your week went" moment (tied to the dog) would add motivation. |
| 4.5 | P3 | **Micronutrients** | See §3.3 — fibre/sugar/sodium. Larger (schema + UI). Optional. |
| 4.6 | P3 | **AI photo logging** | The headline modern feature (MFP added it in 2025). Genuinely useful but needs a paid vision API and per-photo cost — flag for "later, if you want to spend a little". |
| 4.7 | — | **Community / social** | MFP & Nutracheck lean on this; for a 5-person private app it's not worth building. Skip. |

---

## 5. Prioritised roadmap

**Band A — make sharing safe (do before sharing with anyone)**
1. Per-user data isolation — per-user sync codes, Worker user-scoping, client `user_id`, one-time migration (§1 / §2.1)
2. Rename "Fitbit" → "Health sync" everywhere (§3.1)

**Band B — fast-logging wins**
3. Frequent foods / favourite ⭐ (§4.1)
4. Food images in search + diary rows (§4.2)

**Band C — polish & finish**
5. Prune the revamp's dead code (§3.4)
6. Re-check coach-tip copy (§3.5)
7. Pick off the worthwhile leftover UX-audit items — net-calorie line, compact empty sections, water tracking (§3.6)
8. Exercise/activity picker (§4.3)
9. Weekly digest moment (§4.4)

**Later / optional**
- Micronutrient tracking (§3.3 / §4.5)
- AI photo logging (§4.6)
- Worker rate limiting (§2.3)

---

## Sources
- [MyFitnessPal review 2026 — calorie-trackers.com](https://calorie-trackers.com/reviews/myfitnesspal/)
- [Best calorie counter apps — Fortune](https://fortune.com/article/best-calorie-counter-apps/)
- [Nutracheck review UK — HomeCooks](https://home-cooks.co.uk/pages/review-nutracheck)
- [MyFitnessPal vs Nutracheck — Muscle & Macros](https://muscleandmacros.co.uk/blog/myfitnesspal-vs-nutracheck/)
