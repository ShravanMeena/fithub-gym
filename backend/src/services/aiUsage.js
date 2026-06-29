// AI usage accounting: log every Bedrock/Claude call's tokens against the user
// and compute its cost. Powers per-user and platform-wide usage stats.
import { exec, q, one } from '../db/index.js';

// USD per 1,000,000 tokens, by model family (Bedrock Anthropic list prices).
// Override with AI_PRICE_INPUT / AI_PRICE_OUTPUT env (applied to the active model).
const PRICES = [
  { match: 'opus', input: 15, output: 75 },
  { match: 'sonnet', input: 3, output: 15 },
  { match: 'haiku', input: 0.8, output: 4 },
];

function priceFor(model) {
  const envIn = parseFloat(process.env.AI_PRICE_INPUT);
  const envOut = parseFloat(process.env.AI_PRICE_OUTPUT);
  if (Number.isFinite(envIn) && Number.isFinite(envOut)) return { input: envIn, output: envOut };
  const m = String(model || '').toLowerCase();
  return PRICES.find((p) => m.includes(p.match)) || PRICES[1]; // default: sonnet
}

// Cost in USD for a single call.
export function costUsd(model, inputTokens = 0, outputTokens = 0) {
  const p = priceFor(model);
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

// Record one AI call. Best-effort: never throws into the request path.
export async function recordAiUsage({ userId, orgId, feature, model, inputTokens = 0, outputTokens = 0 }) {
  try {
    if (!userId) return;
    const input = Math.max(0, Math.round(inputTokens || 0));
    const output = Math.max(0, Math.round(outputTokens || 0));
    const total = input + output;
    const cost = costUsd(model, input, output);
    await exec(
      `INSERT INTO ai_usage (user_id, org_id, feature, model, input_tokens, output_tokens, total_tokens, cost_usd)
       VALUES ($1, COALESCE($2, (SELECT org_id FROM users WHERE id = $1)), $3, $4, $5, $6, $7, $8)`,
      [userId, orgId || null, feature || 'unknown', model || null, input, output, total, cost]
    );
  } catch (e) {
    console.log('[ai-usage] record failed —', e.message);
  }
}

const TOTALS = `COUNT(*) AS calls,
  COALESCE(SUM(input_tokens),0)::int AS input_tokens,
  COALESCE(SUM(output_tokens),0)::int AS output_tokens,
  COALESCE(SUM(total_tokens),0)::int AS total_tokens,
  ROUND(COALESCE(SUM(cost_usd),0), 4) AS cost_usd`;

// One user's own usage: totals, per-feature breakdown, recent calls.
export async function userUsage(userId) {
  const totals = await one(`SELECT ${TOTALS} FROM ai_usage WHERE user_id = $1`, [userId]);
  const byFeature = await q(
    `SELECT feature, ${TOTALS} FROM ai_usage WHERE user_id = $1 GROUP BY feature ORDER BY total_tokens DESC`,
    [userId]
  );
  const recent = await q(
    `SELECT feature, model, input_tokens, output_tokens, total_tokens, ROUND(cost_usd, 5) AS cost_usd, created_at
     FROM ai_usage WHERE user_id = $1 ORDER BY id DESC LIMIT 20`,
    [userId]
  );
  return { totals, byFeature, recent };
}

// Platform-wide usage (superadmin): grand totals, per-feature, top users.
export async function globalUsage() {
  const totals = await one(`SELECT ${TOTALS} FROM ai_usage`);
  const byFeature = await q(`SELECT feature, ${TOTALS} FROM ai_usage GROUP BY feature ORDER BY cost_usd DESC`);
  const byUser = await q(
    `SELECT u.id, u.name, u.email, o.name AS gym,
            COUNT(*) AS calls,
            COALESCE(SUM(a.total_tokens),0)::int AS total_tokens,
            ROUND(COALESCE(SUM(a.cost_usd),0), 4) AS cost_usd,
            MAX(a.created_at) AS last_used
     FROM ai_usage a JOIN users u ON u.id = a.user_id
     LEFT JOIN organizations o ON o.id = a.org_id
     GROUP BY u.id, u.name, u.email, o.name
     ORDER BY cost_usd DESC LIMIT 200`
  );
  return { totals, byFeature, byUser };
}
