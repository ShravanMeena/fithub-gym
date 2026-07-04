'use client';
import { useState } from 'react';

export default function EarlyAccessForm() {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('loading'); setMsg('');
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setState('ok');
      setMsg("You're on the list! We'll email you the moment early access opens. 💪");
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      setState('err');
      setMsg(err.message || 'Could not submit. Try again.');
    }
  }

  if (state === 'ok') {
    return (
      <div className="form" role="status">
        <p className="ok" style={{ fontSize: 18 }}>🎉 {msg}</p>
        <button type="button" className="btn btn-ghost" onClick={() => { setState('idle'); setMsg(''); }}>Add another</button>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" required placeholder="e.g. Arjun" autoComplete="name" />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required placeholder="you@email.com" autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone (optional)</label>
          <input id="phone" name="phone" inputMode="tel" placeholder="+91…" autoComplete="tel" />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="goal">Your main goal</label>
          <select id="goal" name="goal" defaultValue="">
            <option value="" disabled>Choose one</option>
            <option>Build muscle</option>
            <option>Lose fat</option>
            <option>Get consistent</option>
            <option>Body recomposition</option>
            <option>Just started the gym</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="gym">Your gym (optional)</label>
          <input id="gym" name="gym" placeholder="Gym name" />
        </div>
      </div>
      {state === 'err' ? <p className="err">{msg}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={state === 'loading'} style={{ marginTop: 4 }}>
        {state === 'loading' ? 'Joining…' : 'Get early access →'}
      </button>
      <small>Free to join. No spam — just your invite when we open the doors.</small>
    </form>
  );
}
