// Subscription / payment config for AI features.
export const UPI_ID = '9660801827@ybl';
export const WHATSAPP_NUMBER = '919660801827'; // country code + number, no +

export type Plan = { label: string; days: number; price: number };

export const PLANS: Plan[] = [
  { label: '1 Day', days: 1, price: 49 },
  { label: '7 Days', days: 7, price: 199 },
  { label: '15 Days', days: 15, price: 349 },
  { label: '1 Month', days: 30, price: 499 },
  { label: '3 Months', days: 90, price: 1199 },
  { label: '6 Months', days: 180, price: 1999 },
  { label: '9 Months', days: 270, price: 2699 },
  { label: '12 Months', days: 365, price: 2999 },
];
