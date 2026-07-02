"use client";

import { useEffect, useState } from "react";
import { Mark } from "./Mark";
import {
  AVOID,
  DIETS,
  STYLES,
  dietColor,
  dietName,
  type DietId,
  type Fit,
  type StyleId,
} from "@/lib/data";
import type { ResultCard } from "@/lib/recommend";
import { getSupabase } from "@/lib/supabase";

type Screen = "welcome" | "diet" | "allergy" | "style" | "budget" | "loc" | "results";

const FIT_LABEL: Record<Fit, string> = { strong: "Great fit", good: "Good fit", weak: "Closest pick" };

type FitFilter = "all" | Fit;
const FIT_OPTS: { k: FitFilter; t: string }[] = [
  { k: "all", t: "All" },
  { k: "strong", t: "Great fit" },
  { k: "good", t: "Good fit" },
  { k: "weak", t: "Closest" },
];

type SortBy = "fit" | "carbs" | "protein" | "sugar" | "dist" | "price";
const SORT_OPTS: { k: SortBy; t: string }[] = [
  { k: "fit", t: "Best fit" },
  { k: "carbs", t: "Lowest net carbs" },
  { k: "protein", t: "Highest protein" },
  { k: "sugar", t: "Lowest sugar" },
  { k: "dist", t: "Nearest" },
  { k: "price", t: "Lowest price" },
];

function Wordmark({ size }: { size: number }) {
  return (
    <div className="wordmark" style={{ fontSize: size }}>
      <span className="h">Healthy</span> <span className="c">Chow</span>
    </div>
  );
}

// Static map image that hides itself if the map can't load (e.g. Maps Static API not enabled).
function MapImg({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img
      className={`hcmap ${className}`}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setOk(false)}
    />
  );
}

// A Google Maps directions link to the restaurant, and an SMS draft carrying it.
function directionsUrl(c: ResultCard) {
  const dest = c.lat != null && c.lng != null ? `${c.lat},${c.lng}` : encodeURIComponent(c.name);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
function directionsSms(c: ResultCard) {
  const body = `Directions to ${c.name}: ${directionsUrl(c)}`;
  return `sms:?&body=${encodeURIComponent(body)}`;
}

// Outbound links go through /api/out for click logging + affiliate wrapping.
function outLink(c: ResultCard, kind: "order" | "delivery") {
  const dest =
    kind === "delivery"
      ? `https://www.doordash.com/search/store/${encodeURIComponent(c.name)}`
      : (c.url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name)}`);
  return `/api/out?url=${encodeURIComponent(dest)}&r=${encodeURIComponent(c.name)}&k=${kind}`;
}

export default function HealthyChowApp() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [diet, setDiet] = useState<DietId | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [styles, setStyles] = useState<StyleId[]>(STYLES.map((s) => s.id));
  const [budget, setBudget] = useState(24);
  const [loc, setLoc] = useState("");

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "done" | "error">("idle");
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

  const [cards, setCards] = useState<ResultCard[]>([]);
  const [source, setSource] = useState<"live" | "sample">("sample");
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false); // quick results shown, AI picks still filling in
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // per-card "more picks"
  const [hasSaved, setHasSaved] = useState(false); // returning user with saved preferences
  const [subscribed, setSubscribed] = useState(false);
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("fit");
  const [smsCard, setSmsCard] = useState<ResultCard | null>(null);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsState, setSmsState] = useState<"idle" | "sending" | "sent" | "error" | "unconfigured">(
    "idle",
  );
  const [smsMsg, setSmsMsg] = useState("");

  async function sendDirections() {
    if (!smsCard) return;
    setSmsState("sending");
    setSmsMsg("");
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: smsPhone, name: smsCard.name, url: directionsUrl(smsCard) }),
      });
      if (res.ok) {
        setSmsState("sent");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 || data.error === "sms_not_configured") {
        setSmsState("unconfigured");
      } else if (data.error === "invalid_phone") {
        setSmsState("error");
        setSmsMsg("Enter a valid mobile number.");
      } else {
        setSmsState("error");
        setSmsMsg("Could not send. Please try again.");
      }
    } catch {
      setSmsState("error");
      setSmsMsg("Could not send. Check your connection.");
    }
  }

  // --- Accounts (Supabase auth) ---
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [accountSubscribed, setAccountSubscribed] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPw, setAuthPw] = useState("");
  const [authState, setAuthState] = useState<"idle" | "working">("idle");
  const [authMsg, setAuthMsg] = useState("");

  const [checkoutMsg, setCheckoutMsg] = useState("");

  async function syncSubscription() {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/account/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const j = await res.json();
        setAccountSubscribed(Boolean(j.subscribed));
      }
    } catch {
      // ignore
    }
  }

  async function loadProfile(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from("profiles").select("subscribed").eq("id", id).single();
    if (data?.subscribed) {
      setAccountSubscribed(true);
      return;
    }
    // DB not marked subscribed; reconcile against Stripe (self-heals webhook misses).
    syncSubscription();
  }

  async function refreshSubscription() {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const id = data.session?.user?.id;
    if (id) await loadProfile(id);
  }

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) {
        setUser({ id: u.id, email: u.email ?? "" });
        loadProfile(u.id);
      }
    });
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (u) {
        setUser({ id: u.id, email: u.email ?? "" });
        loadProfile(u.id);
      } else {
        setUser(null);
        setAccountSubscribed(false);
      }
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle the return from Stripe Checkout.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const co = new URLSearchParams(window.location.search).get("checkout");
    if (co === "success") {
      setCheckoutMsg("Thanks. Your membership is active and your picks are unlocked.");
      let n = 0;
      const t = setInterval(() => {
        refreshSubscription();
        if (++n >= 4) clearInterval(t);
      }, 1500);
      window.history.replaceState({}, "", "/");
      return () => clearInterval(t);
    }
    if (co === "cancel") window.history.replaceState({}, "", "/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAuth(mode: "login" | "signup") {
    setAuthMode(mode);
    setAuthMsg("");
    setAuthState("idle");
    setAuthOpen(true);
  }

  async function doAuth() {
    const sb = getSupabase();
    if (!sb) {
      setAuthMsg("Accounts are not configured yet.");
      return;
    }
    setAuthState("working");
    setAuthMsg("");
    const res =
      authMode === "signup"
        ? await sb.auth.signUp({ email: authEmail, password: authPw })
        : await sb.auth.signInWithPassword({ email: authEmail, password: authPw });
    setAuthState("idle");
    if (res.error) {
      setAuthMsg(res.error.message);
      return;
    }
    if (!res.data.session) {
      setAuthMsg("Account created. Check your email to confirm, then log in.");
      return;
    }
    setAuthOpen(false);
    setAuthEmail("");
    setAuthPw("");
  }

  async function signOut() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setUser(null);
    setAccountSubscribed(false);
    setSubscribed(false);
  }

  // Subscribe: require an account, then open Stripe Checkout for the chosen plan.
  async function startSubscribe(plan: "monthly" | "yearly") {
    if (!user) {
      openAuth("signup");
      return;
    }
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, userId: user.id, email: user.email }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      if (res.status === 503) {
        // Stripe not configured yet; keep the demo usable with a session unlock.
        setSubscribed(true);
      }
    } catch {
      // network error: leave locked
    }
  }

  // Promise-based geolocation, shared by the loc screen and the welcome shortcut.
  function geolocate(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000 },
      );
    });
  }

  async function useCurrentLocation() {
    setGeoStatus("locating");
    const c = await geolocate();
    if (c) {
      setCoords(c);
      setLoc("Current location");
      setGeoStatus("done");
    } else {
      setGeoStatus("error");
    }
  }

  // Default to the user's current location: request it automatically when the
  // location screen opens (the browser prompts for permission once).
  useEffect(() => {
    if (screen === "loc" && geoStatus === "idle" && !coords) {
      useCurrentLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Returning users: restore saved preferences so they can skip the wizard.
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("hc-prefs") ?? "null");
      if (p?.diet && DIETS.some((d) => d.id === p.diet)) {
        setDiet(p.diet as DietId);
        if (Array.isArray(p.avoid)) setAvoid(p.avoid.filter((a: string) => AVOID.includes(a)));
        if (Array.isArray(p.styles) && p.styles.length) {
          const valid = p.styles.filter((s: string) => STYLES.some((x) => x.id === s));
          if (valid.length) setStyles(valid as StyleId[]);
        }
        if (typeof p.budget === "number") setBudget(p.budget);
        if (typeof p.loc === "string" && p.loc && p.loc !== "Current location") setLoc(p.loc);
        setHasSaved(true);
      }
    } catch {
      // corrupted prefs: ignore, wizard runs as normal
    }
  }, []);

  const go = (s: Screen) => {
    setScreen(s);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const color = dietColor(diet);
  const isSubscribed = subscribed || accountSubscribed;
  const visibleCards = fitFilter === "all" ? cards : cards.filter((c) => c.rec?.fit === fitFilter);
  const sortedCards = [...visibleCards].sort((a, b) => {
    switch (sortBy) {
      case "carbs":
        return (a.rec?.options[0]?.carbs ?? Infinity) - (b.rec?.options[0]?.carbs ?? Infinity);
      case "sugar":
        return (a.rec?.options[0]?.sugar ?? Infinity) - (b.rec?.options[0]?.sugar ?? Infinity);
      case "protein":
        return (b.rec?.options[0]?.protein ?? -Infinity) - (a.rec?.options[0]?.protein ?? -Infinity);
      case "price":
        return (a.rec?.price ?? Infinity) - (b.rec?.price ?? Infinity);
      case "dist":
        return parseFloat(a.dist) - parseFloat(b.dist);
      default:
        return 0; // "fit" keeps the server's fit-then-distance order
    }
  });
  // Free sample: the first visible pick is unlocked for non-subscribers.
  const freeName = !isSubscribed ? (sortedCards.find((c) => c.rec)?.name ?? null) : null;

  async function findPicks(oc?: { lat: number; lng: number }) {
    if (!diet) return;
    const useCoords = oc ?? coords;
    go("results");
    setLoading(true);
    setRefining(false);
    setFitFilter("all");
    setSortBy("fit");
    setExpanded({});

    const params = new URLSearchParams({
      diet,
      styles: styles.join(","),
      budget: String(budget),
    });
    if (avoid.length) params.set("avoid", avoid.join(","));
    if (useCoords) {
      params.set("lat", String(useCoords.lat));
      params.set("lng", String(useCoords.lng));
    } else {
      params.set("loc", loc);
    }

    // Remember preferences so returning users can skip the wizard.
    try {
      localStorage.setItem("hc-prefs", JSON.stringify({ diet, avoid, styles, budget, loc }));
      setHasSaved(true);
    } catch {
      // storage unavailable (private mode); not a problem
    }

    // Phase 1: instant results. Known chains resolve immediately; local spots
    // come back as placeholders we render as "reading their menu" skeletons.
    let quickShown = false;
    try {
      const qres = await fetch(`/api/restaurants?${params.toString()}&quick=1`);
      const q = await qres.json();
      if (Array.isArray(q.cards) && q.cards.length) {
        if (q.loc) setLoc(q.loc);
        setCards(q.cards);
        setCenter(q.center ?? null);
        setSource(q.source === "live" ? "live" : "sample");
        setLoading(false);
        setRefining(true);
        quickShown = true;
      }
    } catch {
      // quick pass failed; the full request below still covers us
    }

    // Phase 2: the full run with AI menu analysis replaces the placeholders.
    try {
      const res = await fetch(`/api/restaurants?${params.toString()}`);
      const data = await res.json();
      if (data.loc) setLoc(data.loc);
      setCards(data.cards ?? []);
      setCenter(data.center ?? null);
      setSource(data.source === "live" ? "live" : "sample");
    } catch {
      if (!quickShown) {
        setCards([]);
        setCenter(null);
        setSource("sample");
      }
    } finally {
      setLoading(false);
      setRefining(false);
    }
  }

  // Welcome-screen shortcut for returning users: geolocate if needed, then search.
  async function quickFind() {
    let c = coords;
    if (!c && !loc) {
      setGeoStatus("locating");
      c = await geolocate();
      if (c) {
        setCoords(c);
        setLoc("Current location");
        setGeoStatus("done");
      }
    }
    if (!c && !loc) {
      go("loc"); // no permission and no saved town: ask once
      return;
    }
    findPicks(c ?? undefined);
  }

  return (
    <div className="app">
      {/* WELCOME */}
      {screen === "welcome" && (
        <section className="screen">
          <div className="welcome">
            {checkoutMsg && <div className="toast">{checkoutMsg}</div>}
            <div className="brandtop">
              <Wordmark size={48} />
              <div className="scout">Your Dietary Scout</div>
              <div className="tagline">Eat out. Eat right.</div>
            </div>

            <Mark size={104} className="hero-mark" />

            <h1>
              Eat out anywhere.
              <br />
              Still eat right.
            </h1>
            <p className="lead">
              Healthy Chow is your scout. Tell us how you want to eat and we&apos;ll tell you the
              exact order, modifications and all, at the spots near you.
            </p>

            {isSubscribed && <div className="member">✓ You&apos;re a member. Your picks are unlocked.</div>}
            {hasSaved && diet && (
              <div className="quickcard">
                <div className="quicklab">Your usual</div>
                <div className="quickchips">
                  <span className="s diet" style={{ background: color }}>
                    {dietName(diet)}
                  </span>
                  {avoid.map((a) => (
                    <span key={a} className="s">
                      No {a}
                    </span>
                  ))}
                  <span className="s">≤ ${budget}/meal</span>
                  {loc && <span className="s">📍 {loc}</span>}
                </div>
              </div>
            )}
            <div className="spacer" />
            {hasSaved && diet ? (
              <>
                <button className="btn cta" onClick={quickFind}>
                  {geoStatus === "locating" ? "Locating you..." : "Find my picks"}
                </button>
                <button className="btn ghost" onClick={() => go("diet")}>
                  Edit preferences
                </button>
              </>
            ) : (
              <button
                className="btn cta"
                onClick={() => {
                  // Ask for location up front so the location step is usually pre-filled.
                  if (geoStatus === "idle" && !coords) useCurrentLocation();
                  go("diet");
                }}
              >
                Get started
              </button>
            )}
            {user ? (
              <button className="btn ghost" onClick={signOut}>
                Sign out ({user.email})
              </button>
            ) : (
              <button className="btn ghost" onClick={() => openAuth("login")}>
                Log in
              </button>
            )}
            {!isSubscribed && (
              <div className="freenote">Free to search. Your first pick is free, too.</div>
            )}
          </div>
        </section>
      )}

      {/* DIET */}
      {screen === "diet" && (
        <section className="screen">
          <div className="topbar">
            <button className="back" onClick={() => go("welcome")}>
              ←
            </button>
            <div className="progress">
              <i style={{ width: "20%" }} />
            </div>
          </div>
          <div className="pad">
            <h2>How do you want to eat?</h2>
            <p className="sub">Pick your plan. We&apos;ll tailor every pick to it.</p>
            {DIETS.map((d) => {
              const sel = diet === d.id;
              return (
                <button
                  key={d.id}
                  className={`opt${sel ? " sel" : ""}`}
                  style={sel ? { borderColor: d.color, background: d.color + "14" } : undefined}
                  onClick={() => setDiet(d.id)}
                >
                  <div className="pin" style={{ background: d.color }}>
                    <span>{d.ic}</span>
                  </div>
                  <div>
                    <div className="t">{d.t}</div>
                    <div className="d">{d.d}</div>
                  </div>
                  <div
                    className="chk"
                    style={sel ? { background: d.color, borderColor: d.color } : undefined}
                  >
                    ✓
                  </div>
                </button>
              );
            })}
          </div>
          <div className="btn-row">
            <button className="btn" disabled={!diet} onClick={() => go("allergy")}>
              Continue
            </button>
          </div>
        </section>
      )}

      {/* ALLERGIES */}
      {screen === "allergy" && (
        <section className="screen">
          <div className="topbar">
            <button className="back" onClick={() => go("diet")}>
              ←
            </button>
            <div className="progress">
              <i style={{ width: "40%" }} />
            </div>
          </div>
          <div className="pad">
            <h2>Anything to skip?</h2>
            <p className="sub">
              Allergies and foods you never want to see. Optional, but it makes your picks safer.
            </p>
            <div className="chips">
              {AVOID.map((a) => (
                <button
                  key={a}
                  className={`chip${avoid.includes(a) ? " sel" : ""}`}
                  onClick={() => toggle(avoid, a, setAvoid)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => go("style")}>
              Continue
            </button>
          </div>
        </section>
      )}

      {/* DINING STYLE */}
      {screen === "style" && (
        <section className="screen">
          <div className="topbar">
            <button className="back" onClick={() => go("allergy")}>
              ←
            </button>
            <div className="progress">
              <i style={{ width: "60%" }} />
            </div>
          </div>
          <div className="pad">
            <h2>Where are you eating?</h2>
            <p className="sub">Pick any that fit today.</p>
            {STYLES.map((s) => {
              const on = styles.includes(s.id);
              return (
                <button
                  key={s.id}
                  className={`opt${on ? " sel" : ""}`}
                  onClick={() => toggle(styles, s.id, setStyles)}
                >
                  <div className="ic">{s.ic}</div>
                  <div>
                    <div className="t">{s.t}</div>
                    <div className="d">{s.d}</div>
                  </div>
                  <div className="chk">✓</div>
                </button>
              );
            })}
          </div>
          <div className="btn-row">
            <button className="btn" disabled={styles.length === 0} onClick={() => go("budget")}>
              Continue
            </button>
          </div>
        </section>
      )}

      {/* BUDGET */}
      {screen === "budget" && (
        <section className="screen">
          <div className="topbar">
            <button className="back" onClick={() => go("style")}>
              ←
            </button>
            <div className="progress">
              <i style={{ width: "80%" }} />
            </div>
          </div>
          <div className="pad">
            <h2>What&apos;s your budget?</h2>
            <p className="sub">Per meal. We&apos;ll only show picks that fit.</p>
            <div className="budget-val">Up to ${budget} per meal</div>
            <input
              type="range"
              min={8}
              max={40}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
            <div className="range-labels">
              <span>$8</span>
              <span>$40+</span>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => go("loc")}>
              Continue
            </button>
          </div>
        </section>
      )}

      {/* LOCATION */}
      {screen === "loc" && (
        <section className="screen">
          <div className="topbar">
            <button className="back" onClick={() => go("budget")}>
              ←
            </button>
            <div className="progress">
              <i style={{ width: "95%" }} />
            </div>
          </div>
          <div className="pad">
            <h2>Where are you?</h2>
            <p className="sub">We use your current location by default, or enter a town or city.</p>
            <div className="field">
              📍{" "}
              <input
                placeholder="Enter a town or city"
                value={loc}
                onChange={(e) => {
                  setLoc(e.target.value);
                  setCoords(null);
                  setGeoStatus("idle");
                }}
              />
            </div>
            <button className="loc-btn" onClick={useCurrentLocation}>
              {geoStatus === "locating"
                ? "📡 Locating you..."
                : geoStatus === "done"
                  ? "✓ Using your current location"
                  : "🎯 Use my current location"}
            </button>
            {geoStatus === "error" && (
              <p className="sub" style={{ marginTop: 8, color: "var(--d-carn)" }}>
                Couldn&apos;t get your location. Type a town or city above instead.
              </p>
            )}
            {coords && (
              <MapImg
                src={`/api/staticmap?center=${coords.lat},${coords.lng}&zoom=14`}
                alt="Map of your current location"
              />
            )}
          </div>
          <div className="btn-row">
            <button className="btn cta" onClick={() => findPicks()}>
              Find my picks
            </button>
          </div>
        </section>
      )}

      {/* RESULTS */}
      {screen === "results" && (
        <section className="screen">
          <div className="results-head">
            <div className="lockup">
              <Mark size={24} />
              <Wordmark size={19} />
            </div>
          </div>

          <div className="summary">
            <div className="lab">
              {loading
                ? "Finding spots near you..."
                : refining
                  ? `Reading live menus near ${loc}...`
                  : `${source === "live" ? "Live picks" : "Sample picks"} near ${loc}`}
            </div>
            <span className="s diet" style={{ background: color }}>
              {dietName(diet)}
            </span>
            {styles.map((s) => (
              <span key={s} className="s">
                {STYLES.find((x) => x.id === s)?.t}
              </span>
            ))}
            <span className="s">≤ ${budget}/meal</span>
            {avoid.map((a) => (
              <span key={a} className="s">
                No {a}
              </span>
            ))}
            <button className="edit" onClick={() => go("diet")}>
              Edit
            </button>
          </div>

          {source === "sample" && !loading && (
            <div className="allergen-note" style={{ color: "#5A6B5E", background: "#efeadd" }}>
              ⓘ{" "}
              <span>
                Showing sample picks. Live restaurant data near you connects once the location
                service is enabled.
              </span>
            </div>
          )}

          <div className="allergen-note">
            ⚠️{" "}
            <span>
              Picks are dietary guidance, not medical or allergen advice. Always confirm ingredients
              with the restaurant, especially for allergies.
            </span>
          </div>

          {!loading && !isSubscribed && cards.some((c) => c.rec) && (
            <div className="paywall">
              <h3>🎁 Your first pick below is free</h3>
              <p>
                Subscribe to unlock all {cards.filter((c) => c.rec).length} picks near {loc}, with
                the exact order, modifications, and macros for every spot.
              </p>
              <div className="plans">
                <button className="btn cta" onClick={() => startSubscribe("monthly")}>
                  $2.99 / month
                </button>
                <button className="btn year" onClick={() => startSubscribe("yearly")}>
                  $19.99 / year
                </button>
              </div>
            </div>
          )}

          {!loading && source === "live" && center && cards.some((c) => c.lat) && (
            <MapImg
              src={`/api/staticmap?center=${center.lat},${center.lng}&markers=${encodeURIComponent(
                cards
                  .filter((c) => c.lat && c.lng)
                  .map((c) => `${c.lat},${c.lng}`)
                  .join("|"),
              )}`}
              alt="Map of recommended restaurants near you"
              className="inset"
            />
          )}

          {!loading && cards.length > 0 && (
            <>
              <div className="fitfilter">
                <span className="fitlabel">Show</span>
                {FIT_OPTS.map((o) => (
                  <button
                    key={o.k}
                    className={`fitpill${fitFilter === o.k ? " on" : ""}`}
                    onClick={() => setFitFilter(o.k)}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
              <div className="fitfilter">
                <span className="fitlabel">Sort</span>
                <select
                  className="sortsel"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                >
                  {SORT_OPTS.map((o) => (
                    <option key={o.k} value={o.k}>
                      {o.t}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {loading ? (
            <div className="empty">
              <div style={{ fontSize: 40 }}>🥗</div>
              <p style={{ marginTop: 10 }}>Scanning nearby menus for your {dietName(diet)} picks...</p>
            </div>
          ) : cards.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 40 }}>🔍</div>
              <p style={{ marginTop: 10 }}>
                No picks under ${budget} for {dietName(diet)} with those dining styles. Try raising
                the budget or adding a dining style.
              </p>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 40 }}>🍽️</div>
              <p style={{ marginTop: 10 }}>
                No {FIT_OPTS.find((o) => o.k === fitFilter)?.t.toLowerCase()} picks here. Try a
                different filter above.
              </p>
            </div>
          ) : (
            sortedCards.map((c, i) => (
              <div key={`${c.name}-${i}`} className="rcard" style={{ borderLeftColor: color }}>
                <div className="rcard-top">
                  <div>
                    <div className="rname">{c.name}</div>
                    <div className="rmeta">
                      <span className="diet-tag" style={{ background: color }}>
                        {dietName(diet)}
                      </span>{" "}
                      <span className="tag">{c.tag}</span> · {c.dist}
                    </div>
                  </div>
                  <div className="fit">
                    {c.rec ? (
                      <span className={`badge fit-${c.rec.fit}`}>{FIT_LABEL[c.rec.fit]}</span>
                    ) : (
                      <span className="badge fit-good">No pick yet</span>
                    )}
                  </div>
                </div>

                {c.rec ? (
                  isSubscribed || c.name === freeName ? (
                  <>
                    {!isSubscribed && c.name === freeName && (
                      <div className="free-strip">🎁 Free sample pick</div>
                    )}
                    <div className="order">
                      <div className="order-label">
                        {c.rec.options.length > 1 ? "Top picks" : "Order this"}
                      </div>
                      {(expanded[c.name] ? c.rec.options : c.rec.options.slice(0, 1)).map((o, oi) => (
                        <div key={oi} className={`pick${oi > 0 ? " alt" : ""}`}>
                          <div className="order-item">
                            {o.main}
                            {o.side ? <span className="side"> with {o.side}</span> : null}
                          </div>
                          {o.onMenu === false ? (
                            <div className="menu-badge est">ⓘ Suggested, confirm on their menu</div>
                          ) : o.onMenu === true ? (
                            <div className="menu-badge on">✓ On their menu</div>
                          ) : null}
                          {typeof o.price === "number" ? (
                            <div className="opt-price">
                              ${o.price.toFixed(2)}
                              <span className={`price-tag ${o.priceEstimated ? "est" : "actual"}`}>
                                {o.priceEstimated ? "estimated price" : "menu price"}
                              </span>
                            </div>
                          ) : null}
                          <div className="mods">
                            {o.mods.rm.map((m) => (
                              <span key={m} className="mod rm">
                                ✕ {m}
                              </span>
                            ))}
                            {o.mods.add.map((m) => (
                              <span key={m} className="mod add">
                                ＋ {m.replace(/^(Add |Sub |Side of |Extra )/, "")}
                              </span>
                            ))}
                          </div>
                          <div className="why">{o.why}</div>
                          <div className="macros">
                            <div className="macro">
                              <b>{o.carbs}g</b>
                              <span>Net carbs</span>
                            </div>
                            <div className="macro">
                              <b>{o.sugar}g</b>
                              <span>Sugar</span>
                            </div>
                            <div className="macro">
                              <b>{o.protein}g</b>
                              <span>Protein</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {c.rec.options.length > 1 && (
                        <button
                          className="more-btn"
                          onClick={() =>
                            setExpanded((e) => ({ ...e, [c.name]: !e[c.name] }))
                          }
                        >
                          {expanded[c.name]
                            ? "Show less"
                            : `+ ${c.rec.options.length - 1} more pick${c.rec.options.length > 2 ? "s" : ""}`}
                        </button>
                      )}
                    </div>
                    <div className="rfoot">
                      <div className="rfoot-note">Prices per option above</div>
                      <div className="rfoot-actions">
                        {c.style === "dine-in" && (
                          <button
                            className="btn dir-btn"
                            onClick={() => {
                              setSmsCard(c);
                              setSmsPhone("");
                              setSmsState("idle");
                              setSmsMsg("");
                            }}
                          >
                            Send directions
                          </button>
                        )}
                        {c.style !== "dine-in" && (
                          <a
                            className="btn dir-btn"
                            href={outLink(c, "delivery")}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Delivery
                          </a>
                        )}
                        <a
                          className="btn order-btn"
                          href={outLink(c, "order")}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Order →
                        </a>
                      </div>
                    </div>
                  </>
                  ) : (
                    <>
                      <div className="locked">
                        <span className="lk">🔒</span>
                        <span>
                          <b>Your {dietName(diet)} pick is ready.</b> Unlock the exact order,
                          swaps, and macros.
                        </span>
                      </div>
                      <div className="lock-cta">
                        <button className="btn cta sm" onClick={() => startSubscribe("monthly")}>
                          Unlock all picks · $2.99/mo
                        </button>
                        <button className="btn ghost sm" onClick={() => startSubscribe("yearly")}>
                          $19.99/yr
                        </button>
                      </div>
                    </>
                  )
                ) : refining ? (
                  <div className="order">
                    <div className="skel-line w70" />
                    <div className="skel-line w90" />
                    <div className="skel-line w45" />
                    <div className="skel-note">Reading their menu for {dietName(diet)} picks...</div>
                  </div>
                ) : (
                  <>
                    <div className="order">
                      <div className="why" style={{ marginBottom: 0 }}>
                        We could not pin down enough of this spot&apos;s menu to make a confident{" "}
                        {dietName(diet)} pick right now. Open their page to check the menu yourself,
                        or run the search again in a moment.
                      </div>
                    </div>
                    <div className="rfoot">
                      <div className="rfoot-note">No verified pick yet</div>
                      <div className="rfoot-actions">
                        <a
                          className="btn order-btn"
                          href={outLink(c, "order")}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View menu →
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}

          <p className="disclaimer">
            Healthy Chow provides general wellness guidance and is not a substitute for professional
            medical or nutritional advice. Nutrition values for chains come from published data;
            values marked <em>Estimated</em> are inferred from menu descriptions and are approximate.
          </p>
          <div className="pad">
            <button className="btn ghost" onClick={() => go("diet")}>
              ↻ Start over
            </button>
          </div>
        </section>
      )}

      {smsCard && (
        <div className="modal-overlay" onClick={() => setSmsCard(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Text me directions</div>
            <p className="modal-sub">We&apos;ll text a Google Maps link to {smsCard.name}.</p>
            {smsState === "sent" ? (
              <p className="modal-ok">✓ Sent. Check your phone.</p>
            ) : (
              <>
                <input
                  className="modal-input"
                  type="tel"
                  inputMode="tel"
                  placeholder="Your mobile number"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                />
                {smsMsg && <p className="modal-err">{smsMsg}</p>}
                {smsState === "unconfigured" && (
                  <p className="modal-err">
                    Texting isn&apos;t enabled yet.{" "}
                    <a href={directionsSms(smsCard)}>Open it in your Messages app</a> instead.
                  </p>
                )}
                <button
                  className="btn cta"
                  disabled={smsState === "sending" || !smsPhone.trim()}
                  onClick={sendDirections}
                >
                  {smsState === "sending" ? "Sending..." : "Text it to me"}
                </button>
              </>
            )}
            <button className="btn ghost" onClick={() => setSmsCard(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {authOpen && (
        <div className="modal-overlay" onClick={() => setAuthOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {authMode === "signup" ? "Create your account" : "Log in"}
            </div>
            <p className="modal-sub">
              {authMode === "signup"
                ? "Save your diet and unlock your picks."
                : "Welcome back to Healthy Chow."}
            </p>
            <input
              className="modal-input"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />
            <input
              className="modal-input"
              type="password"
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              placeholder="Password"
              value={authPw}
              onChange={(e) => setAuthPw(e.target.value)}
            />
            {authMsg && <p className="modal-err">{authMsg}</p>}
            <button
              className="btn cta"
              disabled={authState === "working" || !authEmail || !authPw}
              onClick={doAuth}
            >
              {authState === "working"
                ? "Please wait..."
                : authMode === "signup"
                  ? "Create account"
                  : "Log in"}
            </button>
            <button
              className="btn ghost"
              onClick={() => openAuth(authMode === "signup" ? "login" : "signup")}
            >
              {authMode === "signup" ? "I already have an account" : "Create an account instead"}
            </button>
            <button className="btn ghost" onClick={() => setAuthOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
