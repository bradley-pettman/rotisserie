import * as cheerio from "cheerio";

export interface ScrapedRecipe {
  name: string | null;
  instructions: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number | null;
  sourceUrl: string;
  notes: string | null;
  ingredients: Array<{ ingredientName: string; quantity: number | null; unit: string | null; notes: string | null }>;
  tags: string[];
}

interface SchemaRecipe {
  "@type"?: string | string[];
  name?: string;
  recipeIngredient?: string[];
  recipeInstructions?: unknown;
  prepTime?: string;
  cookTime?: string;
  recipeYield?: string | string[] | number;
  recipeCategory?: string | string[];
  recipeCuisine?: string | string[];
  keywords?: string | string[];
  description?: string;
}

export async function scrapeRecipeFromUrl(url: string): Promise<ScrapedRecipe> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Rotisserie/1.0; recipe-importer)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const recipeData = extractJsonLdRecipe($);
  if (!recipeData) {
    throw new Error("Could not find recipe data on this page. The site may not use a supported recipe format.");
  }

  return {
    name: recipeData.name || null,
    instructions: parseInstructions(recipeData.recipeInstructions),
    prepTimeMinutes: parseIsoDuration(recipeData.prepTime),
    cookTimeMinutes: parseIsoDuration(recipeData.cookTime),
    servings: parseServings(recipeData.recipeYield),
    sourceUrl: url,
    notes: recipeData.description || null,
    ingredients: (recipeData.recipeIngredient || []).map(parseIngredientString),
    tags: parseTags(recipeData),
  };
}

function extractJsonLdRecipe($: cheerio.CheerioAPI): SchemaRecipe | null {
  const scripts = $('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const json = JSON.parse($(script).html() || "");
      const recipe = findRecipeInJsonLd(json);
      if (recipe) return recipe;
    } catch {
      // skip invalid JSON
    }
  }

  return null;
}

function findRecipeInJsonLd(data: unknown): SchemaRecipe | null {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeInJsonLd(item);
      if (result) return result;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    return obj as unknown as SchemaRecipe;
  }

  // Check @graph for nested schemas
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    return findRecipeInJsonLd(obj["@graph"]);
  }

  return null;
}

function parseInstructions(instructions: unknown): string | null {
  if (!instructions) return null;

  if (typeof instructions === "string") return instructions;

  if (Array.isArray(instructions)) {
    return instructions
      .map((step, i) => {
        if (typeof step === "string") return `${i + 1}. ${step}`;
        if (step && typeof step === "object") {
          // HowToStep or HowToSection
          if (step.text) return `${i + 1}. ${step.text}`;
          if (step.name) return `${i + 1}. ${step.name}`;
          // HowToSection with itemListElement
          if (step.itemListElement && Array.isArray(step.itemListElement)) {
            const sectionName = step.name ? `## ${step.name}\n` : "";
            const steps = step.itemListElement
              .map((subStep: { text?: string; name?: string }, j: number) => {
                const text = subStep?.text || subStep?.name || "";
                return `${j + 1}. ${text}`;
              })
              .join("\n");
            return sectionName + steps;
          }
        }
        return null;
      })
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

function parseIsoDuration(duration?: string): number | null {
  if (!duration) return null;

  // Parse ISO 8601 duration (e.g., PT30M, PT1H30M, PT45M)
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  const total = hours * 60 + minutes + (seconds > 0 ? 1 : 0);
  return total > 0 ? total : null;
}

function parseServings(recipeYield?: string | string[] | number): number | null {
  if (recipeYield == null) return null;

  const value = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  if (typeof value === "number") return value;

  const match = String(value).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function parseIngredientString(text: string): {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
} {
  // Common units for matching
  const unitPatterns = [
    "cups?", "tablespoons?", "tbsp", "teaspoons?", "tsp",
    "ounces?", "oz", "pounds?", "lbs?", "grams?", "g",
    "kilograms?", "kg", "milliliters?", "ml", "liters?", "l",
    "pinch(?:es)?", "dash(?:es)?", "cloves?", "cans?",
    "packages?", "pkg", "bunche?s?", "slices?", "pieces?",
    "stalks?", "sprigs?", "heads?",
  ];

  const cleaned = text.trim();

  // Try to match: quantity unit ingredient (notes)
  const pattern = new RegExp(
    `^([\\d\\s./½⅓⅔¼¾⅛⅜⅝⅞]+)?\\s*(?:(${unitPatterns.join("|")})\\b\\.?)?\\s*(.+)$`,
    "i"
  );

  const match = cleaned.match(pattern);
  if (!match) {
    return { ingredientName: cleaned, quantity: null, unit: null, notes: null };
  }

  const rawQty = match[1]?.trim();
  const rawUnit = match[2]?.trim() || null;
  let rest = match[3]?.trim() || cleaned;

  // Extract parenthetical notes
  let notes: string | null = null;
  const notesMatch = rest.match(/^(.+?)\s*[,(]\s*(.+?)\s*\)?$/);
  if (notesMatch) {
    rest = notesMatch[1].trim();
    notes = notesMatch[2].trim();
  }

  return {
    ingredientName: rest,
    quantity: rawQty ? parseFraction(rawQty) : null,
    unit: rawUnit,
    notes,
  };
}

function parseFraction(str: string): number | null {
  const unicodeFractions: Record<string, number> = {
    "½": 0.5, "⅓": 0.333, "⅔": 0.667,
    "¼": 0.25, "¾": 0.75,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  };

  let total = 0;
  let remaining = str.trim();

  // Replace unicode fractions
  for (const [char, val] of Object.entries(unicodeFractions)) {
    if (remaining.includes(char)) {
      total += val;
      remaining = remaining.replace(char, "").trim();
    }
  }

  if (remaining) {
    // Handle "1/2" style fractions
    const fractionMatch = remaining.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fractionMatch) {
      const num = parseInt(fractionMatch[1], 10);
      const den = parseInt(fractionMatch[2], 10);
      if (den !== 0) total += num / den;
    } else {
      const num = parseFloat(remaining);
      if (!isNaN(num)) total += num;
    }
  }

  return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

function parseTags(recipe: SchemaRecipe): string[] {
  const tags: string[] = [];

  const addTags = (value: string | string[] | undefined) => {
    if (!value) return;
    const items = Array.isArray(value) ? value : value.split(",");
    for (const item of items) {
      const trimmed = item.trim().toLowerCase();
      if (trimmed && !tags.includes(trimmed)) {
        tags.push(trimmed);
      }
    }
  };

  addTags(recipe.recipeCategory);
  addTags(recipe.recipeCuisine);
  addTags(recipe.keywords);

  return tags;
}
