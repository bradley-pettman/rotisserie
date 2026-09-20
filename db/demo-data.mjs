#!/usr/bin/env node
/**
 * A populated library to develop and review the UI against.
 *
 * DESTRUCTIVE. Truncates recipes, cooks and meal plans before inserting, so a
 * re-run produces the same library rather than a second copy of it. Do not run
 * it against a database you care about.
 *
 * The seeded `ingredients` and `units` vocabulary is NOT touched: ingredient
 * names are upserted against it with ON CONFLICT (name), which is why every
 * name below is lowercase — the canonical form the CHECK constraint requires.
 *
 * Dates are anchored to the current week, so "tonight" and "this week" mean
 * something on the day you run it.
 *
 * Usage: npm run db:demo
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

// Same precedence as db/seed.mjs: an exported DATABASE_URL wins, then .env.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
  } catch {
    // No .env — the connect below reports it.
  }
}
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env, or export it:\n" +
      "  export DATABASE_URL=postgres://postgres:postgres@localhost:5432/rotisserie_dev?sslmode=disable"
  );
  process.exit(1);
}

/**
 * GUARD: this script TRUNCATEs recipes, cooks and meal plans. Until now the
 * only thing standing between `npm run db:demo` and a production library was
 * the operator remembering which DATABASE_URL was exported -- and exporting a
 * staging or production URL is the normal way to run `dbmate up` against one,
 * so the dangerous state is a state people are routinely in. The command also
 * sits one line below `npm run db:seed` in the docs, which is harmless.
 *
 * `cooks` is append-only FACT (see the create_cooks migration) and is meant to
 * survive even a recipe deletion, so there is no "undo" and no other copy.
 *
 * So: refuse anything that does not look like a scratch database by name, and
 * make the override explicit and deliberate rather than a flag someone can
 * pass by habit.
 */
const databaseName = (() => {
  try {
    return decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
})();

if (!/(_dev|_test|_demo)$/.test(databaseName) && process.env.ALLOW_DESTRUCTIVE !== "1") {
  console.error(
    `Refusing to run: this truncates recipes, cooks and meal plans, and ` +
      `"${databaseName || connectionString}" is not a scratch database.\n` +
      `Scratch databases end in _dev, _test or _demo.\n` +
      `If you really mean it: ALLOW_DESTRUCTIVE=1 npm run db:demo`
  );
  process.exit(1);
}

const c = new pg.Client({ connectionString });
await c.connect();

const RECIPES = [
  { name: "Sheet-Pan Harissa Chicken", prep: 15, cook: 40, servings: 4, tags: ["weeknight", "chicken", "one-pan"],
    src: "https://cooking.nytimes.com/recipes/harissa-chicken",
    ing: [["chicken thigh", 6, "piece"], ["sweet potato", 2, "whole"], ["red pepper flakes", 1, "teaspoon"], ["olive oil", 3, "tablespoon"], ["lemon", 1, "whole"], ["cilantro", 1, "bunch"]],
    inst: "Heat the oven to 425°F and set a rack in the lower third.\nToss the sweet potatoes with 2 tablespoons olive oil, salt and pepper. Spread on a sheet pan and roast 15 minutes.\nRub the chicken thighs with harissa, the remaining oil and a good pinch of salt.\nNestle the chicken skin-side up among the potatoes and roast 25 to 30 minutes, until the skin is crisp and the thickest part reads 165°F.\nSqueeze the lemon over everything and scatter with torn cilantro before serving.",
    notes: "Double the harissa if you want real heat. Leftovers shred well into tacos." },
  { name: "Weeknight Carbonara", prep: 10, cook: 15, servings: 2, tags: ["weeknight", "pasta", "quick"],
    ing: [["pasta", 200, "gram"], ["bacon", 4, "slice"], ["eggs", 2, "whole"], ["parmesan cheese", 50, "gram"], ["black pepper", 1, "teaspoon"]],
    inst: "Bring a large pot of well-salted water to a boil and cook the pasta one minute short of the package time.\nWhile it cooks, render the bacon in a cold pan over medium heat until crisp, about 8 minutes.\nBeat the eggs with the grated parmesan and a lot of black pepper.\nReserve a mug of pasta water, then drain and add the pasta to the bacon pan off the heat.\nPour in the egg mixture and toss hard, loosening with pasta water until it turns glossy rather than scrambled.",
    notes: "Off the heat. Always off the heat." },
  { name: "Miso Butter Salmon", prep: 10, cook: 12, servings: 4, tags: ["weeknight", "fish", "quick"],
    ing: [["salmon", 4, "piece"], ["miso paste", 2, "tablespoon"], ["butter", 3, "tablespoon"], ["honey", 1, "tablespoon"], ["green onion", 3, "stalk"], ["rice", 2, "cup"]],
    inst: "Start the rice first — everything else takes twelve minutes.\nMash the miso, softened butter and honey into a paste.\nPat the salmon dry, season lightly, and sear skin-side down in a hot pan for 4 minutes.\nFlip, spoon the miso butter over each fillet, and slide under the broiler for 3 to 4 minutes until it caramelizes.\nScatter with sliced green onion and serve over the rice.",
    notes: null },
  { name: "Sunday Bolognese", prep: 25, cook: 180, servings: 8, tags: ["weekend", "pasta", "batch"],
    ing: [["ground beef", 1, "pound"], ["ground pork", 0.5, "pound"], ["canned tomatoes", 2, "can"], ["carrot", 2, "whole"], ["celery", 2, "stalk"], ["onion", 1, "whole"], ["red wine", 1, "cup"], ["milk", 1, "cup"], ["pasta", 500, "gram"]],
    inst: "Finely dice the carrot, celery and onion and sweat in olive oil over low heat for 15 minutes, until sweet and soft.\nRaise the heat, add the beef and pork, and brown properly — no grey meat, keep going until there are real crusty bits.\nDeglaze with the wine and let it cook away almost completely.\nAdd the milk and simmer until absorbed, then the tomatoes and a cup of water.\nBarely simmer, uncovered, for 3 hours, stirring occasionally and adding water if it tightens too much.\nSeason at the very end, and toss with the pasta and a ladle of its water.",
    notes: "Makes enough for two dinners plus a container for the freezer." },
  { name: "Crispy Chickpea Bowls", prep: 15, cook: 25, servings: 4, tags: ["vegetarian", "weeknight", "bowl"],
    ing: [["chickpeas", 2, "can"], ["quinoa", 1, "cup"], ["tahini", 3, "tablespoon"], ["lemon", 1, "whole"], ["kale", 1, "bunch"], ["smoked paprika", 2, "teaspoon"], ["olive oil", 3, "tablespoon"]],
    inst: "Heat the oven to 425°F.\nDrain and thoroughly dry the chickpeas, toss with oil, smoked paprika and salt, and roast 25 minutes until they rattle.\nCook the quinoa in well-salted water.\nWhisk the tahini with lemon juice and cold water, a spoonful at a time, until it is pourable.\nMassage the kale with a little oil and salt, then build the bowls: quinoa, kale, chickpeas, a lot of sauce.",
    notes: null },
  { name: "Green Curry with Tofu", prep: 15, cook: 20, servings: 4, tags: ["vegetarian", "weeknight", "curry"],
    ing: [["tofu", 400, "gram"], ["coconut milk", 1, "can"], ["green beans", 200, "gram"], ["bell pepper", 1, "whole"], ["fish sauce", 1, "tablespoon"], ["lime", 1, "whole"], ["basil (fresh)", 1, "bunch"], ["rice", 2, "cup"]],
    inst: "Press the tofu for 10 minutes, cube it, and fry until golden on at least two sides.\nFry the curry paste in the thick cream from the top of the coconut milk until it splits and smells fragrant.\nAdd the rest of the coconut milk, the beans and the pepper, and simmer 8 minutes.\nReturn the tofu, season with fish sauce and lime, and finish with a big handful of torn basil.\nServe with rice.",
    notes: null },
  { name: "Smash Burgers", prep: 15, cook: 10, servings: 4, tags: ["weekend", "beef", "quick"],
    ing: [["ground beef", 1, "pound"], ["cheddar cheese", 4, "slice"], ["onion", 1, "whole"], ["butter", 2, "tablespoon"], ["mayonnaise", 3, "tablespoon"], ["ketchup", 2, "tablespoon"]],
    inst: "Divide the beef into four loose balls and refrigerate until you are ready — do not work them.\nGet a cast-iron pan ripping hot, butter the buns and toast them cut-side down.\nSmash each ball flat with a stiff spatula and leave it alone for 90 seconds.\nFlip, top with cheese, and give it another minute.\nStack with the sauce and thinly shaved raw onion.",
    notes: "The pan is never hot enough. Make it hotter." },
  { name: "Shakshuka", prep: 10, cook: 25, servings: 3, tags: ["breakfast", "vegetarian", "one-pan"],
    ing: [["eggs", 6, "whole"], ["canned tomatoes", 1, "can"], ["bell pepper", 1, "whole"], ["onion", 1, "whole"], ["cumin", 1, "teaspoon"], ["feta cheese", 100, "gram"], ["parsley", 1, "bunch"]],
    inst: "Soften the onion and pepper in olive oil for 10 minutes.\nAdd the cumin and cook 30 seconds, then the tomatoes, and simmer until thick enough to hold a channel from a spoon.\nMake six wells and crack an egg into each.\nCover and cook 6 to 8 minutes, until the whites set but the yolks still run.\nCrumble over the feta and parsley, and eat straight from the pan with bread.",
    notes: null },
  { name: "Lemon Herb Roast Chicken", prep: 20, cook: 75, servings: 6, tags: ["weekend", "chicken", "sunday"],
    ing: [["chicken breast", 1, "whole"], ["lemon", 2, "whole"], ["rosemary", 3, "sprig"], ["thyme", 4, "sprig"], ["garlic", 1, "head"], ["butter", 4, "tablespoon"], ["potato", 6, "whole"]],
    inst: "Salt the bird all over the day before and leave it uncovered in the fridge.\nHeat the oven to 425°F.\nSoften the butter with chopped rosemary and thyme, and push it under the breast skin.\nHalve the lemons and the head of garlic and stuff them into the cavity.\nRoast on a bed of halved potatoes for 70 to 80 minutes, basting twice, until the thigh reads 165°F.\nRest 20 minutes before carving. This is not optional.",
    notes: "The carcass makes stock — don't bin it." },
  { name: "Cacio e Pepe", prep: 5, cook: 12, servings: 2, tags: ["pasta", "quick", "vegetarian"],
    ing: [["pasta", 200, "gram"], ["parmesan cheese", 80, "gram"], ["black pepper", 2, "teaspoon"], ["butter", 1, "tablespoon"]],
    inst: "Toast the cracked pepper in a dry pan until it smells like pepper rather than dust.\nCook the pasta in the smallest amount of water that will cover it, so the water goes properly starchy.\nAdd a ladle of that water to the pepper pan with the butter and swirl to emulsify.\nOff the heat, add the pasta and the finely grated cheese in handfuls, tossing constantly.\nLoosen with more pasta water until it coats rather than clumps.",
    notes: null },
  { name: "Overnight Oats", prep: 5, cook: 0, servings: 1, tags: ["breakfast", "quick", "make-ahead"],
    ing: [["oats", 0.5, "cup"], ["greek yogurt", 0.5, "cup"], ["milk", 0.5, "cup"], ["chia seeds", 1, "tablespoon"], ["maple syrup", 1, "tablespoon"], ["blueberries", 0.5, "cup"]],
    inst: "Stir everything except the berries together in a jar.\nRefrigerate overnight, or at least 4 hours.\nTop with the blueberries in the morning.",
    notes: "Scales to five jars on a Sunday night." },
  { name: "Thai Beef Salad", prep: 20, cook: 8, servings: 4, tags: ["quick", "beef", "salad"],
    ing: [["steak", 500, "gram"], ["lime", 2, "whole"], ["fish sauce", 2, "tablespoon"], ["cucumber", 1, "whole"], ["mint", 1, "bunch"], ["cilantro", 1, "bunch"], ["jalapeño", 1, "whole"]],
    inst: "Bring the steak to room temperature and season it hard with salt.\nSear 3 to 4 minutes a side for medium rare, then rest 10 minutes.\nWhisk lime juice, fish sauce, a teaspoon of sugar and the sliced chilli into a dressing.\nSlice the beef thinly against the grain.\nToss with the cucumber and a genuinely excessive amount of mint and cilantro, and dress just before serving.",
    notes: null },
];

const slots = ["breakfast", "lunch", "dinner", "snack"];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

try {
  await c.query("BEGIN");
  await c.query("TRUNCATE cook_fulfillments, cooks, meal_plan_items, meal_plans, recipe_ingredients, recipe_tags, recipes CASCADE");
  await c.query("DELETE FROM tags");

  const ids = {};
  for (const r of RECIPES) {
    const { rows: [rec] } = await c.query(
      `INSERT INTO recipes (name, instructions, prep_time_minutes, cook_time_minutes, servings, source_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [r.name, r.inst, r.prep, r.cook, r.servings, r.src ?? null, r.notes]);
    ids[r.name] = rec.id;

    for (const t of r.tags) {
      const { rows: [tag] } = await c.query(
        `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [t]);
      await c.query(`INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [rec.id, tag.id]);
    }

    let order = 0;
    for (const [name, qty, unit] of r.ing) {
      const { rows: [ing] } = await c.query(
        `INSERT INTO ingredients (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [name]);
      const { rows: u } = await c.query(`SELECT id FROM units WHERE name = $1`, [unit]);
      await c.query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [rec.id, ing.id, qty, u[0]?.id ?? null, order++]);
    }
  }

  // History and plans are anchored to the real current date so "this week"
  // and "tonight" mean something in a screenshot.
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const sunday = addDays(today, -today.getUTCDay());   // the plan week starts Sunday                       // the plan week starts today (Sun)
  const lastSunday = addDays(sunday, -7);

  const cookId = {};
  const logCook = async (date, name, slot, servings, key) => {
    const { rows: [row] } = await c.query(
      `INSERT INTO cooks (recipe_id, label, cooked_on, meal_slot, servings_made) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [ids[name], name, iso(date), slot, servings]);
    if (key) cookId[key] = row.id;
    return row.id;
  };

  // Last week, actually cooked. Keys match the plan items below so the two can
  // be linked into cook_fulfillments and adherence has real numbers.
  const lastWeekCooked = [
    [0, "Cacio e Pepe", "dinner", 2, "lw0"],
    [1, "Lemon Herb Roast Chicken", "dinner", 6, "lw1"],
    [2, "Shakshuka", "breakfast", 3, null],
    [3, "Miso Butter Salmon", "dinner", 4, "lw3"],
    [4, "Weeknight Carbonara", "dinner", 2, null],
    [5, "Sunday Bolognese", "dinner", 8, "lw5"],
    [6, "Smash Burgers", "dinner", 4, null],
  ];
  for (const [day, name, slot, servings, key] of lastWeekCooked) {
    await logCook(addDays(lastSunday, day), name, slot, servings, key);
  }

  // Deeper history, so "last cooked" and the history view are not all one week.
  for (const [ago, name, slot, servings] of [
    [10, "Crispy Chickpea Bowls", "lunch", 4], [12, "Overnight Oats", "breakfast", 1],
    [15, "Green Curry with Tofu", "dinner", 4], [17, "Sheet-Pan Harissa Chicken", "dinner", 4],
    [19, "Thai Beef Salad", "dinner", 4], [22, "Weeknight Carbonara", "dinner", 2],
    [25, "Sunday Bolognese", "dinner", 8], [27, "Shakshuka", "breakfast", 2],
    [30, "Miso Butter Salmon", "dinner", 4], [33, "Smash Burgers", "dinner", 4],
    [36, "Cacio e Pepe", "dinner", 2], [40, "Overnight Oats", "breakfast", 1],
  ]) {
    await logCook(addDays(today, -ago), name, slot, servings, null);
  }

  const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const planName = (start) => `Week of ${MONTH[start.getUTCMonth()]} ${start.getUTCDate()}`;

  const addPlan = async (name, start) => {
    const { rows: [p] } = await c.query(
      `INSERT INTO meal_plans (name, starts_on, ends_on) VALUES ($1,$2,$3) RETURNING id`,
      [name, iso(start), iso(addDays(start, 6))]);
    return p.id;
  };
  const addItem = async (planId, start, day, slot, recipe, custom, notes) => {
    const { rows: [row] } = await c.query(
      `INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_text, planned_on, meal_slot, sort_order, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [planId, recipe ? ids[recipe] : null, custom, iso(addDays(start, day)), slot, slots.indexOf(slot), notes ?? null]);
    return row.id;
  };

  // Last week's plan, linked to what was actually cooked.
  const prev = await addPlan(planName(lastSunday), lastSunday);
  const prevItems = [
    [0, "dinner", "Cacio e Pepe", "lw0"], [1, "dinner", "Lemon Herb Roast Chicken", "lw1"],
    [2, "dinner", "Thai Beef Salad", null], [3, "dinner", "Miso Butter Salmon", "lw3"],
    [4, "dinner", "Green Curry with Tofu", null], [5, "dinner", "Sunday Bolognese", "lw5"],
    [6, "dinner", "Crispy Chickpea Bowls", null],
  ];
  for (const [day, slot, recipe, key] of prevItems) {
    const itemId = await addItem(prev, lastSunday, day, slot, recipe, null, null);
    if (key && cookId[key]) {
      await c.query(`INSERT INTO cook_fulfillments (meal_plan_item_id, cook_id) VALUES ($1,$2)`, [itemId, cookId[key]]);
    }
  }

  // This week's plan — the one the redesign actually renders.
  //
  // Deliberately NOT a full week. Tuesday and Wednesday dinners are left open,
  // because that is what a real plan looks like on a Sunday and because the
  // gaps are what the planner UI has to be good at. A seeded week with every
  // slot filled makes the design look finished and tests nothing.
  const plan = await addPlan(planName(sunday), sunday);
  const planItemId = {};
  for (const [day, slot, recipe, custom, notes, key] of [
    [0, "breakfast", "Overnight Oats", null, null, "sunBreakfast"],
    [0, "dinner", "Sheet-Pan Harissa Chicken", null, "Use up the sweet potatoes", null],
    [1, "lunch", null, "Leftover harissa chicken", null, null],
    [1, "dinner", "Weeknight Carbonara", null, null, null],
    [3, "breakfast", "Overnight Oats", null, null, null],
    [4, "dinner", null, "Takeaway — nobody cooks on Thursday", null, null],
    [5, "lunch", "Crispy Chickpea Bowls", null, null, null],
    [5, "dinner", "Smash Burgers", null, null, null],
    [6, "breakfast", "Shakshuka", null, null, null],
    [6, "dinner", "Sunday Bolognese", null, "Double it, freeze half", null],
  ]) {
    const id = await addItem(plan, sunday, day, slot, recipe, custom, notes);
    if (key) planItemId[key] = id;
  }

  // The week is underway: this morning's breakfast actually happened, so
  // adherence has a real numerator rather than a zero.
  const breakfastCook = await logCook(sunday, "Overnight Oats", "breakfast", 1, null);
  await c.query(`INSERT INTO cook_fulfillments (meal_plan_item_id, cook_id) VALUES ($1,$2)`, [
    planItemId.sunBreakfast,
    breakfastCook,
  ]);

  await c.query("COMMIT");
  const { rows } = await c.query("SELECT (SELECT count(*) FROM recipes) r, (SELECT count(*) FROM cooks) c, (SELECT count(*) FROM meal_plan_items) i, (SELECT count(*) FROM tags) t");
  console.log(
    `demo data: ${rows[0].r} recipes, ${rows[0].c} cooks, ${rows[0].i} plan items, ${rows[0].t} tags`
  );
} catch (e) {
  await c.query("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  await c.end();
}
