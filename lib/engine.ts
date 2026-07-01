// Server-only recommendation engine (Milestone 3).
// For each nearby restaurant we DON'T have an authored pick for, Claude uses web
// search to find the restaurant's ACTUAL current menu, then chooses real menu
// items and applies the diet modifications. Each option is flagged onMenu so the
// UI can be honest about what's verified vs. a reasonable suggestion. Grounded
// per restaurant (so one menu never bleeds into another), run with limited
// concurrency, and cached in memory so repeats are free.

import Anthropic from "@anthropic-ai/sdk";
import type { DietId, Fit, MealOption, Pick } from "./data";

// Cheap, fast tier for this high-volume task. Bump to "claude-sonnet-4-6" if
// dietary reasoning needs more depth.
const MODEL = "claude-haiku-4-5";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const hasEngine = () => anthropic !== null;

export interface PlaceForRec {
  name: string;
  types: string[];
  price: number; // estimated per-meal dollars, used as the rec price
  area?: string; // "Manasquan, NJ" - disambiguates which location's menu to find
  website?: string; // homepage or Maps URL hint for the menu search
}

// Strip em/en dashes from model text (brand rule: never use them).
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
const num = (x: unknown) => Math.max(0, Math.round(Number(x) || 0));
// Dollars, kept to cents; undefined if not a usable positive number.
const money = (x: unknown): number | undefined => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
};
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

// Pull the first balanced JSON object out of model text (the model is asked to
// reply with only JSON, but web-search answers can carry a stray line).
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Ground ONE restaurant: search the web for its real menu, return a pick.
async function groundOne(diet: DietId, place: PlaceForRec): Promise<Pick | null> {
  if (!anthropic) return null;

  const where = place.area ? ` in ${place.area}` : "";
  const siteHint = place.website ? ` Their website may be ${place.website}.` : "";
  const system =
    `You are Healthy Chow's ordering scout for someone on a ${diet} diet: ${DIET_GUIDE[diet]}\n\n` +
    `Find this restaurant's ACTUAL, CURRENT menu, then pick real menu items that can be made to fit the diet, with specific modifications (what to remove, what to add or swap).\n` +
    `How to find the menu: use web_search to locate their menu, then use web_fetch to open their website and any menu page or menu PDF and read the real item names and prices. Many restaurant menus are PDFs or on the restaurant's own site; fetch and read them before deciding nothing fits.\n` +
    `Rules:\n` +
    `- ALWAYS return 2 to 3 options. Never return an empty list. Aim for 3 when reasonable.\n` +
    `- Almost every restaurant has something that can be modified to fit (a protein, a salad, a bowl, a burger without the bun). Work to find it.\n` +
    `- Only set "onMenu": true for a main that genuinely appears on THIS restaurant's menu. If you cannot confirm an item is on their menu, still suggest a realistic order for the cuisine but set "onMenu": false.\n` +
    `- Each option is a full meal: a main dish plus a complementary side that also fits the ${diet} diet.\n` +
    `- "price": the price in US dollars of the main item (a number like 12.99). If you read it from their actual menu set "priceOnMenu": true. If you cannot find a real price, give your best estimate and set "priceOnMenu": false.\n` +
    `- Give integer macro ESTIMATES (net carbs, sugar, protein) for the whole meal. Approximate is fine.\n` +
    `- Overall fit: "strong" if great ${diet} options clearly exist, "good" if it works with modifications, "weak" if little fits and it is the closest compromise.\n` +
    `- Never use em-dashes or en-dashes; use commas, colons, or periods.\n\n` +
    `Reply with ONLY a JSON object, no other text, in exactly this shape:\n` +
    `{"fit":"strong","menuFound":true,"options":[{"main":"","side":"","remove":[""],"add":[""],"why":"","onMenu":true,"price":0,"priceOnMenu":true,"carbs":0,"sugar":0,"protein":0}]}`;

  const user =
    `Restaurant: ${place.name}${where} (cuisine types: ${place.types.join(", ") || "restaurant"}).${siteHint} ` +
    `Find their real menu and give ${diet} orders.`;

  const webSearch: Anthropic.WebSearchTool20250305 = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 5,
  };
  const webFetch: Anthropic.WebFetchTool20260309 = {
    type: "web_fetch_20260309",
    name: "web_fetch",
    max_uses: 5,
    max_content_tokens: 60000,
    // Required for models without programmatic tool calling (e.g. haiku): the
    // model invokes the fetch directly rather than from code execution.
    allowed_callers: ["direct"],
  };

  // Server tools (web_search, web_fetch) can return stop_reason "pause_turn" when
  // the turn isn't finished (e.g. reading a large menu PDF). We must resume by
  // sending the partial assistant turn back, looping until the model finishes.
  const runLoop = async (
    tools: Anthropic.ToolUnion[],
  ): Promise<Record<string, unknown> | null> => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
    for (let turn = 0; turn < 5; turn++) {
      let resp;
      try {
        resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 3500,
          tools,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages,
        });
      } catch {
        return null;
      }
      if (resp.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: resp.content });
        continue; // resume the paused server-tool turn
      }
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return extractJson(text);
    }
    return null; // gave up after too many pauses
  };

  // Try with menu fetching first; fall back to search-only if that yields nothing.
  const data = (await runLoop([webSearch, webFetch])) ?? (await runLoop([webSearch]));
  if (!data) return null;

  const fitRaw = String(data.fit);
  const fit: Fit = ["strong", "good", "weak"].includes(fitRaw) ? (fitRaw as Fit) : "good";
  const options: MealOption[] = (Array.isArray(data.options) ? data.options : [])
    .slice(0, 3)
    .map((o: Record<string, unknown>) => {
      const price = money(o.price);
      return {
        main: clean(o.main),
        side: clean(o.side),
        mods: { rm: arr(o.remove), add: arr(o.add) },
        why: clean(o.why),
        onMenu: Boolean(o.onMenu),
        price,
        // Estimated unless we have a real price the model read from the menu.
        priceEstimated: price === undefined ? true : !o.priceOnMenu,
        carbs: num(o.carbs),
        sugar: num(o.sugar),
        protein: num(o.protein),
      };
    })
    .filter((o: MealOption) => o.main);
  if (options.length === 0) return null;

  // Restaurant-level price = cheapest option (used for budget/display fallback).
  const prices = options.map((o) => o.price).filter((n): n is number => typeof n === "number");
  const price = prices.length ? Math.min(...prices) : place.price;

  return { fit, price, options };
}

// Run an async map with a small concurrency cap (web search is rate-limited and
// each call costs a search, so we don't fan out 12 at once).
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

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

  const picks = await mapLimit(misses, 6, (p) => groundOne(diet, p));
  misses.forEach((p, i) => {
    const pick = picks[i];
    if (pick) {
      cache.set(cacheKey(diet, p.name), pick);
      out.set(p.name, pick);
    }
  });

  return out;
}
