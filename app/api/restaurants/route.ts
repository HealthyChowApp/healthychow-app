import type { NextRequest } from "next/server";
import { AVOID, DIETS, RESTAURANTS, STYLES, type DietId, type Fit, type StyleId } from "@/lib/data";
import {
  geocode,
  hasPlacesKey,
  milesBetween,
  priceFromLevel,
  reverseGeocode,
  searchRestaurants,
  styleFromTypes,
  tagFromTypes,
} from "@/lib/places";
import {
  authoredRec,
  knownChain,
  pickConflictsWithAvoid,
  recToPick,
  type ResultCard,
} from "@/lib/recommend";
import { generateRecs, hasEngine, type PlaceForRec } from "@/lib/engine";

// Live menu lookups (web search + fetch per restaurant) can take a while; allow
// up to the platform max so the request isn't cut off mid-analysis.
export const maxDuration = 60;

const FITRANK: Record<Fit, number> = { strong: 0, good: 1, weak: 2 };
const isDiet = (v: string | null): v is DietId => DIETS.some((d) => d.id === v);
const isStyle = (v: string): v is StyleId => STYLES.some((s) => s.id === v);

// Sort: real picks first (by fit), then "coming soon", then nearest.
function sortCards(cards: ResultCard[]): ResultCard[] {
  return cards.sort((a, b) => {
    const ra = a.rec ? FITRANK[a.rec.fit] : 9;
    const rb = b.rec ? FITRANK[b.rec.fit] : 9;
    return ra - rb || parseFloat(a.dist) - parseFloat(b.dist);
  });
}

// Fallback: build cards from the curated sample data (used when no key or on error).
function sampleCards(diet: DietId, styles: StyleId[], budget: number, avoid: string[]): ResultCard[] {
  const cards = RESTAURANTS.filter((r) => {
    const rec = r.recs[diet];
    if (!rec) return false;
    if (styles.length && !styles.includes(r.style)) return false;
    if (rec.price > budget) return false;
    if (avoid.length && pickConflictsWithAvoid(recToPick(rec), avoid)) return false;
    return true;
  }).map((r) => ({
    name: r.name,
    tag: r.tag,
    dist: r.dist,
    style: r.style,
    independent: r.independent,
    rec: r.recs[diet] ? recToPick(r.recs[diet]!) : null,
  }));
  return sortCards(cards);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const dietParam = sp.get("diet");
  if (!isDiet(dietParam)) {
    return Response.json({ error: "invalid or missing diet" }, { status: 400 });
  }
  const diet: DietId = dietParam;
  const styles = (sp.get("styles") ?? "").split(",").filter(isStyle);
  const budget = Number(sp.get("budget") ?? "40") || 40;
  // Allergies/exclusions: only accept entries from our known AVOID list.
  const avoid = (sp.get("avoid") ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => AVOID.some((k) => k.toLowerCase() === a.toLowerCase()));
  // quick=1: skip the engine and return instantly (authored chains resolved,
  // everything else rec:null as a pending placeholder the client can skeleton).
  const quick = sp.get("quick") === "1";
  const loc = (sp.get("loc") ?? "").trim();
  const latStr = sp.get("lat");
  const lngStr = sp.get("lng");
  const lat = latStr !== null ? Number(latStr) : NaN;
  const lng = lngStr !== null ? Number(lngStr) : NaN;
  const haveCoords = Number.isFinite(lat) && Number.isFinite(lng);

  if (!hasPlacesKey() || (!loc && !haveCoords)) {
    return Response.json({ source: "sample", loc, cards: sampleCards(diet, styles, budget, avoid) });
  }

  try {
    let center: { lat: number; lng: number } | null;
    let resolvedLoc = loc;
    if (haveCoords) {
      center = { lat, lng };
      resolvedLoc = (await reverseGeocode(lat, lng)) ?? "your location";
    } else {
      center = await geocode(loc);
    }
    if (!center) {
      return Response.json({ source: "sample", loc, cards: sampleCards(diet, styles, budget, avoid) });
    }
    const places = await searchRestaurants(center, styles);

    // Build candidate cards. Known chains get our authored recs; the rest are
    // filled by the engine below (or left as "Pick soon" if no engine).
    const built: Array<{ card: ResultCard; place: PlaceForRec }> = [];
    for (const p of places) {
      const chain = knownChain(p.name);
      const style = chain?.style ?? p.searchedStyle ?? styleFromTypes(p.types, p.priceLevel);
      if (styles.length && !styles.includes(style)) continue;

      // Authored chain pick, unless it conflicts with an avoided ingredient,
      // in which case the engine regenerates it under the constraint.
      let rec = chain ? authoredRec(p.name, diet) : null;
      if (rec && pickConflictsWithAvoid(rec, avoid)) rec = null;
      const price = rec?.price ?? priceFromLevel(p.priceLevel);
      if (price > budget) continue;

      built.push({
        card: {
          name: p.name,
          tag: chain?.tag ?? tagFromTypes(p.types),
          dist: `${milesBetween(center, p).toFixed(1)} mi`,
          style,
          independent: !chain,
          rec,
          lat: p.lat,
          lng: p.lng,
          url: p.website ?? p.mapsUri,
        },
        place: { name: p.name, types: p.types, price, area: resolvedLoc, website: p.website ?? p.mapsUri },
      });
    }

    // Cap to the nearest 10 before generating, so the engine only works on what
    // we show and the request finishes inside the serverless time limit.
    built.sort((a, b) => parseFloat(a.card.dist) - parseFloat(b.card.dist));
    const top = built.slice(0, 10);

    // Quick mode: return instantly. Chains carry their authored picks; the rest
    // stay rec:null so the client can render "reading their menu" skeletons.
    if (quick) {
      return Response.json({
        source: "live",
        loc: resolvedLoc,
        center: { lat: center.lat, lng: center.lng },
        cards: sortCards(top.map((b) => b.card)),
      });
    }

    // Engine: generate picks for restaurants without an authored rec.
    if (hasEngine()) {
      const need = top.filter((b) => b.card.rec === null);
      if (need.length) {
        const recs = await generateRecs(diet, need.map((b) => b.place), avoid);
        for (const b of need) {
          const r = recs.get(b.place.name);
          if (r) b.card.rec = r;
        }
      }
    }

    // Only show restaurants we actually have a pick for (hide "no pick" cards).
    const withRec = top.map((b) => b.card).filter((c) => c.rec !== null);

    return Response.json({
      source: "live",
      loc: resolvedLoc,
      center: { lat: center.lat, lng: center.lng },
      cards: sortCards(withRec),
    });
  } catch (err) {
    // Any geocode/Places failure (billing, quota, network) degrades to sample data.
    return Response.json({
      source: "sample",
      loc,
      note: err instanceof Error ? err.message : "places lookup failed",
      cards: sampleCards(diet, styles, budget, avoid),
    });
  }
}
