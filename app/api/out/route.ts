import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Outbound order-link router: every "Order" / "Delivery" click passes through
// here so we can (1) log the click for conversion tracking and (2) wrap the
// destination in an affiliate deep link when one is configured.
//
// Affiliate templates are env vars containing a {url} placeholder, e.g.
//   DOORDASH_AFFILIATE_TEMPLATE=https://click.linksynergy.com/deeplink?id=XXX&mid=YYY&murl={url}
// They are applied only when the destination is on the matching platform, so a
// restaurant's own website is never rewritten.

const AFFILIATE_RULES: Array<{ hostEndsWith: string; envVar: string }> = [
  { hostEndsWith: "doordash.com", envVar: "DOORDASH_AFFILIATE_TEMPLATE" },
  { hostEndsWith: "ubereats.com", envVar: "UBEREATS_AFFILIATE_TEMPLATE" },
  { hostEndsWith: "grubhub.com", envVar: "GRUBHUB_AFFILIATE_TEMPLATE" },
];

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const dest = sp.get("url") ?? "";
  const restaurant = (sp.get("r") ?? "").slice(0, 120);
  const kind = (sp.get("k") ?? "order").slice(0, 24);

  let target: URL;
  try {
    target = new URL(dest);
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    return Response.json({ error: "invalid url" }, { status: 400 });
  }

  // Log the click, best effort; never block the redirect on it.
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (sbUrl && sbAnon) {
    try {
      await createClient(sbUrl, sbAnon)
        .from("order_clicks")
        .insert({ restaurant, kind, dest: target.href });
    } catch {
      // table missing or network hiccup; the redirect still happens
    }
  }

  // Apply an affiliate wrapper if one is configured for this platform.
  let final = target.href;
  const host = target.hostname.toLowerCase();
  for (const rule of AFFILIATE_RULES) {
    const tpl = process.env[rule.envVar];
    if (tpl && tpl.includes("{url}") && (host === rule.hostEndsWith || host.endsWith(`.${rule.hostEndsWith}`))) {
      final = tpl.replace("{url}", encodeURIComponent(target.href));
      break;
    }
  }

  return Response.redirect(final, 302);
}
