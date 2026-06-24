# Healthy Chow

A subscription web app that tells health-conscious users exactly what to order at
restaurants near them, including off-menu modifications, to fit their chosen diet
(keto, low-carb, Mediterranean, paleo, carnivore).

## Status

This repository currently holds the **clickable front-end prototype** (`index.html`),
a single self-contained static page with hand-authored sample data. There is no build
step, backend, auth, or live API yet.

Open `index.html` in any browser to run it, or deploy it as a static site (Vercel).

## Prototype flow

1. Welcome / subscription pitch
2. Diet selection
3. Allergies and foods to avoid
4. Dining style (dine-in, take-out, fast-casual, fast food)
5. Budget per meal
6. Location
7. Recommendation results, with per-item modifications, diet-fit badges, and
   estimated-nutrition labels on independent restaurants.

## Roadmap

- **Phase 1 (MVP):** chains-only, real menu + nutrition data, restaurant discovery API.
- **Phase 2:** independent restaurants via ingredient inference from menu text.
- **Phase 3:** accounts, saved diet profiles, and subscriptions (Supabase + Stripe).

## License

Proprietary. All rights reserved.
