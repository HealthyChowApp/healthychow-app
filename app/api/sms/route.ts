import type { NextRequest } from "next/server";

// Normalize a US-style phone number to E.164 (e.g. +15551234567).
function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function POST(request: NextRequest) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return Response.json({ error: "sms_not_configured" }, { status: 503 });
  }

  let payload: { phone?: string; name?: string; url?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const to = toE164(String(payload.phone ?? ""));
  if (!to) return Response.json({ error: "invalid_phone" }, { status: 400 });

  const name = String(payload.name ?? "the restaurant").slice(0, 80);
  const url = String(payload.url ?? "").slice(0, 300);
  const text = `Healthy Chow directions to ${name}: ${url}`;

  try {
    const form = new URLSearchParams({ To: to, From: from, Body: text });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ error: "send_failed", detail: detail.slice(0, 200) }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
}
