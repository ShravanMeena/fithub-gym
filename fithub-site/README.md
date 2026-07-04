# FitHub — marketing site

SEO-first, dark, editorial-luxury landing page for the FitHub gym app. Built with **Next.js 14 (App Router)** + TypeScript. Explains what FitHub does for gym-goers and collects **early-access** signups.

## Run it

```bash
cd fithub-site
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

## Configure

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical/OG/sitemap base URL (default `https://fithub.shravanmeena.com`). Set to your real domain. |
| `WAITLIST_WEBHOOK` | Optional. Any URL (Zapier/Make/your backend) — early-access leads are POSTed here as JSON. |
| `WAITLIST_API_URL` | Optional alternative — your own backend endpoint for leads. |

If neither webhook is set, the form still works: leads are validated and logged to the server console. Edit brand/SEO copy in `lib/site.ts`.

## SEO built in
- Full **Metadata API** (title/description/keywords/canonical/OG/Twitter) in `app/layout.tsx`.
- **JSON-LD** structured data: `Organization`, `SoftwareApplication`, `WebSite` (layout) + `FAQPage` (home).
- **`app/sitemap.ts`** → `/sitemap.xml`, **`app/robots.ts`** → `/robots.txt`.
- **Dynamic OG image** at `app/opengraph-image.tsx` (1200×630).
- Semantic HTML, responsive, dark theme, reduced-motion aware.

## Structure
```
app/
  layout.tsx            SEO metadata + JSON-LD + fonts
  page.tsx              the landing page (hero, features, how, early access, FAQ)
  globals.css           the design system (dark, luxury)
  sitemap.ts / robots.ts
  opengraph-image.tsx   social share image
  api/early-access/route.ts   form handler
components/
  EarlyAccessForm.tsx   client form
  Reveal.tsx            scroll-reveal wrapper
lib/site.ts             brand + SEO config
```

## Deploy
Works on Vercel (zero config) or any Node host (`npm run build && npm start`). Point your domain, set `NEXT_PUBLIC_SITE_URL`, and add a `WAITLIST_WEBHOOK` to capture leads.
