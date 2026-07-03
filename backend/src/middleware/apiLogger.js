import { q } from '../db/index.js';

// ---------------------------------------------------------------------------
// API observability middleware.
//
// Captures every /api request + response (method, path, status, latency, who,
// headers, bodies) and writes it to `api_logs` — fire-and-forget, so logging
// can never slow down or break a request. Sensitive fields are redacted and
// long values truncated so we never persist passwords, tokens or megabytes of
// base64. Surfaced to superadmin so we can see exactly what broke and for whom.
// ---------------------------------------------------------------------------

const ENABLED = process.env.API_LOG !== '0';
// Sample rate for *successful* requests (0..1). Errors are always logged.
// Default 1 = keep everything (small user base); lower it if volume grows.
const SUCCESS_SAMPLE = Number(process.env.API_LOG_SAMPLE ?? '1');
const RETENTION_DAYS = Number(process.env.API_LOG_RETENTION_DAYS ?? '14');

const MAX_STR = 2000; // truncate any single string to this many chars
const REDACT_KEY = /pass(word)?|token|secret|otp|auth|imagebase64|base64|avatar|jwt|apikey|api_key/i;

// Deep clone with redaction + truncation. Never throws.
function clip(v, depth = 0) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > MAX_STR ? `${v.slice(0, MAX_STR)}…[+${v.length - MAX_STR} chars]` : v;
  if (typeof v !== 'object') return String(v);
  if (depth > 4) return '[deep]';
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => clip(x, depth + 1));
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = REDACT_KEY.test(k) ? '[redacted]' : clip(val, depth + 1);
  }
  return out;
}

function safeHeaders(h) {
  const out = {};
  for (const [k, val] of Object.entries(h || {})) {
    out[k] = /authorization|cookie|token/i.test(k) ? '[redacted]' : val;
  }
  return out;
}

export function apiLogger(req, res, next) {
  if (!ENABLED || !req.path.startsWith('/api')) return next();
  // Don't log the logs console itself (avoids the observer effect flooding the log).
  if (req.path.startsWith('/api/super/logs')) return next();

  const start = process.hrtime.bigint();
  let resBody;
  const origJson = res.json.bind(res);
  res.json = (body) => { resBody = body; return origJson(body); };
  const origSend = res.send.bind(res);
  res.send = (body) => { if (resBody === undefined && typeof body !== 'object') resBody = body; return origSend(body); };

  res.on('finish', () => {
    try {
      const status = res.statusCode;
      const isError = status >= 400;
      // Sample down successes; always keep errors.
      if (!isError && SUCCESS_SAMPLE < 1 && Math.random() > SUCCESS_SAMPLE) return; // eslint-disable-line no-restricted-properties

      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      const routePath = req.route && typeof req.route.path === 'string' ? req.route.path : '';
      const route = ((req.baseUrl || '') + routePath) || req.path;
      // Prefer the real thrown error (stack) captured by the error handler;
      // fall back to the response body for 4xx / handled errors.
      const errText = req._error
        ? String(req._error.stack || req._error.message || req._error).slice(0, 4000)
        : isError
          ? (typeof resBody === 'object' ? JSON.stringify(resBody).slice(0, 4000) : String(resBody ?? '').slice(0, 4000))
          : null;

      const rec = [
        req.method,
        req.originalUrl.split('?')[0],
        route,
        status,
        durationMs,
        req.user?.id ?? null,
        (String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim() || null,
        req.headers['user-agent'] || null,
        JSON.stringify(safeHeaders(req.headers)),
        req.query && Object.keys(req.query).length ? JSON.stringify(clip(req.query)) : null,
        req.body && typeof req.body === 'object' && Object.keys(req.body).length ? JSON.stringify(clip(req.body)) : null,
        resBody !== undefined ? JSON.stringify(clip(resBody)) : null,
        errText,
        !isError,
      ];
      // Fire and forget — a failed log write must never surface to the user.
      q(
        `INSERT INTO api_logs (method, path, route, status, duration_ms, user_id, ip, user_agent, req_headers, req_query, req_body, res_body, error, ok)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        rec
      ).catch(() => {});
    } catch { /* logging must never break the request */ }
  });

  next();
}

// Delete logs older than the retention window. Called at startup + periodically.
export async function pruneApiLogs() {
  try {
    if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) return;
    await q(`DELETE FROM api_logs WHERE ts < now() - ($1 || ' days')::interval`, [String(RETENTION_DAYS)]);
  } catch { /* ignore */ }
}

// Kick off retention: prune now, then every 6 hours.
export function startApiLogRetention() {
  if (!ENABLED) return;
  pruneApiLogs();
  setInterval(pruneApiLogs, 6 * 60 * 60 * 1000).unref?.();
}
