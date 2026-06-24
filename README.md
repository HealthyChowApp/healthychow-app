# Healthy Chow

Eat out. Eat right. A subscription web app that tells you exactly what to order at
restaurants near you, including off-menu modifications, to fit your chosen diet
(keto, low-carb, Mediterranean, paleo, carnivore).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** (CSS-first) plus a brand design system in `app/globals.css`
- Deployed on **Vercel**, custom domain `healthychowapp.com`

## Status: Milestone 1 (production foundation)

The app is a real Next.js project rendering the branded onboarding flow and
recommendation results from **mock data** (`lib/data.ts`). Live data, accounts, and
billing arrive in later milestones.

The original single-file static prototype is preserved at `/prototype.html`.

## Project structure

```
app/
  layout.tsx        root layout, brand fonts (Poppins + Inter), logo mark defs
  page.tsx          renders the app
  globals.css       brand design system (Kale / Turmeric / Cream)
  icon.png          favicon (brand app icon)
components/
  HealthyChowApp.tsx  the interactive onboarding + results flow (client)
  Mark.tsx            reusable leaf-pin-check logo mark
lib/
  data.ts           typed diets, dining styles, and mock restaurant data
public/
  assets/           brand logo + app icon
  prototype.html    the original static prototype (reference)
```

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Roadmap

1. **Production foundation** (done) — Next.js app, branded UI, mock data.
2. **Live discovery** — Google Places for real "restaurants near you."
3. **Recommendation engine** — chain nutrition data + Claude modification engine.
4. **Accounts** — Supabase auth, saved diet profiles, waitlist.
5. **Subscriptions** — Stripe billing.

## License

Proprietary. All rights reserved.
