---
spec: ../SPEC-live-search.md
---

# Plan: Live Search in Recipes List

## Tasks

- [ ] <!-- id:debounced-search priority:1 deps: -->
  **Replace search form with debounced controlled input and loading indicator**
  Modify `app/features/recipes/routes/recipes.tsx` to replace the submit-to-search pattern with live filtering. All changes are in this one file:

  1. Add `useNavigation` to the `react-router` import on line 2. Add `useEffect, useCallback` to the `react` import on line 1.
  2. Add controlled state: `const [searchTerm, setSearchTerm] = useState(filters.search ?? "")`.
  3. Add a `useEffect` that syncs `searchTerm` from `filters.search` when the URL changes externally (browser back/forward): key the effect on `filters.search`.
  4. Add a debounced navigation effect: `useEffect` keyed on `searchTerm` that sets a 300ms `setTimeout`. Inside, build a `URLSearchParams` from current `searchParams`, set or delete the `search` param based on `searchTerm`, then call `navigate(\`/recipes?${params.toString()}\`, { replace: true })`. Return a cleanup that clears the timeout.
  5. Replace the `<Form method="get">` search block (lines 126-141) with a `<Form method="get" className="mb-6">` that contains: a hidden input for `view`, a conditional hidden input for `tags` (for no-JS fallback), the `<Input>` as a controlled component (`value={searchTerm}`, `onChange` sets `searchTerm`), and a `<button type="submit" className="sr-only">Search</button>` for progressive enhancement. Remove the visible `<Button type="submit">Search</Button>`.
  6. Add loading indicator: get `const navigation = useNavigation()`, derive `const isSearching = navigation.state === "loading"`. Wrap the recipe results area (empty state + cards + table, lines 190-254) in a `<div aria-busy={isSearching} className={isSearching ? "opacity-50 transition-opacity" : "transition-opacity"}>`.

  The loader, queries, and schemas must NOT be changed. Follow the same patterns as `toggleTag` and `changeView` for building URL params.

- [ ] <!-- id:e2e-tests priority:2 deps:debounced-search -->
  **Write Playwright E2E tests for live search**
  Add a new `test.describe("Live Search")` block in `tests/recipes.spec.ts`. Use the existing `createRecipe` and `createRecipeWithTag` helpers. Tests to write:

  1. **Filters as you type**: Create two recipes with distinct names (e.g., `LiveSearch Alpha ${timestamp}` and `LiveSearch Beta ${timestamp}`). Go to `/recipes`, type "Alpha" into `[data-testid="search-input"]`, wait 500ms for debounce, assert only the Alpha recipe is visible and Beta is not.
  2. **URL updates**: After typing a search term, assert `page.url()` contains `?search=Alpha` (or similar).
  3. **Clear restores all**: Clear the search input (fill with empty string), wait 500ms, assert both recipes are visible and URL no longer contains `search=`.
  4. **Works with tag filter**: Create two recipes with different tags. Select a tag, then type a search term that matches one of the tagged recipes. Verify both filters apply (only the recipe matching both tag AND search is shown).

  Use `page.waitForTimeout(500)` after typing to allow debounce + server response. Use `expect(page).toHaveURL()` with regex for URL assertions.
