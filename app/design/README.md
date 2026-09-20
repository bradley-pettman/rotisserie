# UI redesign — three options

Three proposed shells for Rotisserie, mounted at `/design` **beside** the
current UI rather than replacing it, so the two can be clicked through side by
side. Every screen reads the real loaders and the real database. Nothing under
`/design` writes — the forms are presentational.

Start at `/design`. The switcher in the bottom-left of each shell moves between
options without going back to the index.

## Why this is being proposed

The current UI has no shell at all. Every page is an independent
`container mx-auto p-6` island with no navigation between them, which was fine
when the app was "a list of recipes and a form" and stopped being fine when the
recent work landed meal plans, the cook log, plan fulfilment and adherence.

Concretely, today:

- There is **no navigation**. `/recipes` is reachable only from the splash
  screen, and a recipe detail page's only way out is a "← Back to Recipes" link.
- There is **no meal-planning UI at all**, although `meal_plans`,
  `meal_plan_items`, `cook_fulfillments` and the whole adherence query exist and
  are exposed over the JSON API.
- **Cooking history** is a single "Log a cook" button and one date string.
- Reading a recipe **costs you the list** — its filters, its scroll position,
  and the comparison you were in the middle of making.

All three options below fix those four things. They differ in what the app
opens on, and in how much lives beside the content versus over it.

## What the options share

- A persistent left sidebar, so every surface is one click from every other.
- **Drawers instead of modals.** A modal takes the screen away and demands you
  finish or cancel. A drawer sits beside what you were reading, so the list
  keeps its scroll and its filters.
- One recipe body (`shared/recipe-body.tsx`) rendered in all three, so the
  comparison is about layout rather than about how much detail each one happens
  to show.
- The open drawer lives in the URL (`?recipe=<id>`), so it is linkable,
  survives a reload, and closes on Back.

## The options

### A — Rail & Drawer (`/design/a`)

A labelled 240px sidebar, one centred content column, and a right-hand drawer
for everything secondary. The literal reading of the brief.

- Recipe detail opens in a drawer over the list.
- The planner is a week grid; clicking an empty slot opens a compact drawer to
  assign a meal.
- **The recipe editor is a real page.** Nine fields, a repeating ingredient row
  and a tag editor do not fit a drawer without becoming a cramped page with a
  shadow on it.

Best at: reading and planning without losing your place.
Trade-off: only one recipe is visible at a time.

### B — Three-Pane Workbench (`/design/b`)

A 64px icon rail, a permanent list pane, and a detail pane that is always on
screen. Nothing overlays anything while you are reading.

- Moving between twelve recipes costs twelve clicks and no open/close.
- ↑/↓ step through the list and the detail pane follows — the pane layout
  paying for itself. Ignored while a text field has focus.
- Drawers survive here, but only for **writing** — log a cook, assign a meal.
  Reading never needs one when the detail pane is always there.

Best at: comparing and triaging a large library fast.
Trade-off: three columns get tight on a laptop, and the rail gives up its
labels to make room. The detail pane is narrower than A's drawer-plus-page.

### C — Today First (`/design/c`)

The same sidebar and the same drawers, one different bet: the app opens on
**tonight**, not on a list. Navigation is organised around time.

- Home is a Today surface: tonight's dinner in full (times, servings,
  ingredients), the rest of the week, what has not been cooked in a while, and
  what was.
- A command palette (⌘K) reaches any recipe or action from anywhere.
- The library is a card grid — somewhere you browse for an idea rather than a
  table you scan.

Best at: the daily question, which is what this app actually gets asked.
Trade-off: bulk library work is one hop further away than in A or B.

## Where the drawer/page line falls

The rule the prototypes follow:

> A drawer is for **one decision** made against the context behind it.
> A page is for a **task**.

Reading a recipe, assigning a meal, logging a cook: decisions, so drawers.
Editing a recipe: a task, so a page (see Option A's editor). The width ladder in
`shared/drawer.tsx` — `compact` / `default` / `wide` — is where that judgement
gets made; past `wide` the honest move is a route.

## Layout

```
shared/          Everything all three options render
  data.ts          Loaders. Cross-module reads go through features/integrations/
  format.ts        Calendar-day and duration formatting
  drawer.tsx       The right-hand drawer, and the width ladder
  parts.tsx        Recipe meta, tag list, ingredient list, step list, cook row
  recipe-body.tsx  The one recipe body all three render
  week.tsx         The seven-day grid, adherence, and the gaps panel
  history.tsx      Cooking history grouped by day
  editor.tsx       The recipe editor — Option A's "too big for a drawer" case
  nav.tsx          The nav model and the prototype switcher
option-a/        Rail & Drawer
option-b/        Three-Pane Workbench
option-c/        Today First
index.tsx        The chooser at /design
```

## Seeing it with data

The prototypes are only legible against a populated library:

```bash
npm run db:demo   # 12 recipes, ~30 cooks, this week's plan and last week's
```

It truncates recipes, cooks and plans first, so do not run it against anything
you care about. The seeded `ingredients` and `units` vocabulary is left alone.

## What is deliberately not built

These are shells, not a migration. Not here yet, in any option: the cooking
mode redesign, mobile layouts (the current shells assume a laptop), the import
flow, pagination, and anything that writes.
