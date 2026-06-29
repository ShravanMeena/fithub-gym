// AWS Bedrock (Anthropic Claude) integration for the three AI features:
//   1) estimateFoodFromImage  – vision: photo -> calories + macros
//   2) generateDietPlan       – profile + targets -> structured daily plan
//   3) coachAdvice            – progress + logs -> coaching message
//
// When MOCK_AI=1 (or AWS creds are missing) every function returns a
// deterministic stub so the whole app works offline before Bedrock is wired up.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { recordAiUsage } from './aiUsage.js';

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-6-20250514-v1:0';
const REGION = process.env.AWS_REGION || 'us-east-1';

function mockEnabled() {
  return (
    process.env.MOCK_AI === '1' ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  );
}

let _client = null;
function client() {
  if (!_client) _client = new BedrockRuntimeClient({ region: REGION });
  return _client;
}

// Low-level helper: send messages to Claude on Bedrock, return the text.
// `feature` labels the call and `ctx` ({ userId, orgId }) attributes token usage.
async function invokeClaude({ system, messages, maxTokens = 1500, feature = 'ai', ctx = null }) {
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    system,
    messages,
  };
  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });
  const resp = await client().send(cmd);
  const decoded = JSON.parse(new TextDecoder().decode(resp.body));
  // Log token usage against the user (best-effort, fire-and-forget).
  if (ctx?.userId && decoded?.usage) {
    recordAiUsage({
      userId: ctx.userId,
      orgId: ctx.orgId,
      feature,
      model: MODEL_ID,
      inputTokens: decoded.usage.input_tokens || 0,
      outputTokens: decoded.usage.output_tokens || 0,
    });
  }
  return decoded.content?.map((c) => c.text).join('') ?? '';
}

// Bedrock only accepts these image media types. Phones often report image/jpg
// or image/heic; the picker re-encodes to JPEG on resize, so we relabel safely.
const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Detect the REAL format from the base64 magic bytes (ignores a wrong label).
function detectFromBase64(b64) {
  if (!b64) return null;
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return null;
}

// Resolve a Bedrock-acceptable media type: trust the bytes first, then the
// label; fall back to jpeg (the picker re-encodes HEIC to jpeg on resize).
function resolveMediaType(mediaType, base64) {
  const sniffed = detectFromBase64(base64);
  if (sniffed) return sniffed;
  const m = String(mediaType || '').toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_MEDIA.has(m)) return m;
  return 'image/jpeg';
}

// Claude sometimes wraps JSON in prose or ```json fences. Extract the object.
function parseJsonLoose(text) {
  if (!text) throw new Error('Empty AI response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in AI response');
  return JSON.parse(raw.slice(start, end + 1));
}

// Rule-based health flags so we ALWAYS warn, even if the model doesn't.
// Merges with any AI-provided warnings.
function deriveWarnings(est) {
  const w = new Set((est.warnings || []).map((s) => String(s)));
  const cal = Number(est.calories) || 0;
  const fat = Number(est.fat_g) || 0;
  const sugar = Number(est.sugar_g) || 0;
  const fatKcalPct = cal > 0 ? (fat * 9) / cal : 0;

  if (fat >= 30 || fatKcalPct > 0.4) {
    w.add(`⚠️ High in fat (${Math.round(fat)}g${fatKcalPct ? `, ~${Math.round(fatKcalPct * 100)}% of calories` : ''})`);
  }
  if (sugar >= 25) w.add(`⚠️ High in sugar (${Math.round(sugar)}g)`);
  else if (sugar >= 15) w.add(`🍬 Moderate sugar (${Math.round(sugar)}g)`);
  if (cal >= 800) w.add(`🔥 Calorie-dense meal (${Math.round(cal)} kcal)`);
  return Array.from(w);
}

// ---------------------------------------------------------------------------
// 1) Food photo -> calories + macros
// ---------------------------------------------------------------------------
export async function estimateFoodFromImage({ imageBase64, mediaType = 'image/jpeg', note, ctx }) {
  if (mockEnabled()) {
    const est = {
      name: 'Grilled chicken with rice & salad',
      calories: 540,
      protein_g: 46,
      carbs_g: 52,
      fat_g: 14,
      sugar_g: 6,
      confidence: 'mock',
      items: [
        { name: 'Grilled chicken breast', calories: 230, protein_g: 43, carbs_g: 0, fat_g: 6 },
        { name: 'Cooked white rice (1 cup)', calories: 205, protein_g: 4, carbs_g: 45, fat_g: 0 },
        { name: 'Mixed salad + dressing', calories: 105, protein_g: 2, carbs_g: 7, fat_g: 8 },
      ],
      warnings: [],
    };
    est.warnings = deriveWarnings(est);
    return est;
  }

  const system =
    'You are a nutrition vision expert. Identify the foods in the image and estimate ' +
    'realistic portion sizes and nutrition. Respond with ONLY a JSON object, no prose. ' +
    'Schema: {"name": string, "calories": number, "protein_g": number, "carbs_g": number, ' +
    '"fat_g": number, "sugar_g": number, "confidence": "low"|"medium"|"high", "items": [{"name": string, ' +
    '"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}], "warnings": [string]}. ' +
    'All macro values are grams. Totals must equal the sum of items. In "warnings" add short, friendly ' +
    'health notes ONLY if relevant — e.g. high fat, high/added sugar, very oily/fried, high salt, ' +
    'highly processed/junk. Keep each warning under 8 words. Empty array if the meal is clean.';

  const content = [
    {
      type: 'image',
      source: { type: 'base64', media_type: resolveMediaType(mediaType, imageBase64), data: imageBase64 },
    },
    {
      type: 'text',
      text: note
        ? `User note about the meal: ${note}. Analyze the meal in the image.`
        : 'Analyze the meal in this image.',
    },
  ];

  const text = await invokeClaude({
    system,
    messages: [{ role: 'user', content }],
    maxTokens: 1200,
    feature: 'food_photo',
    ctx,
  });
  const est = parseJsonLoose(text);
  est.warnings = deriveWarnings(est);
  return est;
}

// ---------------------------------------------------------------------------
// 1b) Text description -> calories + macros (for when there's no photo)
// ---------------------------------------------------------------------------
export async function estimateFoodFromText({ description, ctx }) {
  if (mockEnabled()) {
    const est = {
      name: description.length > 40 ? description.slice(0, 40) + '…' : description,
      calories: 320,
      protein_g: 18,
      carbs_g: 30,
      fat_g: 14,
      sugar_g: 4,
      confidence: 'mock',
      items: [
        { name: '2 eggs', calories: 140, protein_g: 12, carbs_g: 1, fat_g: 10 },
        { name: 'Butter roti', calories: 180, protein_g: 6, carbs_g: 29, fat_g: 4 },
      ],
      warnings: [],
    };
    est.warnings = deriveWarnings(est);
    return est;
  }

  const system =
    'You are a nutrition expert. The user describes a meal in plain text (often Indian home food). ' +
    'Estimate realistic portions and nutrition. Assume typical home serving sizes if not specified. ' +
    'Respond with ONLY a JSON object, no prose. Schema: {"name": string, "calories": number, ' +
    '"protein_g": number, "carbs_g": number, "fat_g": number, "sugar_g": number, ' +
    '"confidence": "low"|"medium"|"high", "items": [{"name": string, "calories": number, ' +
    '"protein_g": number, "carbs_g": number, "fat_g": number}], "warnings": [string]}. ' +
    'All macros in grams. Totals must equal the sum of items. In "warnings" add short friendly health ' +
    'notes ONLY if relevant (high fat, high/added sugar, very oily/fried, high salt, junk). ' +
    'Under 8 words each. Empty array if clean.';

  const text = await invokeClaude({
    system,
    messages: [{ role: 'user', content: `Meal description: "${description}". Estimate its nutrition.` }],
    maxTokens: 1000,
    feature: 'food_text',
    ctx,
  });
  const est = parseJsonLoose(text);
  est.warnings = deriveWarnings(est);
  return est;
}

// ---------------------------------------------------------------------------
// 2) Profile -> MULTIPLE budget, home-cooked daily diet plans
// ---------------------------------------------------------------------------
function mockPlan(title, cal, targets, veg, costStars) {
  const p = (frac) => Math.round(cal * frac);
  return {
    title,
    summary: `Simple home-cooked ${veg ? 'veg' : 'plan'} hitting ~${cal} kcal on a budget.`,
    estimated_cost: costStars, // e.g. "₹120/day"
    daily_calories: cal,
    protein_g: targets?.protein_g ?? 150,
    carbs_g: targets?.carbs_g ?? 220,
    fat_g: targets?.fat_g ?? 60,
    meals: [
      { name: 'Breakfast', time: '08:00', calories: p(0.25),
        items: veg
          ? ['Oats cooked in milk + 1 banana', 'Roasted peanuts (small handful)', 'Chai']
          : ['3 boiled eggs + 2 whole-wheat rotis', 'Banana', 'Chai'] },
      { name: 'Lunch', time: '13:00', calories: p(0.35),
        items: veg
          ? ['2 rotis + 1 cup rice', 'Dal (1 bowl) + seasonal sabzi', 'Curd (1 bowl)']
          : ['1 cup rice + 2 rotis', 'Home-style chicken curry (150g)', 'Curd + salad'] },
      { name: 'Snack', time: '17:00', calories: p(0.15),
        items: veg
          ? ['Sprouts chaat (1 bowl)', 'Glass of milk']
          : ['Boiled eggs (2) or sprouts', 'Glass of milk'] },
      { name: 'Dinner', time: '20:30', calories: p(0.25),
        items: veg
          ? ['2 rotis', 'Paneer/soya sabzi (100g)', 'Mixed veg']
          : ['2 rotis', 'Egg bhurji or dal', 'Sauteed veg'] },
    ],
    tips: [
      'Cook at home — cheaper and you control oil/portions.',
      'Buy dal, rice, eggs, milk, seasonal veg in bulk to cut cost.',
      'Drink 3–4 L water daily and hit your protein target.',
    ],
  };
}

export async function generateDietPlan({ profile, targets, ctx }) {
  const cal = targets?.calories ?? 2200;
  const isVeg = ['veg', 'vegan'].includes(profile.diet_pref);

  if (mockEnabled()) {
    const plans = isVeg
      ? [
          mockPlan('Budget Veg Plan', cal, targets, true, '₹120/day'),
          mockPlan('High-Protein Veg Plan', cal, targets, true, '₹160/day'),
        ]
      : [
          mockPlan('Budget Veg Plan', cal, targets, true, '₹120/day'),
          mockPlan('Budget Non-Veg Plan', cal, targets, false, '₹170/day'),
          mockPlan('High-Protein Non-Veg Plan', cal, targets, false, '₹200/day'),
        ];
    return { plans };
  }

  const dietRule = isVeg
    ? 'The user is VEGETARIAN/VEGAN — every meal in EVERY plan must be 100% veg (no egg unless eggetarian). Use dal, paneer, soya, curd, milk, peanuts, sprouts, rajma, chana.'
    : 'The user eats NON-VEG. Give VARIETY: at least one fully-veg plan AND non-veg plans. Non-veg should be affordable everyday protein only: eggs, chicken, small fish — NEVER mutton, prawns, or restaurant dishes.';

  const mealsPerDay = profile.meals_per_day || 4;
  const scheduleRule =
    `User's daily schedule — wake: ${profile.wake_time || 'unknown'}, sleep: ${profile.sleep_time || 'unknown'}, ` +
    `gym time: ${profile.gym_time || 'anytime'}. Set each meal's "time" (HH:MM) to fit this schedule: ` +
    'first meal ~30-60 min after waking; last meal ~2-3 h before sleep; if a gym time is given, place a ' +
    'lighter pre-workout snack ~60-90 min before it and a protein-rich meal within ~60 min after it. ' +
    `Use ${mealsPerDay} meals per plan, evenly spread across their waking hours.`;

  const system =
    'You are a practical Indian home-nutrition coach for gym-goers on a budget. ' +
    'Generate 3 DIFFERENT one-day meal plans so the user can choose. RULES: ' +
    '(1) Every plan must hit the given calorie & macro targets. ' +
    '(2) BUDGET-FRIENDLY, everyday HOME-COOKED Indian food only — dal, rice, roti, sabzi, eggs, ' +
    'curd, milk, oats, peanuts, sprouts, chana, soya, banana, seasonal veg, affordable chicken. ' +
    '(3) STRICTLY FORBIDDEN: mutton, korma, biryani, butter chicken, prawns, paneer-heavy restaurant ' +
    'dishes, expensive imports (quinoa, salmon, almonds-in-bulk, protein powder as a staple). ' +
    'Keep it simple and homely — what a normal Indian household actually cooks. ' +
    `(4) ${dietRule} ` +
    `(5) ${scheduleRule} ` +
    'Respond with ONLY a JSON object, no prose. Schema: {"plans": [{"title": string, "summary": string, ' +
    '"estimated_cost": string (e.g. "₹150/day"), "daily_calories": number, "protein_g": number, ' +
    '"carbs_g": number, "fat_g": number, "meals": [{"name": string, "time": "HH:MM", "items": [string], ' +
    '"calories": number}], "tips": [string]}]}. Give exactly 3 plans (2 if strictly veg).';

  const userMsg =
    `Profile: ${JSON.stringify(profile)}\n` +
    `Computed targets (every plan must match these): ${JSON.stringify(targets)}\n` +
    `Make ${mealsPerDay} meals per plan. Make the 3 plans genuinely different (different dishes), all cheap and home-cooked.`;

  const text = await invokeClaude({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 4000,
    feature: 'diet_plan',
    ctx,
  });
  const parsed = parseJsonLoose(text);
  // Be tolerant if the model returns a single plan instead of {plans:[...]}.
  if (parsed.plans) return parsed;
  return { plans: [parsed] };
}

// ---------------------------------------------------------------------------
// 3) Progress + logs -> coaching advice
// ---------------------------------------------------------------------------
export async function coachAdvice({ profile, targets, progress, recentNutrition, question, ctx }) {
  if (mockEnabled()) {
    return {
      message:
        "Yo, you're doing great — keep showing up! 💪 Your protein is running a little low, so " +
        'throw in an extra two eggs or a bowl of dal/curd. Stick to your home-cooked meals, ' +
        'weigh in every morning, and add a little weight to your lifts each week. You got this!',
      action_items: [
        'Add ~25g protein (2 eggs or a katori of dal/curd)',
        'Weigh in every morning, empty stomach',
        'Add 1 set or a little weight to your main lifts this week',
      ],
    };
  }

  const system =
    'You are the user\'s friendly, motivating gym buddy and coach — warm, encouraging and ' +
    'down-to-earth (a little hype is good, occasional emoji is fine). Base advice on their data. ' +
    'Focus ONLY on (a) gym training / progressive overload and (b) simple HOME-COOKED, budget ' +
    'nutrition (dal, rice, roti, eggs, curd, milk, sabzi, oats, peanuts, home-style chicken). ' +
    'NEVER suggest restaurant/hotel or expensive dishes (no mutton korma, biryani, butter chicken, ' +
    'protein powders as a must). Keep it short, specific and doable at home. ' +
    'Respond with ONLY a JSON object, no prose. Schema: {"message": string, "action_items": [string]}.';

  const userMsg =
    `Profile: ${JSON.stringify(profile)}\n` +
    `Targets: ${JSON.stringify(targets)}\n` +
    `Recent progress entries: ${JSON.stringify(progress)}\n` +
    `Recent nutrition (last meals): ${JSON.stringify(recentNutrition)}\n` +
    (question ? `User question: ${question}` : 'Give a weekly check-in summary and next steps.');

  const text = await invokeClaude({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 800,
    feature: 'coach',
    ctx,
  });
  return parseJsonLoose(text);
}

// ---------------------------------------------------------------------------
// 4) Progress photos -> AI assessment of whether progress is happening
// images: [{ base64, mediaType }] (oldest first, newest last; 1 or 2 photos)
// ---------------------------------------------------------------------------
export async function analyzeProgressPhotos({ images, profile, progress, ctx }) {
  if (mockEnabled()) {
    return {
      verdict: 'on_track',
      message:
        "Looking solid! 💪 I can see your shoulders and arms filling out and your waist looks " +
        'a touch tighter — that\'s real progress. Keep eating your home-cooked meals and stay ' +
        'consistent in the gym. Small wins every week add up big.',
      observations: [
        'Slightly more muscle definition in upper body',
        'Waist looks a bit leaner',
        'Posture looks more confident',
      ],
      action_items: [
        'Keep weekly progress photos in the same pose & lighting',
        'Hold your protein target with eggs/dal/curd',
        'Add small weight to compound lifts each week',
      ],
    };
  }

  const intro =
    images.length >= 2
      ? 'Two physique progress photos are provided: the FIRST is older, the SECOND is the most recent. Compare them.'
      : 'One physique progress photo is provided. Assess current condition and likely progress using the weight history.';

  const system =
    'You are a friendly, encouraging gym coach analysing a user\'s physique progress photos. ' +
    'Be supportive and realistic. Judge whether they appear to be making progress toward their goal. ' +
    'Reference muscle, leanness and posture at a high level (never give medical or body-shaming comments). ' +
    'Tie advice to gym training + simple home-cooked nutrition only (no restaurant/expensive food). ' +
    'Respond with ONLY a JSON object, no prose. Schema: {"verdict": "great"|"on_track"|"needs_adjustment", ' +
    '"message": string, "observations": [string], "action_items": [string]}.';

  const content = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: resolveMediaType(img.mediaType, img.base64), data: img.base64 },
  }));
  content.push({
    type: 'text',
    text:
      `${intro}\nGoal: ${profile.goal || 'unknown'} | diet: ${profile.diet_pref || 'unknown'}\n` +
      `Weight history (kg, oldest→newest): ${JSON.stringify(
        (progress || []).map((p) => p.weight_kg).filter(Boolean)
      )}\n` +
      'Is the user making progress? Give a friendly verdict, a few observations and home/gym action items.',
  });

  const text = await invokeClaude({
    system,
    messages: [{ role: 'user', content }],
    maxTokens: 1000,
    feature: 'progress_review',
    ctx,
  });
  return parseJsonLoose(text);
}

export function aiMode() {
  return mockEnabled() ? 'mock' : 'bedrock';
}
