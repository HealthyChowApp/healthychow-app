// Resolves a recommendation for a restaurant + diet.
// Milestone 2: recognized chains use our authored recs; everything else is left
// for the Milestone 3 engine (Claude + nutrition data) and shown as "coming soon".

import { RESTAURANTS, type DietId, type Pick, type Rec, type StyleId } from "./data";

export interface ResultCard {
  name: string;
  tag: string;
  dist: string;
  style: StyleId;
  independent: boolean;
  rec: Pick | null; // null = tailored pick not generated yet
  lat?: number;
  lng?: number;
  url?: string; // restaurant website (or Google Maps page) to order from
}

// Wrap an authored single-pick rec into the multi-option Pick shape.
export function recToPick(rec: Rec): Pick {
  return {
    fit: rec.fit,
    price: rec.price,
    options: [
      {
        main: rec.item,
        side: "",
        mods: rec.mods,
        why: rec.why,
        carbs: rec.carbs,
        sugar: rec.sugar,
        protein: rec.protein,
        onMenu: true, // authored picks reference real chain menu items
        price: rec.price,
        priceEstimated: true, // curated approximate price, not read from a live menu
      },
    ],
  };
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Lookup of our seed chains by normalized name.
const KNOWN = new Map(RESTAURANTS.map((r) => [normalize(r.name), r]));

export function knownChain(name: string) {
  const n = normalize(name);
  // exact, then loose contains match (e.g. "McDonald's (Route 35)")
  if (KNOWN.has(n)) return KNOWN.get(n)!;
  for (const [key, r] of KNOWN) {
    if (n.includes(key) || key.includes(n)) return r;
  }
  return null;
}

export function authoredRec(name: string, diet: DietId): Pick | null {
  const rec = knownChain(name)?.recs[diet];
  return rec ? recToPick(rec) : null;
}

// Ingredient keywords per avoid-list entry, used to catch authored picks that
// conflict with a user's allergies/exclusions. Deliberately broad: a false
// positive just means the engine regenerates the pick under the constraint.
const ALLERGEN_WORDS: Record<string, string[]> = {
  gluten: ["bun", "bread", "tortilla", "flour", "breaded", "crouton", "pasta", "hoagie", "sub roll", "flatbread"],
  dairy: ["cheese", "butter", "cream", "ranch", "feta", "brie", "milk", "yogurt", "queso", "mozzarella", "cheddar", "provolone"],
  nuts: ["almond", "peanut", "cashew", "walnut", "pecan", "pistachio", "nut"],
  shellfish: ["shrimp", "crab", "lobster", "clam", "oyster", "scallop", "prawn"],
  soy: ["soy", "tofu", "edamame", "teriyaki"],
  pork: ["pork", "bacon", "ham", "sausage", "carnitas", "prosciutto", "pepperoni", "chorizo"],
  eggs: ["egg", "omelet", "omelette", "mayo", "aioli", "caesar"],
  cilantro: ["cilantro"],
};

// True if a pick's positive content (mains, sides, additions) mentions an
// avoided ingredient. Removal mods don't count: "No bun" is compliant.
export function pickConflictsWithAvoid(pick: Pick, avoid: string[]): boolean {
  if (!avoid.length) return false;
  const words = avoid.flatMap((a) => ALLERGEN_WORDS[a.toLowerCase()] ?? [a.toLowerCase()]);
  return pick.options.some((o) => {
    const text = `${o.main} ${o.side} ${o.mods.add.join(" ")}`.toLowerCase();
    return words.some((w) => text.includes(w));
  });
}
