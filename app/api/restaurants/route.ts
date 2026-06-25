import type { NextRequest } from "next/server";
import { DIETS, RESTAURANTS, STYLES, type DietId, type Fit, type StyleId } from "@/lib/data";
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
import { authoredRec, knownChain, type ResultCard } from "@/lib/recommend";

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
function sampleCards(diet: DietId, styles: StyleId[], budget: number): ResultCard[] {
  const cards = RESTAURANTS.filter((r) => {
    const rec = r.recs[diet];
    if (!rec) return false;
    if (styles.length && !styles.includes(r.style)) return false;
    if (rec.price > budget) return false;
    return true;
  }).map((r) => ({
    name: r.name,
    tag: r.tag,
    dist: r.dist,
    style: r.style,
    independent: r.independent,
    rec: r.recs[diet] ?? null,
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
  const loc = (sp.get("loc") ?? "").trim();
  const latStr = sp.get("lat");
  const lngStr = sp.get("lng");
  const lat = latStr !== null ? Number(latStr) : NaN;
  const lng = lngStr !== null ? Number(lngStr) : NaN;
  const haveCoords = Number.isFinite(lat) && Number.isFinite(lng);

  if (!hasPlacesKey() || (!loc && !haveCoords)) {
    return Response.json({ source: "sample", loc, cards: sampleCards(diet, styles, budget) });
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
      return Response.json({ source: "sample", loc, cards: sampleCards(diet, styles, budget) });
    }
    const places = await searchRestaurants(center);

    const cards: ResultCard[] = [];
    for (const p of places) {
      const chain = knownChain(p.name);
      const style = chain?.style ?? styleFromTypes(p.types, p.priceLevel);
      if (styles.length && !styles.includes(style)) continue;

      const rec = chain ? authoredRec(p.name, diet) : null;
      const price = rec?.price ?? priceFromLevel(p.priceLevel);
      if (price > budget) continue;

      cards.push({
        name: p.name,
        tag: chain?.tag ?? tagFromTypes(p.types),
        dist: `${milesBetween(center, p).toFixed(1)} mi`,
        style,
        independent: !chain,
        rec,
      });
    }

    return Response.json({ source: "live", loc: resolvedLoc, cards: sortCards(cards).slice(0, 12) });
  } catch (err) {
    // Any geocode/Places failure (billing, quota, network) degrades to sample data.
    return Response.json({
      source: "sample",
      loc,
      note: err instanceof Error ? err.message : "places lookup failed",
      cards: sampleCards(diet, styles, budget),
    });
  }
}
