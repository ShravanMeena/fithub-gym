// Central design tokens — a dark, energetic "gym" palette.
export const colors = {
  bg: '#0E0F13',
  card: '#1A1C22',
  cardAlt: '#23262E',
  border: '#2C2F38',
  text: '#F5F6F8',
  textDim: '#9AA0AC',
  primary: '#FF5A1F', // energetic orange
  primaryDim: '#7a3216',
  accent: '#23D18B', // protein/green success
  danger: '#FF4D4D',
  carbs: '#F7B500',
  fat: '#7C5CFF',
  protein: '#23D18B',
};

// White-label: each gym can override the brand colour at runtime. Components
// that read colors.primary inline (most CTAs/headers) pick this up on re-render.
const DEFAULT_PRIMARY = colors.primary;
export function setBrandColor(hex?: string | null) {
  colors.primary = hex && /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : DEFAULT_PRIMARY;
}

export const spacing = (n: number) => n * 8;

export const radius = { sm: 8, md: 14, lg: 20, xl: 26, pill: 999 };

// Soft elevation for a premium, layered feel.
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};

export const font = {
  h1: 30,
  h2: 22,
  h3: 18,
  body: 15,
  small: 13,
  tiny: 11,
};
