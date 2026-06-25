// Server-only recommendation engine (Milestone 3).
// Given a diet + nearby restaurants (name and Google category types, no menu),
// Claude generates a structured "order this" pick per restaurant.
// Batched (one call per results page) and cached in memory to keep cost low.

import Anthropic from "@anthropic-ai/sdk";
import type { DietId, Fit, Rec } from "./data";

// Cheap, fast tier for this high-volume structured task. Bump to
// "claude-sonnet-4-6" if dietary reasoning needs more depth.
const MODEL = "claude-haiku-4-5";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const hasEngine = () => anthropic !== null;

export interface PlaceForRec {
  name: string;
  types: string[];
  price: number; // estimated per-meal dollars, used as the rec price
}

// Strip em/en dashes from model text (brand rule: never use them).
const clean = (s: unknown) =>
  String(s)
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();

// Per-instance cache so repeat restaurants on later requests are free.
const cache = new Map<string, Rec>();
const cacheKey = (diet: DietId, name: string) => `${diet}::${name.toLowerCase().trim()}`;

const DIET_GUIDE: Record<DietId, string> = {
  keto: "Very low carb (aim under ~15g net carbs), high fat. Cut bread, buns, rice, pasta, potatoes, sugary sauces, most fruit. Favor meat, fish, eggs, cheese, avocado, oils, low-carb veg.",
  "low-carb": "Reduced carbs (roughly 20-40g). Trim starches and sugar but a little is fine. Protein and veg forward.",
  mediterranean: "Fish, seafood, olive oil, vegetables, legumes, whole grains in moderation. Limit red meat and heavy cheese; avoid fried and sugary items.",
  paleo: "Whole foods only. No grains, no dairy, no legumes, no refined sugar or seed oils. Meat, fish, eggs, vegetables, nuts, olive/avocado oil.",
  carnivore: "Animal foods only: meat, fish, eggs, some cheese. No plants, grains, sauces, or sugar.",
};

const SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact restaurant name as given" },
          item: { type: "string", description: "The single best order, including base dish" },
          remove: { type: "array", items: { type: "string" }, description: "Things to leave off" },
          add: { type: "array", items: { type: "string" }, description: "Things to add or swap in" },
          why: { type: "string", description: "One short, plain-spoken sentence" },
          carbs: { type: "number", description: "Estimated net carbs in grams" },
          sugar: { type: "number", description: "Estimated sugar in grams" },
          protein: { type: "number", description: "Estimated protein in grams" },
          fit: { type: "string", enum: ["strong", "good", "weak"] },
        },
        required: ["name", "item", "remove", "add", "why", "carbs", "sugar", "protein", "fit"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

export async function generateRecs(diet: DietId, places: PlaceForRec[]): Promise<Map<string, Rec>> {
  const out = new Map<string, Rec>();
  if (!anthropic || places.length === 0) return out;

  // Serve cached, collect misses.
  const misses: PlaceForRec[] = [];
  for (const p of places) {
    const cached = cache.get(cacheKey(diet, p.name));
    if (cached) out.set(p.name, cached);
    else misses.push(p);
  }
  if (misses.length === 0) return out;

  const system =
    `You are Healthy Chow's ordering scout. The user follows a ${diet} diet: ${DIET_GUIDE[diet]}\n\n` +
    `You are given nearby restaurants by name and Google category types only. You do NOT have their menus, so infer a realistic order a typical restaurant of that cuisine would have. ` +
    `For each, return the single best ${diet} order: name the base dish, list what to remove and what to add or swap, one short friendly sentence on why, and rough macro ESTIMATES (integers) for net carbs, sugar, and protein. ` +
    `Rate fit: "strong" if a great ${diet} option clearly exists, "good" if a solid pick with modifications, "weak" if nothing really fits and it is the closest compromise. Be honest. Keep estimates realistic; they are approximate, not exact. ` +
    `Never use em-dashes or en-dashes in any text; use commas, colons, or periods instead.`;

  const userContent =
    `Diet: ${diet}\nRestaurants:\n` +
    misses.map((p, i) => `${i + 1}. ${p.name} (types: ${p.types.join(", ") || "restaurant"})`).join("\n");

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const data = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");
    const byName = new Map(misses.map((p) => [p.name.toLowerCase().trim(), p]));

    for (const r of data.recommendations ?? []) {
      const place = byName.get(String(r.name).toLowerCase().trim());
      if (!place) continue;
      const fit: Fit = ["strong", "good", "weak"].includes(r.fit) ? r.fit : "good";
      const rec: Rec = {
        item: clean(r.item),
        mods: {
          rm: Array.isArray(r.remove) ? r.remove.map(clean) : [],
          add: Array.isArray(r.add) ? r.add.map(clean) : [],
        },
        why: clean(r.why),
        carbs: Math.max(0, Math.round(Number(r.carbs) || 0)),
        sugar: Math.max(0, Math.round(Number(r.sugar) || 0)),
        protein: Math.max(0, Math.round(Number(r.protein) || 0)),
        fit,
        price: place.price,
      };
      cache.set(cacheKey(diet, place.name), rec);
      out.set(place.name, rec);
    }
  } catch {
    // Engine failure leaves these restaurants without a pick; the UI shows "Pick soon".
  }

  return out;
}
