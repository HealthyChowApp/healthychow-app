// Resolves a recommendation for a restaurant + diet.
// Milestone 2: recognized chains use our authored recs; everything else is left
// for the Milestone 3 engine (Claude + nutrition data) and shown as "coming soon".

import { RESTAURANTS, type DietId, type Rec, type StyleId } from "./data";

export interface ResultCard {
  name: string;
  tag: string;
  dist: string;
  style: StyleId;
  independent: boolean;
  rec: Rec | null; // null = tailored pick not generated yet
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

export function authoredRec(name: string, diet: DietId): Rec | null {
  return knownChain(name)?.recs[diet] ?? null;
}
