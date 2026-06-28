// Server-only Google Maps Platform client (Geocoding API + Places API New).
// Never import this into a client component: it reads the secret API key.

import type { StyleId } from "./data";

export interface PlaceLite {
  id: string;
  name: string;
  types: string[];
  priceLevel?: string;
  lat: number;
  lng: number;
  website?: string;
  mapsUri?: string;
}

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

export function hasPlacesKey(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export async function geocode(location: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(location)}&key=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`Geocode status ${data.status}: ${data.error_message ?? ""}`);
  }
  return data.results[0].geometry.location;
}

// Reverse-geocode coordinates to a readable "City, ST" label for display.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const url = `${GEOCODE_URL}?latlng=${lat},${lng}&key=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;
  const comps: Array<{ types: string[]; short_name: string }> = data.results[0].address_components ?? [];
  const get = (type: string) => comps.find((c) => c.types.includes(type))?.short_name;
  const city = get("locality") ?? get("sublocality") ?? get("administrative_area_level_2");
  const state = get("administrative_area_level_1");
  return [city, state].filter(Boolean).join(", ") || (data.results[0].formatted_address as string);
}

export async function searchRestaurants(
  center: { lat: number; lng: number },
  radiusMeters = 8000,
): Promise<PlaceLite[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  const res = await fetch(PLACES_SEARCH_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.priceLevel,places.types,places.location,places.websiteUri,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: "restaurants",
      maxResultCount: 20,
      locationBias: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters },
      },
    }),
  });
  if (!res.ok) throw new Error(`Places HTTP ${res.status}`);
  const data = await res.json();
  return (data.places ?? []).map((p: Record<string, unknown>) => {
    const display = p.displayName as { text?: string } | undefined;
    const loc = p.location as { latitude?: number; longitude?: number } | undefined;
    return {
      id: String(p.id ?? ""),
      name: display?.text ?? "Unnamed restaurant",
      types: (p.types as string[]) ?? [],
      priceLevel: p.priceLevel as string | undefined,
      lat: loc?.latitude ?? center.lat,
      lng: loc?.longitude ?? center.lng,
      website: p.websiteUri as string | undefined,
      mapsUri: p.googleMapsUri as string | undefined,
    };
  });
}

// Haversine distance in miles, formatted like "0.8 mi".
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// Best-guess dining style from Google place types + price level.
export function styleFromTypes(types: string[], priceLevel?: string): StyleId {
  const t = new Set(types);
  if (t.has("fast_food_restaurant") || t.has("hamburger_restaurant")) return "fast-food";
  if (t.has("meal_takeaway") || t.has("sandwich_shop") || t.has("cafe") || t.has("bakery")) return "take-out";
  if (priceLevel === "PRICE_LEVEL_EXPENSIVE" || priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE") return "dine-in";
  if (priceLevel === "PRICE_LEVEL_INEXPENSIVE") return "fast-casual";
  return "dine-in";
}

// Rough per-meal dollar estimate from the Places price level enum.
export function priceFromLevel(priceLevel?: string): number {
  switch (priceLevel) {
    case "PRICE_LEVEL_INEXPENSIVE": return 10;
    case "PRICE_LEVEL_MODERATE": return 18;
    case "PRICE_LEVEL_EXPENSIVE": return 30;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 50;
    default: return 16;
  }
}

// A readable cuisine tag from Google types, e.g. "seafood_restaurant" -> "Seafood".
export function tagFromTypes(types: string[]): string {
  const skip = new Set(["restaurant", "food", "point_of_interest", "establishment", "store"]);
  const t = types.find((x) => x.endsWith("_restaurant") && !skip.has(x)) ?? types.find((x) => !skip.has(x));
  if (!t) return "Restaurant";
  return t
    .replace(/_restaurant$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
