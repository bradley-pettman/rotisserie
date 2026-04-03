# Rotisserie Roadmap

A phased plan for building out the Rotisserie food management app. Each milestone delivers a complete, usable feature family before moving to the next. The early milestones also establish the engineering practices that make later milestones safer and faster.

---

## Milestone 0: Technical Foundation

**Goal**: Establish the engineering backbone — CI, test patterns, navigation, data integrity — so every subsequent milestone lands on solid ground.

**Why first**: Without CI catching regressions, a nav shell to hang features on, and transactional writes, each new feature area compounds technical debt. Better to pay this cost once at the start.

| Issue | Title | Size |
|-------|-------|------|
| #52 | GitHub Actions CI pipeline (typecheck + Playwright on PR) | S |
| #53 | PR template and branch protection rules | XS |
| #49 | Database transactions for multi-table writes | S |
| #51 | Mobile-responsive navigation | M |
| #50 | Pagination for list views | M |

**Deliverables**:
- Every PR runs `npm run typecheck` and `npm run test` in CI
- Branch protection requires passing checks before merge
- A persistent nav bar/menu appears on every page (Recipes now, placeholders for Meal Plans and Shopping later)
- `listRecipes` uses paginated queries; UI has page controls
- `createRecipe` and `updateRecipe` are wrapped in proper `BEGIN`/`COMMIT`/`ROLLBACK` transactions
- A reusable `withTransaction()` helper exists for future multi-table writes

**Definition of done**: You can open a PR, see green checks, merge confidently, and the app has a nav shell ready for new sections.

---

## Milestone 1: Recipe Management — Complete

**Goal**: Finish the recipe feature family end-to-end. After this milestone, recipes are a fully polished product area that you could hand to your family and say "start adding recipes."

**Why now**: Recipes are 80% done already. Finishing them first means you have a real, usable app immediately. It also establishes patterns (forms, comboboxes, "modes", E2E tests) that meal planning and grocery will reuse.

### Phase 1A: Finish in-progress work
| Issue | Title | Size |
|-------|-------|------|
| #3 | Recipe import UI | M |
| #8 | Recipe import error handling UX | S |
| #5 | Recipe import E2E tests | S |
| #22 | Cooking mode wake lock | XS |

These are nearly done — the scraper library exists, just needs UI integration. Wake lock is a tiny but high-impact fix for anyone actually cooking with the app.

### Phase 1B: Core enhancements
| Issue | Title | Size |
|-------|-------|------|
| #12 | Recipe scaling by servings | M |
| #16 | Recipe duplication | XS |
| #21 | Cooking mode timers | M |
| #23 | Structured step editor for instructions | M |
| #4 | Ingredient sort order drag-and-drop | M |

These make recipes genuinely useful day-to-day. Scaling and timers transform cooking mode from a read-only display into an interactive cooking companion.

### Phase 1C: Organization and export
| Issue | Title | Size |
|-------|-------|------|
| #19 | Recipe export / print view | S |
| #6 | Recipe categories/collections | M |
| #7 | Bulk tag management | S |

Nice-to-haves that improve the experience as recipe count grows. Lower urgency but still within the recipe family.

**Deliverables**:
- Paste a URL, get a pre-populated recipe form
- Cooking mode keeps the screen on, has step timers, and scales ingredients
- Instructions are edited as discrete steps
- Recipes can be cloned, printed, and organized into collections
- Full E2E test coverage for the import flow

**Definition of done**: A family member can import a recipe from a blog, organize it, and cook from it with the phone propped up — no pain points.

---

## Milestone 2: Meal Planning

**Goal**: Build the weekly meal planning system from scratch. This is the highest-value new feature area — it's the bridge between "recipe book" and "family food management app."

**Why now**: Meal planning is the centerpiece of the app's value proposition. It also creates the data that grocery shopping depends on (meal plan → shopping list pipeline).

### Phase 2A: Schema and core CRUD
| Issue | Title | Size |
|-------|-------|------|
| #9 | Meal plans database schema | M |
| #11 | Create meal plan | L |
| #14 | Meal plan calendar view | L |
| #15 | Meal plan list view | S |

The calendar view is the primary UI. The list view is a lightweight secondary view. Together they form the foundation.

### Phase 2B: Flexibility and usability
| Issue | Title | Size |
|-------|-------|------|
| #25 | Quick-add non-recipe meals | XS |
| #18 | Drag-and-drop meal swapping | M |
| #20 | Unassigned recipe pool | S |
| #13 | Meal plan copy/duplicate | S |

These address the real-world flexibility your family needs — not every meal is a recipe, days get swapped around, and last week's plan is often a good starting point.

### Phase 2C: Feedback loop
| Issue | Title | Size |
|-------|-------|------|
| #10 | Meal review and rating | M |
| #17 | "Last cooked" display on recipes | S |

Reviews and "last cooked" close the loop between planning and learning. They also provide the data that AI suggestions will later use.

**Deliverables**:
- Create a Friday-to-Thursday meal plan, assign recipes or custom meals to day/meal slots
- Calendar and list views for browsing plans
- Drag meals between days, pull from a recipe pool, copy a previous week
- Rate meals after eating them; see "last cooked 5 days ago" on recipe cards
- E2E tests for meal plan CRUD and calendar interactions

**Definition of done**: Your family can plan next week's meals on Thursday night, swap days around as needed, and leave notes about what worked.

---

## Milestone 3: Grocery Shopping

**Goal**: Build the grocery list system and — critically — the meal plan → shopping list pipeline that ties the two feature areas together.

**Why now**: This is the natural next step after meal planning. The whole point of planning meals is to know what to buy. The import-from-meal-plan flow is the app's key integration point.

### Phase 3A: Schema and core CRUD
| Issue | Title | Size |
|-------|-------|------|
| #27 | Shopping lists database schema | M |
| #30 | Create shopping list (manual) | M |
| #24 | Non-recipe items on shopping lists | S |

Manual list creation first so the feature is usable even without a meal plan.

### Phase 3B: Meal plan integration
| Issue | Title | Size |
|-------|-------|------|
| #33 | Import shopping list from meal plan | L |
| #36 | Shopping list ingredient deduplication | M |

This is the money feature — "Generate Shopping List" on a meal plan. Deduplication (merging 2 cups flour from recipe A + 1 cup flour from recipe B) is essential for it to be useful.

### Phase 3C: Shopping experience
| Issue | Title | Size |
|-------|-------|------|
| #42 | Shopping list item categories | M |
| #39 | Shopping mode UI | L |
| #28 | Shopping list history | S |
| #26 | Shopping list sharing | M |

Shopping mode is the grocery equivalent of cooking mode — a focused, mobile-first interface for the store. Sharing lets both partners shop from the same list.

**Deliverables**:
- Create shopping lists manually or generate from a meal plan
- Ingredients are auto-deduplicated and categorized by store section
- Shopping mode: full-screen checklist grouped by aisle, tap to check off, progress bar
- Share a list link with a partner
- Archive completed lists for reference
- E2E tests for list creation, import, and shopping mode

**Definition of done**: Thursday night you plan meals, Friday morning you tap "Generate Shopping List," and at the store you're checking items off a clean list on your phone.

---

## Milestone 4: Authentication and Multi-User

**Goal**: Add user accounts and household sharing so multiple family members can collaborate.

**Why now**: By this point, the app is genuinely useful for one person. Auth gates the transition to a multi-user product. It's intentionally deferred until after the core features work — building auth first would slow down every other milestone with permission checks and scoping.

| Issue | Title | Size |
|-------|-------|------|
| #31 | User authentication | L |
| #34 | Household/group system | L |
| #37 | Recipe ownership and permissions | M |
| #40 | Person profiles (non-users) | M |
| #43 | Recipe sharing between users | M |

**Deliverables**:
- Sign up / log in (email+password or OAuth)
- Create a household and invite family members
- All data (recipes, plans, lists) scoped to the household
- Person profiles for children and non-users with dietary restrictions and preferences
- Share recipes with users outside your household
- Retroactive migration: existing data assigned to the first user/household

**Definition of done**: Both you and your partner have accounts, see the same recipes and meal plans, and your kids' allergies are flagged when planning meals.

---

## Milestone 5: Mobile Support

**Goal**: Make Rotisserie a first-class mobile experience — installable, offline-capable, and touch-optimized for cooking in the kitchen and shopping in the store.

**Why now**: By this point, cooking mode, shopping mode, and meal plan calendars all exist. These are inherently mobile experiences — you're holding a phone while your hands are full. PWA support and offline caching make the difference between "website I visit" and "app I rely on."

### Phase 5A: Installable and offline
| Issue | Title | Size |
|-------|-------|------|
| #54 | Progressive Web App (PWA) setup | M |
| #55 | Offline support for recipes and shopping lists | L |

PWA makes the app installable from the home screen. Offline caching ensures recipes load in the kitchen (spotty Wi-Fi) and shopping lists work in the store (spotty cell signal).

### Phase 5B: Touch and responsiveness
| Issue | Title | Size |
|-------|-------|------|
| #57 | Touch gesture support | M |
| #58 | Responsive design audit and fixes | M |

Swipe between cooking steps, swipe to check off shopping items, and ensure every page looks right on a phone screen.

### Phase 5C: Notifications
| Issue | Title | Size |
|-------|-------|------|
| #56 | Push notifications for meal reminders | M |

"What's for dinner tonight?" and "How was your meal?" push notifications close the loop between planning and feedback.

**Deliverables**:
- App is installable on iOS and Android home screens
- Previously viewed recipes and the active shopping list work offline
- Swipe gestures in cooking mode, shopping mode, and meal plan calendar
- Every page passes a responsive audit at 375px+ with proper tap targets
- Opt-in push notifications for meal reminders and review prompts
- Lighthouse PWA audit passes

**Definition of done**: Your partner installs the app from Safari, plans meals on the couch, cooks with the phone propped up (no screen sleep, swipe between steps), and checks off groceries at the store — all without opening a browser.

---

## Milestone 6: AI Features

**Goal**: Add the AI-powered interactions that differentiate Rotisserie from other meal planning apps.

**Why now**: AI features are most valuable when they have data to work with — recipes, meal history, ratings, dietary profiles. By this point, all of that exists. Building AI earlier would mean building on an empty dataset.

### Phase 6A: Recipe assistant
| Issue | Title | Size |
|-------|-------|------|
| #45 | AI recipe chat assistant | XL |
| #35 | AI-powered recipe web search | L |
| #29 | "What can I make?" ingredient-based query | L |

Start with the recipe domain since the data is richest there.

### Phase 6B: Planning and shopping assistants
| Issue | Title | Size |
|-------|-------|------|
| #47 | Smart meal plan suggestions | XL |
| #32 | AI grocery assistant | L |

These build on the recipe assistant but add meal history and shopping context.

**Deliverables**:
- Chat with an AI about recipes ("make this dairy-free," "what goes well with this?")
- Describe a meal and get recipe suggestions from the web, importable in one click
- Input ingredients on hand and get ranked recipe matches
- "Suggest a week" button that generates a meal plan considering history, variety, and preferences
- In-store assistant for substitutions and quantities
- E2E tests for AI interactions (mocked provider for deterministic tests)

**Definition of done**: You can say "plan me a week of easy dinners, nothing we've had in the last two weeks" and get a reasonable plan back.

---

## Milestone 7: Nutrition and Inventory

**Goal**: Add the most ambitious (and most speculative) features — nutrition tracking and food inventory.

**Why now**: These are genuinely useful but depend on high user discipline to maintain. By this point, the app has established user habits around recipes, planning, and shopping. Inventory can piggyback on shopping list check-offs and meal completions to reduce manual entry.

### Phase 6A: Nutrition
| Issue | Title | Size |
|-------|-------|------|
| #38 | Nutrition facts database schema | M |
| #41 | Recipe nutrition calculator | M |
| #44 | Nutrition goals and tracking | M |

### Phase 6B: Inventory
| Issue | Title | Size |
|-------|-------|------|
| #46 | Food inventory tracking | XL |
| #48 | Expiration date tracking | S |

**Deliverables**:
- Per-ingredient nutrition data (seed from USDA database or similar)
- Auto-calculated nutrition per recipe per serving
- Daily/weekly nutrition goals with progress dashboard
- Pantry/fridge/freezer inventory with quantities and locations
- Expiration warnings for soon-to-spoil items
- Inventory auto-updates from shopping list check-offs (opt-in)

**Definition of done**: You can see the calories in tonight's dinner and know that the chicken in the freezer expires next week.

---

## Summary Timeline

```
Milestone 0  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Foundation
Milestone 1  ░░██████░░░░░░░░░░░░░░░░░░░░░░░░  Recipes Complete
Milestone 2  ░░░░░░░░██████░░░░░░░░░░░░░░░░░░  Meal Planning
Milestone 3  ░░░░░░░░░░░░░░██████░░░░░░░░░░░░  Grocery Shopping
Milestone 4  ░░░░░░░░░░░░░░░░░░░░████░░░░░░░░  Auth & Multi-User
Milestone 5  ░░░░░░░░░░░░░░░░░░░░░░░░████░░░░  Mobile Support
Milestone 6  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░██░░  AI Features
Milestone 7  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██  Nutrition & Inventory
```

## Guiding Principles

1. **Ship one family at a time.** Resist the temptation to start meal planning before recipes are done. A half-finished feature across three areas is worse than one polished area.

2. **Every milestone gets tests.** E2E tests are written alongside features, not after. CI blocks merge if tests fail. This compounds — by Milestone 3 you have a robust regression suite.

3. **Build the data before the intelligence.** AI features are most useful when they have history, ratings, and preferences to draw from. The first four milestones create that dataset organically.

4. **Defer auth until it's needed.** Single-user mode lets you move fast on the core product. Auth adds complexity to every route, query, and test. Wait until the features justify it.

5. **Each milestone is independently useful.** If you stop after Milestone 2, you still have a great recipe book and meal planner. The roadmap is additive, not all-or-nothing.
