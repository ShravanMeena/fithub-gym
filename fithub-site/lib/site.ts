// Single source of truth for SEO + brand metadata.
export const SITE = {
  name: 'FitHub',
  tagline: 'Your gym, in your pocket.',
  // Set NEXT_PUBLIC_SITE_URL in production (used for canonical URLs, OG, sitemap).
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://fithub.shravanmeena.com',
  // FitHub backend base — early-access signups are forwarded here so they show
  // up in the superadmin platform. Override with FITHUB_API_URL.
  apiUrl: process.env.FITHUB_API_URL || 'https://fithub.shravanmeena.com',
  description:
    'FitHub is the gym app that actually keeps you showing up. Snap your food for instant macros, get a diet plan built around Indian home food, track every workout and PR, and stay consistent with streaks, challenges and your gym community — all in one app.',
  shortDescription:
    'Snap your food for instant calories, get a diet plan for your goal, track workouts & PRs, and stay consistent with streaks, challenges and your gym crew.',
  keywords: [
    'gym app', 'fitness app India', 'AI food scanner', 'calorie counter',
    'macro tracker', 'Indian diet plan', 'workout tracker', 'PR tracker',
    'gym community app', 'gym check-in app', 'fitness streaks', 'gym motivation',
    'progress photos', 'personal trainer app', 'gym membership app',
  ],
  brand: '#FF5A1F',
  locale: 'en_IN',
  // Wire these when ready.
  appStoreUrl: '',
  playStoreUrl: '',
  supportEmail: 'hello@fithub.app',
};
