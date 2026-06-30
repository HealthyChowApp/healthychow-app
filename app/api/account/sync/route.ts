import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

// Reconciles a user's subscription status against Stripe (source of truth),
// independent of the webhook. The caller passes their Supabase access token;
// we validate it, look up their Stripe subscription by email, and update their
// own profile row (RLS permits own-row updates).
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const stripe = getStripe();
  if (!url || !anon || !stripe) {
    return Response.json({ subscribed: false, error: "not_configured" });
  }

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ subscribed: false, error: "no_token" }, { status: 401 });

  // Client scoped to the user's token, so RLS lets us update their own row.
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return Response.json({ subscribed: false, error: "invalid_token" }, { status: 401 });

  // Does this user's email have an active (or trialing) subscription in Stripe?
  let active = false;
  try {
    if (user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 10 });
      for (const c of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10 });
        if (subs.data.some((s) => s.status === "active" || s.status === "trialing")) {
          active = true;
          break;
        }
      }
    }
  } catch {
    // If Stripe lookup fails, fall back to the existing DB value (don't downgrade).
    const { data } = await sb.from("profiles").select("subscribed").eq("id", user.id).single();
    return Response.json({ subscribed: Boolean(data?.subscribed) });
  }

  await sb
    .from("profiles")
    .update({ subscribed: active, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  return Response.json({ subscribed: active });
}
