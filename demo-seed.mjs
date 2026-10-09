// Seeds a small, varied recipe book plus recent cooking history, through the
// JSON API only. Usage:  node demo-seed.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:5173";
const KEY = process.env.INTERNAL_API_KEY;
const headers = { "Content-Type": "application/json", ...(KEY ? { "X-Api-Key": KEY } : {}) };

const ing = (name, quantity = null, unit = null) => ({ ingredientName: name, quantity, unit, notes: null });

const RECIPES = [
  { name: "Sheet Pan Lemon Chicken", tags: ["weeknight", "chicken"], prepTimeMinutes: 10, cookTimeMinutes: 35, servings: 4,
    ingredients: [ing("chicken thighs", 6), ing("lemon", 2), ing("olive oil", 3, "Tbsp"), ing("garlic", 4, "cloves")],
    instructions: "Heat oven to 425F.\nToss everything on a sheet pan.\nRoast 35 minutes." },
  { name: "Black Bean Tacos", tags: ["quick", "vegetarian"], prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 4,
    ingredients: [ing("black beans", 2, "cans"), ing("tortillas", 8), ing("onion", 1), ing("cumin", 2, "tsp")],
    instructions: "Saute the onion.\nAdd beans and cumin.\nWarm tortillas and fill." },
  { name: "Mushroom Risotto", tags: ["slow", "vegetarian"], prepTimeMinutes: 15, cookTimeMinutes: 40, servings: 4,
    ingredients: [ing("arborio rice", 1.5, "cups"), ing("mushrooms", 12, "oz"), ing("butter", 3, "Tbsp"), ing("parmesan", 1, "cup")],
    instructions: "Saute mushrooms, set aside.\nToast rice, add stock a ladle at a time.\nFinish with butter and parmesan." },
  { name: "Garlic Butter Shrimp Pasta", tags: ["quick", "fish"], prepTimeMinutes: 10, cookTimeMinutes: 20, servings: 4,
    ingredients: [ing("shrimp", 1, "lb"), ing("linguine", 12, "oz"), ing("butter", 4, "Tbsp"), ing("garlic", 6, "cloves")],
    instructions: "Boil pasta.\nSear shrimp in garlic butter.\nToss together with pasta water." },
  { name: "Slow Cooked Beef Chili", tags: ["batch", "slow"], prepTimeMinutes: 20, cookTimeMinutes: 240, servings: 8,
    ingredients: [ing("ground beef", 2, "lbs"), ing("kidney beans", 2, "cans"), ing("tomatoes", 28, "oz"), ing("chili powder", 3, "Tbsp")],
    instructions: "Brown the beef.\nCombine everything in a slow cooker.\nCook low 4 hours." },
  { name: "Lentil Soup", tags: ["batch", "vegetarian"], prepTimeMinutes: 15, cookTimeMinutes: 45, servings: 6,
    ingredients: [ing("lentils", 2, "cups"), ing("carrot", 3), ing("celery", 3, "stalks"), ing("onion", 1)],
    instructions: "Sweat the vegetables.\nAdd lentils and stock.\nSimmer 45 minutes." },
  { name: "Chicken Tikka Traybake", tags: ["weeknight", "chicken"], prepTimeMinutes: 20, cookTimeMinutes: 30, servings: 4,
    ingredients: [ing("chicken thighs", 8), ing("yogurt", 1, "cup"), ing("garam masala", 2, "Tbsp"), ing("onion", 2)],
    instructions: "Marinate chicken in yogurt and spice.\nRoast at 425F for 30 minutes." },
  { name: "Salmon with Green Beans", tags: ["quick", "fish"], prepTimeMinutes: 5, cookTimeMinutes: 18, servings: 2,
    ingredients: [ing("salmon", 2, "fillets"), ing("green beans", 12, "oz"), ing("olive oil", 2, "Tbsp"), ing("lemon", 1)],
    instructions: "Roast beans 8 minutes.\nAdd salmon, roast 10 more." },
  { name: "Beef and Broccoli Stir Fry", tags: ["quick"], prepTimeMinutes: 15, cookTimeMinutes: 15, servings: 4,
    ingredients: [ing("flank steak", 1, "lb"), ing("broccoli", 1, "head"), ing("soy sauce", 3, "Tbsp"), ing("ginger", 1, "Tbsp")],
    instructions: "Sear the beef hot and fast.\nAdd broccoli and sauce.\nToss until glossy." },
  { name: "Chickpea Coconut Curry", tags: ["weeknight", "vegetarian"], prepTimeMinutes: 10, cookTimeMinutes: 25, servings: 4,
    ingredients: [ing("chickpeas", 2, "cans"), ing("coconut milk", 1, "can"), ing("curry powder", 2, "Tbsp"), ing("spinach", 5, "oz")],
    instructions: "Bloom the spices.\nAdd chickpeas and coconut milk.\nWilt in spinach at the end." },
];

// Which recipes were cooked how many days ago -- this is what "nothing we've
// had in two weeks" filters on.
const COOKS = [
  ["Beef and Broccoli Stir Fry", 2],
  ["Chickpea Coconut Curry", 5],
  ["Sheet Pan Lemon Chicken", 9],
  ["Slow Cooked Beef Chili", 12],
  ["Mushroom Risotto", 23], // outside the window on purpose
];

const iso = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json.data;
}

const ids = new Map();
for (const r of RECIPES) {
  const created = await post("/api/recipes", r);
  ids.set(r.name, created.id);
  console.log(`recipe  ${created.id}  ${r.name}`);
}
for (const [name, daysAgo] of COOKS) {
  const cooked = await post("/api/cooks", { recipeId: ids.get(name), cookedOn: iso(daysAgo) });
  console.log(`cook    ${cooked.cookedOn}  ${cooked.label}  (${daysAgo}d ago)`);
}
console.log(`\n${RECIPES.length} recipes, ${COOKS.length} cooks. Recently cooked (excluded from a 14-day plan):`);
for (const [name, d] of COOKS) if (d <= 14) console.log(`  - ${name} (${d}d ago)`);
