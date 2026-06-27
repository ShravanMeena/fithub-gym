// Deterministic nutrition math (Mifflin–St Jeor). Used as ground truth so the
// AI plan is anchored to real numbers instead of hallucinated targets.

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function computeTargets(profile) {
  const { gender, age, height_cm, weight_kg, goal, activity_level } = profile;
  if (!age || !height_cm || !weight_kg) return null;

  // BMR
  const s = (gender || '').toLowerCase() === 'female' ? -161 : 5;
  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + s;

  const tdee = bmr * (ACTIVITY_FACTORS[activity_level] || 1.375);

  // Goal adjustment
  let calories = tdee;
  if (goal === 'lose_fat') calories = tdee - 450;
  else if (goal === 'build_muscle') calories = tdee + 300;
  else if (goal === 'gain_weight') calories = tdee + 500;
  else if (goal === 'recomp') calories = tdee - 150;

  calories = Math.round(calories);

  // Macros: protein ~1.8 g/kg (2.0 when actively gaining), fat ~25% kcal, rest carbs
  const proteinPerKg = goal === 'gain_weight' || goal === 'build_muscle' ? 2.0 : 1.8;
  const protein_g = Math.round(weight_kg * proteinPerKg);
  const fat_g = Math.round((calories * 0.25) / 9);
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    protein_g,
    carbs_g,
    fat_g,
  };
}
