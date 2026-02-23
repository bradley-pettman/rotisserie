# Feature: Live Search in Recipes List

## Overview

The `/recipes` page currently requires users to type a search term and click the "Search" button to filter recipes. This triggers a full page navigation with `?search=` query params, which feels sluggish and dated.

This feature replaces the submit-to-search pattern with live filtering — results update as the user types, with no button click required. The implementation should use debounced URL parameter updates to trigger React Router loader re-fetches, keeping the server as the source of truth and preserving SSR compatibility.

## Requirements

- Typing into the search input on `/recipes` filters the recipe list automatically without clicking a submit button.
- Search requests are debounced by 300ms to avoid excessive server calls.
- The URL search params (`?search=...`) update as the user types, so the current search is shareable and bookmarkable.
- The browser back/forward buttons work correctly with search history entries.
- Clearing the search input (backspacing to empty) immediately shows all recipes.
- The existing tag filter continues to work alongside live search (both filters apply simultaneously).
- The existing view toggle (`cards`/`table`) is preserved through search interactions.
- A loading indicator is shown while a search request is in-flight (e.g., subtle spinner or opacity change on the results area).
- The "Search" submit button is removed since it is no longer needed.
- The `<Form method="get">` wrapper around the search input is removed or replaced with a plain `<div>`, since form submission is no longer the interaction model.

## Non-functional Requirements

- **Progressive enhancement**: If JavaScript fails to load, the search input should still work via the existing form submission as a fallback. Keep a visually-hidden submit button or use `<noscript>` to retain the form-based flow.
- **Performance**: Debounce prevents more than ~3 requests per second during typing. The server-side ILIKE query is already indexed-friendly for the current data scale.
- **Accessibility**: The search input retains its existing `data-testid="search-input"` attribute. The loading state is announced to screen readers via `aria-busy` on the results container.

## Acceptance Criteria

1. Given the user is on `/recipes`, when they type "chicken" into the search input, then the recipe list filters to show only recipes with "chicken" in the name within ~300ms of the last keystroke.
2. Given the user has typed a search term, when they look at the URL bar, then it contains `?search=<term>` (plus any existing params like `view` and `tags`).
3. Given the user has searched for "chicken", when they press the browser back button, then the previous search state (or no search) is restored.
4. Given the user has typed a search term, when they clear the input entirely, then all recipes are shown and the `search` param is removed from the URL.
5. Given a search request is in-flight, when the results area is visible, then a loading indicator (opacity reduction or spinner) is displayed.
6. Given the user has active tag filters, when they type a search term, then both the tag filter and search filter are applied together.
7. Given JavaScript is disabled, when the user types a search term and presses Enter, then the form submits and filters recipes (progressive enhancement fallback).
8. All existing Playwright tests continue to pass without modification.

## Context

### Current implementation

The search on `/recipes` uses a `<Form method="get">` that submits the search term as a URL query parameter. The loader in `app/features/recipes/routes/recipes.tsx` reads `?search=` and passes it to `listRecipes()` in `app/features/recipes/queries/recipes.ts`, which performs an `ILIKE` query against `recipes.name`.

### Files to modify

- **`app/features/recipes/routes/recipes.tsx`** — Replace the search `<Form>` with a controlled input that debounces URL param updates. Use React Router's `useNavigate` or `useSearchParams` setter with `replace: true` to update the URL. Add a loading indicator using `useNavigation()` state.

### Files that should NOT change

- **`app/features/recipes/queries/recipes.ts`** — The server-side query logic is already correct; it accepts a `search` filter and performs ILIKE matching.
- **`app/features/recipes/schemas/recipe.ts`** — No schema changes needed.
- **Database / migrations** — No database changes required.

### Key considerations

- Use `navigate(url, { replace: true })` for debounced updates to avoid polluting browser history with every keystroke. Only non-debounced final states should create history entries.
- The `useNavigation()` hook from React Router v7 provides `navigation.state === "loading"` which can drive the loading indicator.
- The existing `toggleTag` and `changeView` functions already use `useNavigate` and `useSearchParams` — the live search should follow the same pattern for consistency.
