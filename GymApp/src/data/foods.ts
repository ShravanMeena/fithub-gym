// Common foods for free manual logging (no AI). Values are per the stated
// serving — approximate, good enough for daily tracking.
export type Food = { name: string; serving: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

export const FOODS: Food[] = [
  // Indian staples
  { name: 'Roti / Chapati', serving: '1 piece', calories: 120, protein_g: 3, carbs_g: 22, fat_g: 3 },
  { name: 'Plain Rice', serving: '1 bowl', calories: 200, protein_g: 4, carbs_g: 45, fat_g: 0 },
  { name: 'Dal (cooked)', serving: '1 bowl', calories: 180, protein_g: 9, carbs_g: 25, fat_g: 4 },
  { name: 'Rajma', serving: '1 bowl', calories: 230, protein_g: 12, carbs_g: 35, fat_g: 4 },
  { name: 'Chole', serving: '1 bowl', calories: 270, protein_g: 12, carbs_g: 38, fat_g: 8 },
  { name: 'Paneer Curry', serving: '1 bowl', calories: 320, protein_g: 16, carbs_g: 12, fat_g: 24 },
  { name: 'Chicken Curry', serving: '1 bowl', calories: 290, protein_g: 28, carbs_g: 8, fat_g: 16 },
  { name: 'Egg Curry', serving: '2 eggs', calories: 240, protein_g: 14, carbs_g: 8, fat_g: 16 },
  { name: 'Idli', serving: '2 pieces', calories: 140, protein_g: 5, carbs_g: 28, fat_g: 1 },
  { name: 'Dosa (plain)', serving: '1 piece', calories: 170, protein_g: 4, carbs_g: 28, fat_g: 5 },
  { name: 'Poha', serving: '1 plate', calories: 250, protein_g: 5, carbs_g: 45, fat_g: 6 },
  { name: 'Upma', serving: '1 plate', calories: 250, protein_g: 6, carbs_g: 40, fat_g: 8 },
  { name: 'Curd / Dahi', serving: '1 bowl', calories: 100, protein_g: 6, carbs_g: 8, fat_g: 4 },
  { name: 'Paratha', serving: '1 piece', calories: 210, protein_g: 5, carbs_g: 28, fat_g: 9 },
  // Protein
  { name: 'Boiled Egg', serving: '1 egg', calories: 78, protein_g: 6, carbs_g: 1, fat_g: 5 },
  { name: 'Chicken Breast', serving: '100 g', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 },
  { name: 'Paneer', serving: '100 g', calories: 265, protein_g: 18, carbs_g: 6, fat_g: 20 },
  { name: 'Whey Scoop', serving: '1 scoop', calories: 120, protein_g: 24, carbs_g: 3, fat_g: 2 },
  { name: 'Soya Chunks', serving: '50 g dry', calories: 170, protein_g: 26, carbs_g: 13, fat_g: 0 },
  // Carbs / snacks
  { name: 'Oats', serving: '40 g', calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3 },
  { name: 'Banana', serving: '1 medium', calories: 105, protein_g: 1, carbs_g: 27, fat_g: 0 },
  { name: 'Apple', serving: '1 medium', calories: 95, protein_g: 0, carbs_g: 25, fat_g: 0 },
  { name: 'Peanuts', serving: '30 g', calories: 170, protein_g: 7, carbs_g: 5, fat_g: 14 },
  { name: 'Almonds', serving: '10 pcs', calories: 70, protein_g: 3, carbs_g: 2, fat_g: 6 },
  { name: 'Milk', serving: '1 glass', calories: 150, protein_g: 8, carbs_g: 12, fat_g: 8 },
  { name: 'Bread Slice', serving: '1 slice', calories: 75, protein_g: 3, carbs_g: 14, fat_g: 1 },
  { name: 'Peanut Butter', serving: '1 tbsp', calories: 95, protein_g: 4, carbs_g: 3, fat_g: 8 },
  // Common eat-outs
  { name: 'Veg Biryani', serving: '1 plate', calories: 400, protein_g: 9, carbs_g: 65, fat_g: 12 },
  { name: 'Chicken Biryani', serving: '1 plate', calories: 500, protein_g: 25, carbs_g: 60, fat_g: 18 },
  { name: 'Samosa', serving: '1 piece', calories: 260, protein_g: 4, carbs_g: 30, fat_g: 14 },
  { name: 'Tea with sugar', serving: '1 cup', calories: 90, protein_g: 2, carbs_g: 12, fat_g: 3 },
  { name: 'Black Coffee', serving: '1 cup', calories: 5, protein_g: 0, carbs_g: 1, fat_g: 0 },
];
