import type { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";

// Creates a Stripe Checkout session for the chosen plan, tied to the logged-in user.
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "stripe_not_configured" }, { status: 503 });

  let body: { plan?: string; userId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const priceId =
    body.plan === "yearly" ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
  if (!priceId) return Response.json({ error: "price_not_configured" }, { status: 500 });

  const userId = body.userId ?? "";
  const origin = request.nextUrl.origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: body.email || undefined,
      client_reference_id: userId || undefined,
      metadata: { supabase_user_id: userId },
      subscription_data: { metadata: { supabase_user_id: userId } },
      allow_promotion_codes: true,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return Response.json(
      { error: "checkout_failed", detail: e instanceof Error ? e.message : "" },
      { status: 502 },
    );
  }
}
