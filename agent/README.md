# Rotisserie agent service

A FastAPI service that plans a week of meals from prose:

> "easy dinners, nothing we've had in two weeks, Friday is pizza night"

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

### `POST /chat`

Streams the reply over SSE (`event: start` / `thinking` / `token` / `tool_use` /
`tool_result` / `done` / `error`).

```bash
curl -N -X POST localhost:8099/chat -H 'Content-Type: application/json' \
  -d '{"message": "what is quick this week?", "conversation_id": "conv_abc"}'
```

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
- `POST /plan-week` passes **no write tools at all**. The capability is absent,
  not merely discouraged.

A client shows the draft, the human says yes, and only then does the client
re-send with `confirm_writes: true` so `save_meal_plan` can run.

---

## Tools

Each is a thin wrapper over one HTTP call. Schemas are generated from the
signatures and docstrings, so the docstrings are the interface.

| Tool | Endpoint | Notes |
|---|---|---|
| `search_recipes(search, tags, limit)` | `GET /api/recipes` | Compact rows — id, name, tags, times — never full recipes. |
| `get_recipe(recipe_id)` | `GET /api/recipes/:id` | Full recipe with ingredients and tags. |
| `get_cooking_history(days)` | `GET /api/cooks?days=N` | Answers "nothing we've had in two weeks". Returns `recipeIdsCookedInWindow` so the rule is applied on ids, not names. |
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
    ├── conversations.py   # conversation store keyed by id
    ├── errors.py          # typed SDK/API errors -> HTTP responses
    └── main.py            # FastAPI: /health, /plan-week, /chat, /catalog
```

## Model configuration

- Model `claude-opus-5`, exactly — no dated suffix.
- `thinking={"type": "adaptive"}`. **No `budget_tokens`** — removed on this
  model, and a 400 if sent.
- `output_config={"effort": ...}` — effort lives inside `output_config`.
- Tools run through the beta tool runner
  (`client.beta.messages.tool_runner`) with `@beta_async_tool`.
- `max_tokens` 16000 for the non-streaming planner; `/chat` streams.
- SDK exceptions are caught most-specific-first by type
  (`NotFoundError` → `AuthenticationError` → `RateLimitError` →
  `APIStatusError` → `APIConnectionError`); nothing matches on message text.
