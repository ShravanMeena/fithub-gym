// Subscription / payment config for AI features.
export const UPI_ID = '9660801827@ybl';
export const WHATSAPP_NUMBER = '919660801827'; // country code + number, no +

export type Plan = { label: string; days: number; price: number };

export const PLANS: Plan[] = [
  { label: 'Weekly', days: 7, price: 99 },
  { label: 'Monthly', days: 30, price: 299 },
  { label: 'Quarterly', days: 90, price: 699 },
  { label: 'Yearly', days: 365, price: 999 },
];
