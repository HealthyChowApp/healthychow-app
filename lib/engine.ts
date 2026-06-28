// Server-only recommendation engine (Milestone 3).
// Given a diet + nearby restaurants (name and Google category types, no menu),
// Claude generates up to 3 structured order options per restaurant, each a main
// plus a side. Batched (one call per results page) and cached in memory.

import Anthropic from "@anthropic-ai/sdk";
import type { DietId, Fit, MealOption, Pick } from "./data";

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
  String(s ?? "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
const num = (x: unknown) => Math.max(0, Math.round(Number(x) || 0));
const arr = (x: unknown): string[] => (Array.isArray(x) ? x.map(clean).filter(Boolean) : []);

// Per-instance cache so repeat restaurants on later requests are free.
const cache = new Map<string, Pick>();
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
          fit: { type: "string", enum: ["strong", "good", "weak"] },
          options: {
            type: "array",
            description: "Up to 3 distinct meal options for this restaurant",
            items: {
              type: "object",
              properties: {
                main: { type: "string", description: "The main dish to order" },
                side: { type: "string", description: "A complementary side dish that fits the diet" },
                remove: { type: "array", items: { type: "string" }, description: "Things to leave off" },
                add: { type: "array", items: { type: "string" }, description: "Things to add or swap" },
                why: { type: "string", description: "One short, plain-spoken sentence" },
                carbs: { type: "number", description: "Estimated net carbs (g) for the whole meal" },
                sugar: { type: "number", description: "Estimated sugar (g) for the whole meal" },
                protein: { type: "number", description: "Estimated protein (g) for the whole meal" },
              },
              required: ["main", "side", "remove", "add", "why", "carbs", "sugar", "protein"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "fit", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

export async function generateRecs(diet: DietId, places: PlaceForRec[]): Promise<Map<string, Pick>> {
  const out = new Map<string, Pick>();
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
    `You are given nearby restaurants by name and Google category types only. You do NOT have their menus, so infer realistic orders a typical restaurant of that cuisine would have. ` +
    `For EACH restaurant, give up to 3 distinct order options (aim for 3 whenever reasonable). Each option must be a full meal with a MAIN dish and a SIDE dish that both fit the ${diet} diet (the side can be a vegetable, salad, or similar light item). ` +
    `For each option include: main, side, what to remove, what to add or swap, one short friendly sentence (why), and macro ESTIMATES (integers) for net carbs, sugar, and protein for the whole meal. ` +
    `Also give one overall fit rating per restaurant: "strong" if great ${diet} options clearly exist, "good" if solid with modifications, "weak" if nothing really fits and it is the closest compromise. ` +
    `Be honest; estimates are approximate, not exact. Never use em-dashes or en-dashes in any text; use commas, colons, or periods instead.`;

  const userContent =
    `Diet: ${diet}\nRestaurants:\n` +
    misses.map((p, i) => `${i + 1}. ${p.name} (types: ${p.types.join(", ") || "restaurant"})`).join("\n");

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
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
      const options: MealOption[] = (Array.isArray(r.options) ? r.options : [])
        .slice(0, 3)
        .map((o: Record<string, unknown>) => ({
          main: clean(o.main),
          side: clean(o.side),
          mods: { rm: arr(o.remove), add: arr(o.add) },
          why: clean(o.why),
          carbs: num(o.carbs),
          sugar: num(o.sugar),
          protein: num(o.protein),
        }))
        .filter((o: MealOption) => o.main);
      if (options.length === 0) continue;
      const pick: Pick = { fit, price: place.price, options };
      cache.set(cacheKey(diet, place.name), pick);
      out.set(place.name, pick);
    }
  } catch {
    // Engine failure leaves these restaurants without a pick; the UI shows "Pick soon".
  }

  return out;
}
