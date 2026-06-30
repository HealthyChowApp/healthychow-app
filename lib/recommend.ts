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
