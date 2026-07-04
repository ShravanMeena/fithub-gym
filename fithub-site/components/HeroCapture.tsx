'use client';
import { useState } from 'react';

// Compact inline early-access capture for the hero — just an email + button.
export default function HeroCapture() {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = (new FormData(e.currentTarget).get('email') || '').toString().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setState('err'); setMsg('Enter a valid email'); return; }
    setState('loading'); setMsg('');
    try {
      const res = await fetch('/api/early-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: email.split('@')[0], email, source: 'hero' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Try again');
      setState('ok'); setMsg("You're on the list — we'll email your invite. 💪");
    } catch (err: any) { setState('err'); setMsg(err.message || 'Try again'); }
  }

  if (state === 'ok') {
    return <p className="hero-ok" role="status">✅ {msg}</p>;
  }

  return (
    <form className="hero-capture" onSubmit={onSubmit} noValidate>
      <div className="capture-box">
        <input name="email" type="email" inputMode="email" autoComplete="email" placeholder="Enter your email for early access" aria-label="Email for early access" />
        <button className="btn btn-primary" type="submit" disabled={state === 'loading'}>
          {state === 'loading' ? 'Joining…' : 'Get early access'}
          <span aria-hidden>→</span>
        </button>
      </div>
      <p className="capture-sub">{state === 'err' ? <span className="capture-err">{msg}</span> : <>Free to join · No spam · Founding-member perks</>}</p>
    </form>
  );
}
