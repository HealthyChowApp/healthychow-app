import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Stripe sends subscription lifecycle events here; we update the user's profile.
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = getSupabaseAdmin();
  if (!stripe || !secret || !admin) return new Response("not configured", { status: 503 });

  const sig = request.headers.get("stripe-signature") ?? "";
  const raw = await request.text(); // raw body required for signature verification

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  const setSub = async (userId: string, subscribed: boolean, fields: Record<string, unknown> = {}) => {
    if (!userId) return;
    await admin
      .from("profiles")
      .update({ subscribed, updated_at: new Date().toISOString(), ...fields })
      .eq("id", userId);
  };

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.supabase_user_id || s.client_reference_id || "";
      await setSub(userId, true, {
        stripe_customer_id: typeof s.customer === "string" ? s.customer : null,
        stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : null,
      });
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id || "";
      const active = sub.status === "active" || sub.status === "trialing";
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
      await setSub(userId, active, {
        stripe_subscription_id: sub.id,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      });
    }
  } catch {
    // Respond 200 anyway so Stripe doesn't retry on our internal hiccup.
  }

  return new Response("ok", { status: 200 });
}
