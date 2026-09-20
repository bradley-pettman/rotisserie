# Rotisserie agent service

A FastAPI service that plans a week of meals from prose:

> "easy dinners, nothing we've had in two weeks, Friday is pizza night"

...and answers the question that comes up mid-recipe:

> "I'm out of buttermilk, what can I use?"

It talks to Claude, and it reaches Rotisserie's data **only** through the
TypeScript JSON API.

---

## The write-path rule

**Python never writes to Postgres.** Every read and every write goes through
the JSON API under `/api/*`, where the Zod schemas and the transactions already
live.

This is not a stylistic preference. `createRecipe` alone owns ingredient
canonicalization (lowercase, trimmed, against a `CHECK` constraint), unit
folding onto the seeded vocabulary, tag lowercasing, and the transaction that
snapshots a recipe's name into a cook. A Python reimplementation would be a
second copy of those rules, and a second copy drifts — this codebase has
already paid that bill once.

The enforcement is structural rather than advisory:

- there is no `psycopg` / `asyncpg` in `pyproject.toml`, and no `DATABASE_URL`
  anywhere in this package;
- `api_client.py` is the only module that performs I/O against Rotisserie, and
  every tool is a thin wrapper over one of its methods.

Reads may eventually go direct to Postgres for speed. Writes may not.

---

## Install

Requires Python 3.11+. [`uv`](https://docs.astral.sh/uv/) is what this was
built and verified with:

```bash
cd agent
uv venv
uv pip install -e .
```

Without `uv`:

```bash
cd agent
python3 -m venv .venv
.venv/bin/pip install -e .
```

## Configure

Copy `.env.example` to `.env` and edit, or set the variables in the
environment:

| Variable | Meaning |
|---|---|
| `ROTISSERIE_API_URL` | Where the TypeScript API lives. Default `http://localhost:5173`. |
| `INTERNAL_API_KEY` | Must match `INTERNAL_API_KEY` on the TypeScript side. Unset means the API is open (local development only). When set, every call carries it as `X-Api-Key`. |
| `CATALOG_TTL_SECONDS` | How long one catalog snapshot — and therefore one cached prompt prefix — is reused. Default 300. |
| `HISTORY_DAYS` | Days of cooking history placed in the prefix. Default 28. |
| `EFFORT` | `low`/`medium`/`high`/`xhigh`/`max`. Default `medium`. |

**Anthropic credentials are not configured here.** The SDK client is
constructed with no arguments and resolves credentials from the environment
(`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or an `ant auth login` profile).
There is deliberately no key parameter to thread through, and none to log.
`GET /health` reports `anthropic_credentials: resolved | missing`.

## Run

The TypeScript API must be running first:

```bash
# terminal 1 — from the repo root
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rotisserie_dev npm run dev

# terminal 2 — from agent/
.venv/bin/python -m uvicorn rotisserie_agent.main:app --port 8099
```

With `INTERNAL_API_KEY`, set the *same* value on both sides.

---

## Endpoints

### `GET /health`

Reports the model, whether Anthropic credentials resolved, whether the
Rotisserie API is reachable, and the cached catalog's age and hash. Returns
`503` when the Rotisserie API cannot be reached — a live process with a dead
dependency is not a healthy service.

### `POST /plan-week`

Prose constraints in, a structured **draft** out. It does not save.

```bash
curl -X POST localhost:8099/plan-week -H 'Content-Type: application/json' -d '{
  "constraints": "easy dinners, nothing we'\''ve had in two weeks, Friday is pizza night",
  "days": 7
}'
```

The response carries `"persisted": false` and a `constraint_check` block that
re-derives the exclusion set server-side and reports whether the draft actually
honours it — so "the two-week rule held" is checkable without reading the
model's own account of its work.

### `POST /suggest-substitution`

One ingredient, one recipe, what to use instead. It reads; it writes nothing.

```bash
curl -X POST localhost:8099/suggest-substitution -H 'Content-Type: application/json' -d '{
  "recipe_id": "c534a4ae-01b9-48e1-a44e-83818c907be6",
  "ingredient": "buttermilk",
  "reason": "dairy allergy"
}'
```

`reason` is optional prose in the household's own words — "dairy allergy",
"don't have any", "want it less spicy" — and where there is one it is treated
as a hard constraint rather than a preference.

**The recipe is the answer's context, and that is the point.** Buttermilk in a
cake is acid reacting with the baking soda and tenderness in the crumb;
buttermilk in a dressing is tang and body. The swap differs, and so does the
amount, so the model is shown this recipe's real ingredient list and its real
instructions — fetched through `get_recipe`, the same path the chat tool uses.
The instructions are included in full because heat, timing and order decide
whether a swap survives, and the ingredient list alone never says so.

The answer comes back through `output_config.format`, so a client parses it
rather than scraping prose:

| Field | |
|---|---|
| `recipe` | the recipe's own context — its real ingredients, instructions, tags and times |
| `replacing` | the ingredient row the request resolved to, with the quantity and unit the recipe calls for |
| `suggestion.role` | what that ingredient is doing *in this recipe*, and therefore what a replacement has to reproduce |
| `suggestion.candidates[]` | `name`, `quantity`, `unit`, `preparation`, `effect` (one line on what it changes about the result), `confidence`, `caveat`, `meets_constraint` |
| `suggestion.no_good_substitute` | when the honest answer is "shop, or cook something else" rather than a padded list |
| `check` | an independent audit of the answer against the recipe row |
| `context_shown_to_model` | the exact text the answer was derived from |
| `persisted` | always `false`, stated in the payload |

`check` is the same idea as `/plan-week`'s `constraint_check`: it re-reads the
recipe row and reports whether the answer is about the ingredient that was
asked about, whether it replaces the quantity the recipe actually calls for,
whether any "substitute" is the original ingredient again, whether a candidate
arrived without a quantity, and — when a reason was given — whether any
candidate is one the model itself marked as breaking it. None of that depends
on the model's account of its own work.

Two refusals happen before any model call, and are therefore free:

- `409 ingredient_not_in_recipe` and `409 ingredient_ambiguous` carry the
  recipe's real ingredient names. An exact name wins; a single partial match is
  accepted ("milk" in a recipe that has only buttermilk); a name matching
  several rows is asked about rather than guessed at, because choosing between
  "whole milk" and "coconut milk" on the user's behalf is exactly the silent
  wrong answer this feature must not give.
- `404 recipe_not_found` passes the API's own status through. This is the one
  endpoint whose id comes from the caller rather than from the catalog, so a
  404 is the caller's mistake, not a broken dependency.

It builds no catalog snapshot at all: the question is about one recipe, so the
rest of the collection cannot affect the answer and the N+1 catalog build is
never paid.

### `POST /chat`

Streams the reply over SSE (`event: start` / `thinking` / `token` / `tool_use` /
`tool_result` / `done` / `error`).

```bash
curl -N -X POST localhost:8099/chat -H 'Content-Type: application/json' \
  -d '{"message": "what is quick this week?", "conversation_id": "conv_abc"}'
```

Substitutions work conversationally too — "I'm out of buttermilk, what can I
use?" routes to the `suggest_substitution` tool, which runs the same code the
endpoint does, so the two answers cannot drift apart. The structured answer
arrives in that turn's `tool_result` event for any client that wants to parse
it rather than read the prose.

### `GET /catalog`

The exact cached system prefix, for debugging prompts and cache behaviour.

---

## Confirm before writing

A chat turn never persists anything unasked, and this is enforced in code as
well as in the prompt:

- `POST /chat` takes `confirm_writes` (default `false`). While it is false the
  write tools are not even offered to the model, and the `WriteGate` in
  `tools.py` refuses them as a second line of defence — a refusal comes back as
  a tool result telling the model to go ask the human.
- `POST /plan-week` and `POST /suggest-substitution` pass **no tools at all**.
  The capability is absent, not merely discouraged. Being out of buttermilk is
  not a reason to touch the database.

A client shows the draft, the human says yes, and only then does the client
re-send with `confirm_writes: true` so `save_meal_plan` can run.

---

## Tools

Each is a thin wrapper over one HTTP call — with one stated exception below.
Schemas are generated from the signatures and docstrings, so the docstrings are
the interface.

| Tool | Endpoint | Notes |
|---|---|---|
| `search_recipes(search, tags, limit)` | `GET /api/recipes` | Compact rows — id, name, tags, times — never full recipes. |
| `get_recipe(recipe_id)` | `GET /api/recipes/:id` | Full recipe with ingredients and tags. |
| `get_cooking_history(days)` | `GET /api/cooks?days=N` | Answers "nothing we've had in two weeks". Returns `recipeIdsCookedInWindow` so the rule is applied on ids, not names. |
| `suggest_substitution(recipe_id, ingredient, reason)` | `GET /api/recipes/:id` + one model call | The only tool that is not a wrapper over a single HTTP call: it reads the recipe, then asks the model what to use instead. It delegates to the same function `POST /suggest-substitution` calls. A read — offered on every turn, gated on nothing. |
| `save_meal_plan(...)` | `POST /api/meal-plans` | **Gated.** Posts the plan and its items in one call. |
| `log_cook(...)` | `POST /api/cooks` | **Gated.** Omitting `label` asks the API to snapshot the recipe's name. |

---

## Why there is no vector search

A family recipe collection is small enough to hand the model whole. The entire
catalog (id, name, tags, times) plus recent cooking history goes into the
**system prompt**, in a stable prefix marked
`cache_control: {"type": "ephemeral"}`.

Constraint satisfaction over a few hundred rows the model can see at once is
something it does well, and it needs no index, no ranking and no retrieval
tuning. `plan_week` is therefore a single request with no retrieval step.

Prompt caching is a **prefix match on bytes**, so the cached block contains
nothing volatile: recipes are sorted by name, cooking history is rendered with
absolute dates, and today's date and the user's constraints go into the user
turn, *after* the breakpoint. `GET /catalog` exposes `prefix_hash` — if it
changes between requests that should have matched, something volatile has
leaked into the prefix.

One snapshot is reused for `CATALOG_TTL_SECONDS`, which is also the window in
which requests can share a cache entry.

> Note: a *small* catalog will not actually cache — the minimum cacheable
> prefix is 1024–4096 tokens depending on model, and ten recipes render to
> roughly 900 tokens. The mechanism is correct and starts paying off at a
> realistic collection size.

---

## Conversation state

An in-process, TTL'd, LRU-bounded store keyed by conversation id
(`conversations.py`), held on `app.state` rather than in a module global. Each
conversation carries its own lock so two concurrent turns on one id cannot
interleave and corrupt the history.

Stated plainly: **state dies with the process and is not shared between
replicas.** That is fine for one process and wrong behind a load balancer.
Everything that assumes local storage is confined to `ConversationStore`'s four
async methods; moving to Redis or a `conversations` table means reimplementing
those and changing one line in `main.py`.

---

## Layout

```
agent/
├── pyproject.toml
├── .env.example
└── rotisserie_agent/
    ├── config.py          # settings from the environment
    ├── api_client.py      # THE seam: every call to the TS API, envelope handling
    ├── catalog.py         # catalog snapshot + the cached prefix
    ├── prompts.py         # system-prompt assembly, split at the cache breakpoint
    ├── tools.py           # the five tools + the write gate
    ├── planner.py         # plan_week: prose -> structured draft, + constraint check
    ├── substitutions.py   # suggest_substitution: one recipe -> structured swaps, + audit
    ├── conversations.py   # conversation store keyed by id
    ├── errors.py          # typed SDK/API errors -> HTTP responses
    └── main.py            # FastAPI: /health, /plan-week, /suggest-substitution, /chat, /catalog
```

## Model configuration

- Model `claude-opus-5`, exactly — no dated suffix.
- `thinking={"type": "adaptive"}`. **No `budget_tokens`** — removed on this
  model, and a 400 if sent.
- `output_config={"effort": ...}` — effort lives inside `output_config`.
- Tools run through the beta tool runner
  (`client.beta.messages.tool_runner`) with `@beta_async_tool`.
- `max_tokens` 16000 for the non-streaming paths (`plan_week`,
  `suggest_substitution`); `/chat` streams.
- Structured outputs go in `output_config.format` as a `json_schema` block,
  with every property listed in `required`, `additionalProperties: false`, and
  optionality expressed as a nullable type.
- SDK exceptions are caught most-specific-first by type
  (`NotFoundError` → `AuthenticationError` → `RateLimitError` →
  `APIStatusError` → `APIConnectionError`); nothing matches on message text.
