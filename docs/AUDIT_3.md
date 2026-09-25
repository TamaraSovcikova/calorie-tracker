# Whole-App Audit 3 - Post-Sharing Review

Follows `AUDIT_2.md`. That audit's blocker (per-user isolation) shipped, the
app is live and shared, and a wave of new features landed since. This pass
re-checks health, security, UI/UX, and tracks the MyFitnessPal / Nutracheck
feature ideas. Severity: **P0** blocker · **P1** important · **P2** nice ·
**P3** polish · ✅ fine.

---

## 0. Automated checks - all green

| Check | Result |
|---|---|
| `tsc` (app + worker) | ✅ pass |
| `eslint` | ✅ pass, 0 warnings |
| `vitest` | ✅ 110 tests, 10 files |
| `vite build` | ✅ builds; one chunk-size warning (see §3.5) |

---

## 1. What shipped since AUDIT_2

- **Per-user data isolation** - private sync codes, Worker scoped per user. ✅
- **"Fitbit" → "Health sync"** rename. ✅
- **Multi-portion meals** - log a batch, set portions, per-portion macros.
- **AI food facts** - Workers AI, cached in D1, free.
- **AI meal planner** - Workers AI; real macros resolved from the food DB;
  recents-aware; fits targets.
- **Weekly calorie budget** - opt-in, configurable week start, soft floor,
  un-logged/untracked days neutralised.
- **Per-ingredient macro breakdown** in the meal log.
- **Recents** raised 30 → 50.
- **Barcode scanner** double-fire fix (was draining the OFF rate limit).

Net: the app is materially more capable than at AUDIT_2 and all of Band A
shipped.

---

## 2. Security review

| # | Severity | Finding |
|---|---|---|
| 2.1 | ✅ | **Per-user isolation holds** - every sync read/write is scoped to `sha256(code)`; `meal_items` scoped through their parent meal. |
| 2.2 | **P2** | **No rate limiting on the Worker** - unchanged from AUDIT_2 §2.3, but now higher-value: a leaked sync code could spam `/api/meal-plan` and `/api/food-fact`. Cost stays **$0** (Workers AI free tier hard-stops), but it could exhaust the day's AI allowance for everyone. A simple per-token limit would harden it. |
| 2.3 | P3 | **AI endpoints derive `userId` but don't use it** (`food-fact`, `meal-plan`). Harmless - facts/plans aren't user data - but worth a per-user rate-limit hook if 2.2 is done. |
| 2.4 | ✅ | `food_facts` D1 cache is intentionally **not** user-scoped - a fact about "kiwi" is generic; no personal data, nothing leaks. |
| 2.5 | ✅ | **No SQL injection** - every statement is parameterised; table/column names come from fixed allow-lists. |
| 2.6 | ✅ | **No XSS** - React escapes everything; no `dangerouslySetInnerHTML`; AI output is rendered as plain text. |
| 2.7 | **P2** | **Health-data OAuth tokens still plaintext at rest** (AUDIT_2 §2.2) - acceptable for a private Cloudflare account, still worth a conscious note. |
| 2.8 | P3 | Bundled USDA key visible in the client bundle - known, accepted (free public-database key). |

Net: the security model is sound for a small private group. **Worker rate
limiting (2.2) is the one worthwhile hardening** now that AI endpoints exist.

---

## 3. UI / UX

| # | Severity | Issue |
|---|---|---|
| 3.1 | **P1** | **Google account picker on mobile** - connecting Health sync can land on the wrong Google account. Partly fixed this pass (a `login_hint` "preferred account" field - see below); the rest is Google Cloud Console config (test users / Workspace). |
| 3.2 | P2 | **Pet page is getting long** - dog playground + wellbeing + today + weekly-budget cards. Coherent but a lot of scroll; consider collapsing the older "Today's calories" mini-card now the diary covers it. |
| 3.3 | P2 | **AI meal planner - unresolved ingredients** become 0-macro custom foods on save; over time these can clutter "My Products". Consider a cleanup or a distinct tag. |
| 3.4 | P3 | **Dead code from the revamp persists** - `streak.ts` + `streak.test.ts` and `listLoggedDates()` in `diary.ts` are unused. Harmless; a 2-minute prune. |
| 3.5 | P3 | **Bundle size** - `index` ~560 kB and `BarcodeScanner` ~456 kB (already lazy-loaded). Fine for an installed PWA; could code-split charts/date-fns if it ever matters. |
| 3.6 | P2 | **Pet wellbeing ignores the weekly budget** - "on track" still judges the flat daily goal, not the weekly-adjusted target. Minor inconsistency for weekly-budget users. |
| 3.7 | P3 | **Food-facts toggle is device-local** (localStorage), unlike other prefs which sync. Intentional/simple, but inconsistent - worth a conscious note. |
| 3.8 | ✅ | Core flows - logging, meals, diary, the planner, weekly budget, onboarding, the pet - are coherent and behave as expected. The diary stayed lean after the weekly bar moved to the Pet page. |

---

## 4. Feature tracker - MyFitnessPal & Nutracheck ideas

Status of every idea from AUDIT_2 §4, plus what changed.

| # | Idea | Status |
|---|---|---|
| 4.1 | **Frequent foods / favourites** (was P1) | **Not built.** Recents went 30→50 which helps, but a *most-logged* list and/or a ⭐ favourite is still the single biggest un-built fast-logging win. **Recommended next.** |
| 4.2 | Food images in search/diary | Not built. P2. |
| 4.3 | Exercise / activity picker (MET-based) | Not built. P2. |
| 4.4 | Weekly digest | The **weekly budget** delivers some of this (a week view of calories). A once-a-week "here's your week" recap moment (tied to the dog) is still unbuilt. P2. |
| 4.5 | Micronutrients (fibre/sugar/sodium) | Not built. P3 - still a schema + UI change. |
| 4.6 | **AI photo logging** | Not built - **but the feasibility changed.** AUDIT_2 flagged it as needing a *paid* vision API. The app now runs on **Cloudflare Workers AI, which has free vision models** (Llama 3.2 Vision). Snap a plate → AI estimates the foods. Now a **$0** feature, same pattern as food facts / the planner. Worth promoting from "later" to a real candidate. |
| 4.7 | Community / social | Skip (5-person private app). Unchanged. |

---

## 5. Suggested next steps

**Band A - quick wins**
1. Frequent foods / favourite ⭐ (§4.1) - highest-value unbuilt feature.
2. Prune the revamp dead code (§3.4) - trivial, safe.

**Band B - worth doing**
3. Worker rate limiting per sync code (§2.2) - hardens the AI endpoints.
4. Pet wellbeing follows the weekly-adjusted target (§3.6).
5. Tidy the Pet page layout (§3.2).

**Band C - bigger / optional**
6. AI photo logging - now free via Workers AI vision (§4.6).
7. Weekly digest moment (§4.4).
8. Exercise/activity picker (§4.3); micronutrients (§4.5); food images (§4.2).

---

## Sources
- `AUDIT_2.md` (prior audit - competitor research and references).
