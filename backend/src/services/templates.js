// Free, non-AI diet plans. Deterministic templates scaled to the user's computed
// calorie/macro targets. Everyone gets these without a subscription.

function meal(name, time, calories, items) {
  return { name, time, calories: Math.round(calories), items };
}

export function buildNormalPlans({ profile, targets }) {
  const cal = targets?.calories ?? 2200;
  const isVeg = ['veg', 'vegan'].includes(profile?.diet_pref);
  const goal = profile?.goal || 'maintain';
  const macro = {
    protein_g: targets?.protein_g ?? 150,
    carbs_g: targets?.carbs_g ?? 220,
    fat_g: targets?.fat_g ?? 60,
  };

  const vegPlan = {
    title: 'Veg Balanced Plan',
    summary: `Simple home-cooked veg plan (~${cal} kcal) for ${goal.replace('_', ' ')}.`,
    estimated_cost: '₹120/day',
    daily_calories: cal,
    ...macro,
    meals: [
      meal('Breakfast', '08:00', cal * 0.25, ['Oats with milk + 1 banana', 'Roasted peanuts (handful)', 'Chai']),
      meal('Lunch', '13:00', cal * 0.35, ['2 rotis + 1 cup rice', 'Dal (1 bowl) + seasonal sabzi', 'Curd (1 bowl)']),
      meal('Snack', '17:00', cal * 0.15, ['Sprouts chaat', 'Glass of milk']),
      meal('Dinner', '20:30', cal * 0.25, ['2 rotis', 'Paneer/soya sabzi (100g)', 'Mixed veg']),
    ],
    tips: ['Drink 3–4 L water daily.', 'Hit your protein target with dal, curd, paneer & milk.', 'Cook at home to control oil & cost.'],
  };

  const nonVegPlan = {
    title: 'Non-Veg High-Protein Plan',
    summary: `Affordable non-veg plan (~${cal} kcal) for ${goal.replace('_', ' ')}.`,
    estimated_cost: '₹170/day',
    daily_calories: cal,
    ...macro,
    meals: [
      meal('Breakfast', '08:00', cal * 0.25, ['3 boiled eggs + 2 whole-wheat rotis', 'Banana', 'Chai']),
      meal('Lunch', '13:00', cal * 0.35, ['1 cup rice + 2 rotis', 'Home-style chicken curry (150g)', 'Curd + salad']),
      meal('Snack', '17:00', cal * 0.15, ['Boiled eggs (2) or sprouts', 'Glass of milk']),
      meal('Dinner', '20:30', cal * 0.25, ['2 rotis', 'Egg bhurji or fish (150g)', 'Sauteed veg']),
    ],
    tips: ['Drink 3–4 L water daily.', 'Eggs & chicken are your cheapest protein.', 'Adjust portions if weight stalls 2 weeks.'],
  };

  return { plans: isVeg ? [vegPlan] : [vegPlan, nonVegPlan], source: 'normal' };
}
