# Rotisserie

Plan meals. Shop smarter. Cook. Repeat.

## Overview

Rotisserie is a family-focused application for managing food planning and consumption. It connects three core household responsibilities—recipe management, meal planning, and grocery shopping—into a unified workflow.

### Core Features

1. **Recipe Management** - Store, organize, and access recipes with a cooking-focused interface
2. **Meal Planning** - Plan weekly meals with calendar views and flexibility for real-life changes
3. **Grocery Shopping** - Generate shopping lists from meal plans with a store-friendly interface

### Future Features

- Food Inventory Management
- People & Group Management
- Nutrition Tracking
- AI-powered suggestions and automation

---

## Recipe Management

Maintain a structured digital recipe book that serves as both an index for planning and a hands-free cooking companion.

### Baseline Features

**CRUD Operations**
- Create, read, update, and delete recipes
- Manage ingredients and supplies per recipe
- Filter and search by attributes (ingredients, cuisine, tags, dietary restrictions)

**Cooking Mode**
- Distraction-free UI optimized for following recipes while cooking
- Step-by-step instruction view
- Hands-free friendly (large text, minimal interaction needed)

### Future Features

**Recipe Import**
- Import recipes from URLs via web scraping
- Parse ingredients, instructions, and metadata automatically

**Nutrition Information**
- Add calorie and macro information to recipes
- Auto-infer nutrition from ingredient data

**AI Assistant**
- Modify existing recipes conversationally
- Search the web for new recipes based on descriptions
- Answer questions about your recipe collection

---

## Meal Planning

Plan meals on a weekly basis with flexibility to adapt to real-life schedule changes.

### Baseline Features

**CRUD Operations**
- Create, read, update, and delete meal plans
- Define planning periods (e.g., Friday to Thursday)
- Support any meal type: breakfast, lunch, dinner, snacks

**Flexible Scheduling**
- Assign recipes to specific days and meals
- Swap meals between days
- Move meals to future plans or remove them
- Keep unassigned recipes in a "backlog" for later use

**Views**
- Calendar view of upcoming and past meal plans
- List view for quick scanning

**Meal Reviews**
- Rate meals after eating (star rating)
- Add notes and feedback
- Quick action to suggest recipe modifications

### Future Features

**Calendar Integration**
- Sync with external calendars (iCal, Google Calendar, Microsoft Exchange)

**Notifications**
- "How was your meal?" prompts for reviews
- "What's for dinner tonight?" reminders
- Prep reminders (e.g., "Thaw chicken for tomorrow")

**Smart Suggestions**
- Recommend meals based on history, preferences, and variety
- Avoid repeating similar meals too frequently

**AI Assistant**
- Conversational meal planning
- Generate full weekly plans with feedback loop
- Optimize for goals ("save money", "use up inventory")

---

## Grocery Shopping

Generate and manage shopping lists driven primarily by meal plans, with support for non-food items.

### Baseline Features

**CRUD Operations**
- Create, read, update, and delete grocery lists
- Add items manually or import from meal plans

**Meal Plan Integration**
- Import ingredients from upcoming meal plans
- Option to import full plan or individual meals
- Review and edit imported items before adding

**Item Categories**
- Food items (from recipes)
- Kids items (diapers, wipes, formula)
- Pet supplies
- Home supplies
- Miscellaneous

**Shopping Mode**
- Clean, mobile-friendly UI for use in-store
- Check off items as you shop
- Organize by category or custom grouping

### Future Features

**Inventory Awareness**
- Cross-reference with food inventory to avoid buying duplicates
- Suggest items that need restocking

**Store Integration**
- Display prices from nearby stores
- Show aisle locations (where available)
- Sort list by aisle for efficient shopping

**Ordering Integration**
- Connect with delivery services (Amazon, Target, Instacart, Shipt)
- Place orders directly from the app

**AI Assistant**
- Suggest ingredient substitutions while shopping
- Recommend which store to visit based on list contents

---

## Future Features

### Food Inventory Management

- Track pantry, fridge, and freezer contents
- Update inventory based on grocery purchases and meal usage
- Handle waste, spoilage, and leftovers
- AI queries: "What needs restocking?", "What's about to expire?", "What can I make with what I have?"

*Note: User adoption is uncertain—success depends on making logging frictionless.*

### People & Group Management

**Household Groups**
- Share recipes, meal plans, and grocery lists with family members
- Multiple contributors with owner approval controls

**Profiles for Non-Users**
- Track preferences, allergens, and dietary restrictions for children or guests

**Social Features**
- Share recipes with other users
- Future: activity feed showing meals friends have made

### Nutrition Tracking

- Record nutrition at meal or ingredient level
- Auto-compute recipe nutrition from ingredients
- Set and track goals for calories and macros

---

## Technical Overview

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React Router v7 (Framework Mode) |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Database** | PostgreSQL |
| **Data Layer** | Raw SQL (pg driver) + Zod validation |
| **Migrations** | dbmate |
| **Authentication** | Auth.js |
| **Deployment** | TBD |

### Architecture Decisions

**React Router v7 (Framework Mode)**
- Loader/action pattern for explicit data flow
- Progressive enhancement—forms work without JavaScript
- Good fit for CRUD-heavy applications

**Raw SQL + Zod**
- Full control over queries, no ORM abstraction
- Zod schemas provide runtime validation and TypeScript types
- `z.infer<typeof schema>` derives types from validation schemas

**PostgreSQL**
- Strong relational model for recipes ↔ ingredients ↔ meal plans ↔ grocery lists
- JSONB columns for flexible metadata
- Built-in full-text search for recipe discovery

### Data Model (High-Level)

```
users
  └── groups (many-to-many)

recipes
  ├── ingredients (many-to-many via recipe_ingredients)
  └── tags (many-to-many via recipe_tags)

meal_plans
  ├── meal_plan_items (recipes assigned to days/meals)
  └── reviews

grocery_lists
  └── grocery_list_items
```

### Future Considerations

**Mobile App**
- Web-first approach with PWA capabilities
- Native apps (React Native) can share API when needed

**AI Integration**
- Design data model to support AI queries (history, inventory, preferences)
- Add AI features once core CRUD is stable
