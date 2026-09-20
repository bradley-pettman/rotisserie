# Native iOS frontend: scope and strategy

**Status:** decided. **Option C — native shell with authenticated web views — is the chosen
direction** (§7). Phase 0 of §9 is being implemented now; see the Decision record below for
what C constrains in Milestone 4.

**The question:** what would it take to put a native iOS client in front of Rotisserie,
and is that the right way to spend the effort?

**The short answer:** the hard part is not the iOS app. It is that the `/api/*` surface
was built for one consumer (the Python agent) and has never had to answer the questions a
UI asks. Closing that gap — plus real authentication — is roughly half the project, and
every line of it is work you need for the PWA in Milestone 5 anyway. Do that first,
decide native second, with better information than you have today.

---

## 1. What is already in your favour

Most "add a native app" projects begin by building an API. This one does not.

`app/lib/api.ts` is a deliberate, documented transport layer with a uniform envelope
(`{data}` / `{error: {status, message, details?}}`), Zod validation delegated to the
schemas that already own the rules, Postgres constraint violations translated into honest
4xx codes, and a single auth choke point. Thirteen resource routes hang off it.

More importantly, it has a **real second consumer keeping it honest.** `agent/` is a
FastAPI service whose architectural rule is "Python never writes to Postgres" — enforced
structurally, by there being no `psycopg` in `pyproject.toml` and no `DATABASE_URL` in the
package. Every read and write goes over HTTP. That service works. The seam an iOS client
needs is not theoretical; it is load-bearing today.

So the starting position is genuinely good. The gaps below are gaps in a working API, not
an API that needs inventing.

## 2. The framing that explains every gap

**The web app does not use its own API.**

React Router loaders call the query functions directly — `recipes.tsx` calls
`listRecipes()` and `getRecipeDetail()` in process; it never issues an HTTP request to
`/api/recipes`. The API's only client is the agent, and the agent only ever needed what an
LLM planning a week needs.

That single fact predicts the entire gap list. Anything the **web UI** needs that the
**agent** did not need exists as a query function reachable from a loader and has no HTTP
endpoint in front of it. An iOS app is the first client that is a UI but is not the web
app, so it inherits the union of both requirement sets — and discovers precisely the
functions that were never exposed.

This is not a criticism of the design; a JSON API that grew only the endpoints it had a
caller for is the right way to grow one. But it means the API lags the web UI by a
knowable, finite set, and that set is the scoping exercise.

## 3. The blocker: authentication

`assertApiAccess()` says so itself, at length and without flinching:

> This is NOT a finished authentication system. There are no users, no sessions, no scopes
> and no per-caller identity: one shared secret gates the whole API, and every caller that
> holds it is equally trusted.

A shared secret is fine for a server-to-server caller you control. It is unshippable in a
mobile binary. `INTERNAL_API_KEY` baked into an IPA is extractable in minutes, and it
grants full read/write over every row in the database — not a user's rows, because there
is no such concept. This is true for TestFlight as much as for the App Store.

So **Roadmap Milestone 4 (Authentication and Multi-User) is a hard prerequisite for
Milestone 5 if Milestone 5 is native.** The roadmap already sequences M4 before M5, which
was the right call for reasons that turn out to be sharper than stated.

Three things worth knowing before you design it:

- **The retrofit is scoped, by design.** The auth note promises "exactly ONE function to
  replace and exactly one call site per endpoint to keep honouring it." That promise holds
  — every loader and action calls `assertApiAccess` as its first statement, including
  `methodNotAllowedHandler`. Budget for the identity model and the data scoping, not for
  an auth retrofit spread across thirteen routes.

- **Native auth is not web auth.** The web app can use an httpOnly session cookie and be
  done. A native client needs tokens it can hold: OAuth 2.0 + PKCE via
  `ASWebAuthenticationSession`, refresh token in the Keychain, access token in memory. If
  you also want to put a `WKWebView` in front of any existing screen (option C below),
  the token has to be exchangeable for a web session — decide that up front, because
  retrofitting it is painful.

- **App Store Guideline 4.8.** If you offer any third-party social login (Google, Facebook),
  you must also offer an equivalent privacy-preserving option — in practice, Sign in with
  Apple. Email-and-password alone does not trigger it. This is a real submission gate, not
  a detail.

## 4. The API delta

Verified against the current `app/routes.ts` and the query modules. Each item names the
function that already exists in-process but has no HTTP surface.

### 4a. Missing endpoints the UI needs

| Need | Exists as | Gap |
|---|---|---|
| Ingredient vocabulary for the editor's combobox | `getAllIngredients()` | No `GET /api/ingredients`. Loader-only. |
| Unit vocabulary, incl. canonical folding | `getAllUnits()` | No `GET /api/units`. Loader-only. |
| Plan items with recipe **names** | `getMealPlanWithRecipeNames()` | `GET /api/meal-plans/:id` returns raw `recipeId`s. Only `app/routes/plan.tsx` resolves them. |
| `lastCookedAt` on a single recipe | `getRecipeDetail()` | `GET /api/recipes/:id` returns `RecipeWithDetails`, not `RecipeDetail`. The list has `?include=lastCookedAt`; the single read has no equivalent. |
| "What is planned for today?" | `findPlanCovering()` | No date filter on `GET /api/meal-plans`. This is the widget query. |
| Import a recipe from a URL | `scrapeRecipe()` | **Wired to nothing at all.** No route, no endpoint, no UI. |

The plan-names gap deserves emphasis because CLAUDE.md is explicit that the cost the
module boundary rule pushes onto callers is name resolution, and that callers must use the
batched resolver and "never call `getRecipeById` per item." An iOS planner screen hitting
`GET /api/meal-plans/:id` today gets bare UUIDs and has exactly two options: N+1 requests,
or reimplement the batching client-side. Both violate the rule the server already solved.
`?include=recipeNames` on that endpoint is a small change that keeps the rule intact
across the network boundary.

The import gap is the opposite kind of finding: `scrape-recipe.ts` is a thousand lines of
hardened, SSRF-closed, unit-tested parser that nothing can currently call. It is the
single highest-leverage endpoint on this list, and it is the one that makes the native
case (§6).

### 4b. Missing sync and caching affordances

These are what separate "an app that works on wifi" from "an app you trust in a kitchen."

- **`meal_plan_items` has no timestamps.** Verified against
  `20260919151000_create_meal_plans.sql`: no `created_at`, no `updated_at`. Delta sync for
  the planner is impossible without a migration. `recipes` has both; `cooks` has
  `created_at` and is append-only, which is sufficient.
- **No tombstones.** A deleted recipe or plan item cannot be propagated to a cache. A
  client that has seen a row has no way to learn it is gone short of a full refetch.
- **No `total` on list responses.** The envelope is a bare array, so a paginated list
  cannot show a count or size its scroll.
- **Offset pagination is unstable.** `?limit`/`?offset` over a set being written
  concurrently skips and duplicates rows. Not urgent at family scale; worth knowing before
  building infinite scroll on it.
- **No `ETag` / `If-None-Match`.** Every foreground re-downloads the whole recipe list.

### 4c. The idempotency hole — the one that corrupts data

This one matters more than the rest combined, so it gets its own section.

CLAUDE.md's **intent versus fact** rule has a direct and unobvious consequence for any
offline mutation queue:

- `PATCH /api/meal-plan-items/:id` — a move. Naturally idempotent. Safe to retry.
- `PUT /api/meal-plan-items/:itemId/fulfillments/:cookId` — idempotent **by explicit
  design**. The route comment spells it out: `ON CONFLICT DO NOTHING`, PUT chosen because
  "a repeat call is a 204 just like the first, so a retrying client needs no special case."
- `POST /api/cooks` — **not idempotent, and cannot be made so by the client.**

A cook is append-only fact. There is no PATCH, deliberately: "rewriting history is not a
supported operation." So an offline queue that retries a cook POST after an ambiguous
failure — request sent, response lost — writes a *second* cook. Nothing dedupes it,
nothing can remove it through the API except a `DELETE` the user must notice they need.

And the damage is not cosmetic. Duplicate cooks corrupt `getPlanAdherence` (you cooked 4
of 7, it reports 5), and they corrupt the `HISTORY_DAYS` window the agent uses to answer
"nothing we've had in two weeks." The one table where a retry is unsafe is the one table
whose whole job is being the truthful record.

**The fix is small:** let the client supply the cook's UUID, and make the insert
`ON CONFLICT (id) DO NOTHING` — the same shape `fulfilPlanItem` already uses, for the same
reason. A retry then collapses onto the original row. Alternatively an `Idempotency-Key`
header, but client-generated ids fit this codebase's existing habits better.

This is needed for **any** offline client. The PWA in M5 has exactly the same problem.

## 5. Two decoding traps for the Swift client

### Calendar days are not instants — and Swift will get this wrong by default

The wire format mixes two encodings, and the split is deliberate:

- `createdAt`, `updatedAt` are `Date` in TypeScript → ISO-8601 instants: `"2026-09-19T18:00:00.000Z"`
- `cookedOn`, `plannedOn`, `startsOn`, `endsOn`, `lastCookedAt` are **`'YYYY-MM-DD'` strings**

The codebase fought for that second row and documented it three times. From `cooks.ts`:

> `pg` decodes DATE into a JS Date at LOCAL midnight, so a row stored as 2026-09-19
> serializes to "2026-09-18T22:00:00.000Z" in Europe/Berlin and any client taking the
> first 10 characters reads the day before. […] This is load-bearing for meal planning.

Two consequences for Swift:

1. A `JSONDecoder` with `.dateDecodingStrategy = .iso8601` **throws** on `"2026-09-19"`.
   You will hit this on the first request that returns a cook.
2. The obvious fix — a custom strategy that accepts both formats — is *worse than the
   crash*. It parses `"2026-09-19"` into a `Date` at **device-local** midnight and
   reintroduces, on the client, the exact bug the server fixed twice. It will not crash.
   It will quietly show Tuesday's dinner on Monday for anyone west of UTC.

**Model calendar days as their own type.** A `String`-backed `CalendarDay` value type that
is never a `Date` and never gets a time zone applied to it. This carries the invariant
across the network boundary instead of dropping it there.

### Quantities

`app/db/connection.ts` registers a global `pg.types` parser so `NUMERIC` returns a JS
number, and `recipe_ingredients.quantity` is the only `NUMERIC` column. It arrives as a
JSON number. Decode as `Decimal` rather than `Double`: the column is `DECIMAL(10,2)`, and
recipe scaling (Roadmap #12) is binary-floating-point's least favourite operation.

## 6. What native actually buys you

Worth being precise, because most of the app does not benefit.

**Genuinely native-only, or dramatically better:**

1. **Share Sheet import.** Share a URL from Safari or Instagram straight into Rotisserie
   and get a pre-populated recipe. This is the strongest argument on the list, because the
   parser is *already written* — it needs an endpoint and a Share Extension, not a
   feature. Roadmap #3 and #8 have been open a long time; this is the version of them that
   people would actually use.
2. **Widgets.** "What's for dinner tonight" on the Home or Lock Screen. `findPlanCovering()`
   already answers the query.
3. **Live Activities** for cooking timers (#21) — timer on the Lock Screen and in the
   Dynamic Island while your hands are covered in flour.
4. **`isIdleTimerDisabled` for cooking mode** (#22). One line, always works. The Web Wake Lock
   API on iOS Safari is comparatively fragile.
5. **Offline that survives.** Safari's ITP evicts web storage after roughly seven days
   without a visit. A native store does not. "The recipe is there when the wifi is not" is
   a promise a PWA cannot fully make on iOS.
6. **Real push.** iOS Web Push works only for home-screen-installed PWAs and is easy for a
   user to lose by accident.

**Not improved by going native:** the recipe editor (nine fields and a repeating
ingredient row — CLAUDE.md calls this "a task, so a route", and the web does it well), the
recipe list, history, and the planner grid.

That asymmetry is what makes option C below attractive.

## 7. The options

### A. Ship the PWA — Milestone 5 as written
Installable, offline-capable, touch-optimized. Reuses every screen. No second UI codebase,
no App Store review, no second release cadence. Forgoes items 1–3 and 6 above, and makes a
weaker promise on 5.
**Rough size:** M + L, as the roadmap already estimates.

### B. Full native SwiftUI client
Every screen rebuilt in Swift against the API. Maximum polish and maximum platform
integration. Also: M4 in full, the §4 delta in full, and then a multi-month app for the
current feature set — before Milestones 3, 6 and 7 add screens that now have to be built
twice, forever.
**Rough size:** XL, plus M4 (itself L+L+M+M+M), plus the API delta.

### C. Native shell, web views for the long tail — **CHOSEN**
Native for the surfaces where native wins: today's plan, cooking mode, the Share
Extension, widgets. Authenticated `WKWebView` for the recipe editor, the planner grid and
history. You ship items 1–6 without rebuilding the form-heavy screens twice, and you can
replace any web view with a native screen later, one at a time, without a rewrite.

The catch to decide **up front**: the native auth token must be exchangeable for a web
session the `WKWebView` can use. Design the token model for this on day one or you will
not get it later.
**Rough size:** L, plus M4, plus the API delta.

### D. React Native / Expo
Worth naming because the reuse story sounds better than it is. React Router SSR loaders,
Tailwind, Radix and shadcn/ui — **none of the UI layer ports.** What you would genuinely
reuse is the Zod schemas and the TypeScript types, which is real value (the schemas are
the documented source of truth for what a valid recipe is) but is a shared *validation*
layer, not a shared *app*. The argument for D is Android. If this is iOS-only, SwiftUI is
the better tool.

## 7a. Decision record — what choosing C commits you to

Option C is the cheapest route to the native-only wins, but it is not free of
constraints, and the expensive one lands in Milestone 4 rather than in the iOS project.

**The auth model is now load-bearing, and it is decided in M4, not later.** A native shell
holding a token and a `WKWebView` needing a session are two different auth mechanisms over
one identity. The token the app holds must be exchangeable for a web session the web view
can present, or every web-view screen shows a login wall inside an app the user is already
signed in to. Concretely, M4 needs to ship:

- OAuth 2.0 + PKCE via `ASWebAuthenticationSession`, refresh token in the Keychain.
- A token-to-session exchange endpoint the app calls before loading a web view, so the
  view arrives authenticated.
- Session and token lifetimes that do not desynchronize — a web view whose cookie expires
  while the app's token is still valid is the failure mode to design against.

None of that is hard, but all of it is much harder to retrofit than to include. It is the
single thing option C asks you to get right the first time.

**Two consequences that are easy to miss:**

- **Deep links stop being a nicety.** The native shell and the web views have to hand
  navigation back and forth. `?recipe=<id>` already makes drawers addressable, which is
  most of the scheme for free — but it now has to be honoured in both directions, and a
  web view that navigates somewhere the shell should own needs intercepting.
- **The web views must be good on a phone.** Roadmap #51 (mobile-responsive navigation)
  and #58 (responsive audit) stop being PWA-milestone work and become prerequisites for
  the native app, because the recipe editor and planner grid ship *as web views* inside
  it. This is the part of M5 that survives choosing native over PWA.

**What this buys:** the form-heavy screens are never written twice, and any web view can be
replaced with a native screen later, one at a time, without a rewrite. That option value is
the reason C beats B here — Milestones 3, 6 and 7 all add screens, and under B every one of
them would be built twice forever.

## 8. How the existing architecture translates

The rules in CLAUDE.md are not web-specific, and an iOS client that ignores them will
reintroduce problems this codebase has already solved.

- **Module boundary → Swift packages.** Mirror `features/`: `RecipesKit`, `MealPlansKit`,
  `IntegrationsKit`, with the same rule — a feature package never imports a sibling, and
  cross-module code lives in the integrations package. The eslint rule has no Swift
  equivalent, but SwiftPM target dependencies enforce it structurally, which is stronger.
- **Intent versus fact → the mutation queue.** Covered in §4c. Plan items are mutable
  intentions and safe to retry; cooks are append-only fact and are not.
- **Drawers → sheets.** "A drawer is for ONE decision made against the context behind it.
  A page is for a task." That rule transfers unchanged. `compact`/`default`/`wide` in
  `drawer.tsx` maps onto `.presentationDetents`.
- **Drawer state in the URL → deep links.** `?recipe=<id>` already makes every drawer
  addressable. That is most of a Universal Links scheme for free, and it is what lets a
  widget tap open the right screen.
- **Ingredient canonicalization stays on the server.** Lowercase-and-trimmed is enforced
  by a CHECK constraint, and `capitalizeIngredientName` is presentation-only. The Swift
  client applies the same rule at render time and never sends a capitalized name. This is
  the agent's "Python never writes to Postgres" rule wearing a different hat: the client
  that reimplements a server rule is the client that drifts from it.

## 9. Suggested sequencing

**Phase 0 — unconditional.** Do this whichever client you build; every option needs it,
and the agent gets better immediately.

| Work | Size | Also needed by |
|---|---|---|
| Cook idempotency (client-supplied id, `ON CONFLICT DO NOTHING`) | S | PWA, agent retries |
| `GET /api/ingredients`, `GET /api/units` | S | any non-web editor |
| `?include=recipeNames` on `GET /api/meal-plans/:id` | S | PWA, agent |
| `?include=lastCookedAt` on `GET /api/recipes/:id` | XS | consistency with the list |
| `GET /api/meal-plans?covering=<date>` | S | widgets, agent, home screen |
| `POST /api/recipes/import` over `scrapeRecipe()` | M | **unblocks Roadmap #3 / #8** |
| `meal_plan_items` timestamps + tombstones | M | any offline client |
| `total` in list envelopes, `ETag` on reads | S | any offline client |

Note what this list is: it is not iOS work. It is the API catching up with the web UI, and
it closes two long-open roadmap issues on the way.

**Phase 1 — the gate.** Authentication (M4), designed for a native client from the start
even if you ship the PWA first: tokens rather than cookies-only, and a token-to-session
exchange if option C is live.

**Phase 2 — decide, with information.** By here you will know whether Share Sheet import
and a dinner widget are worth an XL. If yes, option C. If not, option A is already most of
the way done, because Phase 0 built its API too.

## 10. What to decide now

1. **Is the Share Sheet worth it?** One-tap import from Safari and Instagram is the one
   thing you cannot have on the web, and its parser is already written. If that plus a
   "what's for dinner" widget excites you, native is justified. If not, the PWA delivers
   most of the value for a fraction of the cost, and §6 is the honest list of what you
   would be giving up.
2. **iOS-only, or Android too?** This is the only question that makes option D competitive.
3. **Does auth move up?** It is M4 today and it gates everything here. Phase 0 does not
   need it, so the API work can start immediately either way — but nothing ships to a
   phone until it lands.

The recommendation, stated plainly: **start Phase 0 now regardless of the answer to 1–3.**
It is the only part of this whose value does not depend on the decision, it unblocks two
open roadmap issues, it fixes a data-corruption hole that already exists for the agent,
and it buys you several weeks in which to answer the native question properly.
