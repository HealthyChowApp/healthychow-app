import type { NextRequest } from "next/server";

// Proxies Google Static Maps so the API key stays server-side. Renders the
// user location (turmeric pin) and, when provided, restaurant pins (kale).
// Requires the "Maps Static API" to be enabled and allowed on the key.
export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return new Response(null, { status: 404 });

  const sp = request.nextUrl.searchParams;
  const center = sp.get("center"); // "lat,lng"
  const markers = sp.get("markers"); // "lat,lng|lat,lng|..."
  const zoom = sp.get("zoom") ?? "14";
  const size = sp.get("size") ?? "640x300";

  const params = new URLSearchParams();
  params.set("size", size);
  params.set("scale", "2");
  params.set("maptype", "roadmap");
  params.set("key", key);

  if (markers) {
    // Restaurant pins; Static Maps auto-fits the viewport to all markers.
    if (center) params.append("markers", `color:0xF4B23E|label:•|${center}`);
    for (const m of markers.split("|").filter(Boolean)) {
      params.append("markers", `color:0x1E4F2B|${m}`);
    }
  } else if (center) {
    params.set("center", center);
    params.set("zoom", zoom);
    params.append("markers", `color:0xF4B23E|${center}`);
  } else {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return new Response(null, { status: 502 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
