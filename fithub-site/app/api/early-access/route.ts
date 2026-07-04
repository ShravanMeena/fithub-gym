import { NextResponse } from 'next/server';
import { SITE } from '@/lib/site';

// Early-access signups are forwarded to the FitHub backend, where they land in
// the `early_access` table and show up in the superadmin platform. Override the
// target with FITHUB_API_URL, or send a copy to a WAITLIST_WEBHOOK (Zapier etc.).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isEmail = (s: unknown) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export async function POST(req: Request) {
  let data: Record<string, string> = {};
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const name = (data.name || '').toString().trim().slice(0, 120);
  const email = (data.email || '').toString().trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: 'Please add your name.' }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });

  const lead = {
    name,
    email,
    phone: (data.phone || '').toString().trim().slice(0, 40),
    goal: (data.goal || '').toString().trim().slice(0, 60),
    gym: (data.gym || '').toString().trim().slice(0, 120),
    at: new Date().toISOString(),
    source: 'fithub-site',
  };

  // Forward to the FitHub backend (lands in the superadmin platform).
  try {
    const r = await fetch(`${SITE.apiUrl}/api/early-access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead),
    });
    if (!r.ok) console.error('[early-access] backend responded', r.status);
  } catch (e) {
    console.error('[early-access] backend forward failed:', e);
    // Don't fail the user — we still logged it below.
  }

  // Optional extra copy (Zapier / Sheets / Slack).
  if (process.env.WAITLIST_WEBHOOK) {
    try { await fetch(process.env.WAITLIST_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }); } catch {}
  }

  console.log('[early-access] new lead:', JSON.stringify(lead));
  return NextResponse.json({ ok: true });
}
