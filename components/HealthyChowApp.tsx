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

export default function HealthyChowApp() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [diet, setDiet] = useState<DietId | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [styles, setStyles] = useState<StyleId[]>([]);
  const [budget, setBudget] = useState(18);
  const [loc, setLoc] = useState("");

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "done" | "error">("idle");
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

  const [cards, setCards] = useState<ResultCard[]>([]);
  const [source, setSource] = useState<"live" | "sample">("sample");
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("fit");

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoc("Current location");
        setGeoStatus("done");
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  // Default to the user's current location: request it automatically when the
  // location screen opens (the browser prompts for permission once).
  useEffect(() => {
    if (screen === "loc" && geoStatus === "idle" && !coords) {
      useCurrentLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const go = (s: Screen) => {
    setScreen(s);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const color = dietColor(diet);
  const visibleCards = fitFilter === "all" ? cards : cards.filter((c) => c.rec?.fit === fitFilter);
  const sortedCards = [...visibleCards].sort((a, b) => {
    switch (sortBy) {
      case "carbs":
        return (a.rec?.carbs ?? Infinity) - (b.rec?.carbs ?? Infinity);
      case "sugar":
        return (a.rec?.sugar ?? Infinity) - (b.rec?.sugar ?? Infinity);
      case "protein":
        return (b.rec?.protein ?? -Infinity) - (a.rec?.protein ?? -Infinity);
      case "price":
        return (a.rec?.price ?? Infinity) - (b.rec?.price ?? Infinity);
      case "dist":
        return parseFloat(a.dist) - parseFloat(b.dist);
      default:
        return 0; // "fit" keeps the server's fit-then-distance order
    }
  });

  async function findPicks() {
    if (!diet) return;
    go("results");
    setLoading(true);
    setFitFilter("all");
    setSortBy("fit");
    try {
      const params = new URLSearchParams({
        diet,
        styles: styles.join(","),
        budget: String(budget),
      });
      if (coords) {
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
      } else {
        params.set("loc", loc);
      }
      const res = await fetch(`/api/restaurants?${params.toString()}`);
      const data = await res.json();
      if (data.loc) setLoc(data.loc);
      setCards(data.cards ?? []);
      setCenter(data.center ?? null);
      setSource(data.source === "live" ? "live" : "sample");
    } catch {
      setCards([]);
      setCenter(null);
      setSource("sample");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      {/* WELCOME */}
      {screen === "welcome" && (
        <section className="screen">
          <div className="welcome">
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

            <div className="pricing">
              <div className="amt">
                $2<span>.99 / month</span>
              </div>
              <div className="amt-alt">
                or $19.99 / year <em>save 44%</em>
              </div>
              <ul>
                <li>
                  <span className="tick">✓</span> Picks near you for any diet
                </li>
                <li>
                  <span className="tick">✓</span> Off-menu swaps (no bun, no sugar)
                </li>
                <li>
                  <span className="tick">✓</span> Big chains and local spots
                </li>
              </ul>
            </div>
            <div className="spacer" />
            <button className="btn cta" onClick={() => go("diet")}>
              Get started
            </button>
            <button className="btn ghost" onClick={() => go("diet")}>
              I already have an account
            </button>
            <div className="freenote">Free to search. Subscribe to reveal your picks.</div>
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
            <div className="budget-val">Up to ${budget}</div>
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
            <button className="btn cta" onClick={findPicks}>
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
                ? "Reading the menus near you..."
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
            <span className="s">≤ ${budget}</span>
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

          {!loading && !subscribed && cards.some((c) => c.rec) && (
            <div className="paywall">
              <h3>🔒 {cards.filter((c) => c.rec).length} picks ready near {loc}</h3>
              <p>Subscribe to unlock the exact order, modifications, and macros for every spot.</p>
              <div className="plans">
                <button className="btn cta" onClick={() => setSubscribed(true)}>
                  $2.99 / month
                </button>
                <button className="btn year" onClick={() => setSubscribed(true)}>
                  $19.99 / year
                </button>
              </div>
            </div>
          )}

          <div className="filterbar">
            <span className="pill on" style={{ background: color, borderColor: color }}>
              {dietName(diet)}
            </span>
            {STYLES.map((s) => (
              <span key={s.id} className={`pill${styles.includes(s.id) ? " on" : ""}`}>
                {s.t}
              </span>
            ))}
            <span className="pill">≤ ${budget}</span>
          </div>

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
                      <span className="badge fit-good">Pick soon</span>
                    )}
                  </div>
                </div>

                {c.rec ? (
                  subscribed ? (
                  <>
                    <div className="order">
                      <div className="order-label">Order this</div>
                      <div className="order-item">{c.rec.item}</div>
                      <div className="mods">
                        {c.rec.mods.rm.map((m) => (
                          <span key={m} className="mod rm">
                            ✕ {m}
                          </span>
                        ))}
                        {c.rec.mods.add.map((m) => (
                          <span key={m} className="mod add">
                            ＋ {m.replace(/^(Add |Sub |Side of |Extra )/, "")}
                          </span>
                        ))}
                      </div>
                      <div className="why">{c.rec.why}</div>
                      <div className="macros">
                        <div className="macro">
                          <b>{c.rec.carbs}g</b>
                          <span>Net carbs</span>
                        </div>
                        <div className="macro">
                          <b>{c.rec.sugar}g</b>
                          <span>Sugar</span>
                        </div>
                        <div className="macro">
                          <b>{c.rec.protein}g</b>
                          <span>Protein</span>
                        </div>
                      </div>
                    </div>
                    <div className="rfoot">
                      <div>
                        <div className="price">${c.rec.price.toFixed(2)}</div>
                        {c.independent && (
                          <div className="est">ⓘ Estimated, confirm at restaurant</div>
                        )}
                      </div>
                      <a
                        className="btn order-btn"
                        href={
                          c.url ??
                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Order →
                      </a>
                    </div>
                  </>
                  ) : (
                    <div className="locked">
                      <span className="lk">🔒</span>
                      <span>
                        <b>Your {dietName(diet)} pick is ready.</b> Subscribe to see the exact
                        order, swaps, and macros.
                      </span>
                    </div>
                  )
                ) : (
                  <div className="order">
                    <div className="why" style={{ marginBottom: 0 }}>
                      A tailored Healthy Chow pick for this spot is on the way. Live menu analysis
                      for local restaurants arrives in the next update.
                    </div>
                  </div>
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
    </div>
  );
}
