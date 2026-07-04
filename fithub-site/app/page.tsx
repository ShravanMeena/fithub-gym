import type { Metadata } from 'next';
import EarlyAccessForm from '@/components/EarlyAccessForm';
import HeroCapture from '@/components/HeroCapture';
import Reveal from '@/components/Reveal';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline} | Gym app with AI diet & tracking`,
  description: SITE.description,
  alternates: { canonical: '/' },
};

const WANTS = [
  { k: 'Consistency', h: 'To actually show up', p: "You don't need a fancier workout log. You need something that makes you turn up 4–5 days a week — and rewards you when you do." },
  { k: 'Clarity', h: 'To know what to eat', p: 'No more guessing macros or copying random diets. A plan built around your goal and the home food you already eat.' },
  { k: 'Proof', h: 'To see it working', p: 'Progress photos, weight, PRs and streaks — laid out so you can see the change even on days the mirror lies.' },
  { k: 'People', h: 'To not do it alone', p: 'Your gym crew in one place — a feed, group chat, DMs, cheers and a leaderboard that keeps you accountable.' },
];

const FEATURES = [
  { e: '📷', h: 'AI food scan', p: 'Snap your plate — instant calories, protein, carbs and fat. No weighing, no guessing.' },
  { e: '🥗', h: 'Diet for your goal', p: 'A meal plan built around Indian home food and your schedule — bulk, cut or maintain.', free: true },
  { e: '🔥', h: 'Streaks & challenges', p: 'Check in, keep the streak alive, earn badges and win the monthly challenge. Consistency, made a game.' },
  { e: '💪', h: 'Workout & PR tracking', p: 'Log sessions and watch your bench, squat and deadlift climb over the months.' },
  { e: '📸', h: 'Progress, seen', p: 'A private photo timeline with AI check-ins so the transformation is undeniable.' },
  { e: '👥', h: 'Your gym community', p: 'A feed for wins, group chat, 1-on-1 DMs and a live "who’s in the gym right now".' },
  { e: '✅', h: 'Check-in & leaderboard', p: 'Tap in when you arrive. Climb your gym’s monthly leaderboard simply by showing up.', free: true },
  { e: '💧', h: 'Water & reminders', p: 'Hit your water goal and get nudged for meals, workouts and check-ins at the right moment.' },
  { e: '📊', h: 'One clean dashboard', p: 'Calories left, macros, streak, next session — everything for today, on one screen.' },
];

const STEPS = [
  { h: 'Join your gym', p: 'Pick your gym and set up your profile in under a minute.' },
  { h: 'Set your goal', p: 'Tell us your goal & stats — we set your calories, protein target and plan.' },
  { h: 'Show up & track', p: 'Check in, scan your food, log your lifts. The app does the math.' },
  { h: 'Watch it add up', p: 'Streaks, PRs and photos turn effort into visible proof.' },
];

const FAQS = [
  { q: 'Is FitHub free?', a: 'Yes — check-in, streaks, community, quick-add food and ready-made diet plans are free. AI features like food scanning, personalised AI diet plans and photo analysis are part of Premium.' },
  { q: 'Do I need to belong to a specific gym?', a: 'FitHub is built for gyms and their members. You join your gym inside the app to unlock the community, leaderboard and check-ins. Ask your gym to get on FitHub, or join early access and we’ll help make it happen.' },
  { q: 'Which phones does it work on?', a: 'FitHub is available for both Android and iOS.' },
  { q: 'How does the AI food scan work?', a: 'Point your camera at your meal. The AI identifies the food and estimates calories, protein, carbs and fat — then you log it in one tap. You can also scan packaged-food barcodes for exact macros.' },
  { q: 'Is my data private?', a: 'Your progress photos are private by default, and you control exactly what you share to your gym feed. We never sell your data.' },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

const Logo = () => (
  <span className="logo">
    <span className="bars" aria-hidden><i style={{ height: '52%' }} /><i style={{ height: '78%' }} /><i style={{ height: '100%' }} /></span>
    <span><span className="fit">FIT</span><span className="hub">HUB</span></span>
  </span>
);

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="nav">
        <div className="wrap nav-inner">
          <a href="#top" aria-label="FitHub home"><Logo /></a>
          <nav className="nav-links" aria-label="Primary">
            <a className="link" href="#features">Features</a>
            <a className="link" href="#how">How it works</a>
            <a className="link" href="#faq">FAQ</a>
            <a className="btn btn-primary btn-sm" href="#early">Get early access</a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero — early access front and centre */}
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <Reveal><span className="eyebrow"><span className="dot" aria-hidden /> Early access · now open</span></Reveal>
              <Reveal as="h1" delay={60}>Your gym.<br />Now in your <span className="accent">pocket.</span></Reveal>
              <Reveal delay={130}><p className="lead">The app that actually keeps you showing up — AI diet, food scanning, streaks, PRs and your gym community, in one place.</p></Reveal>
              <Reveal delay={200}><HeroCapture /></Reveal>
              <Reveal delay={280}>
                <div className="hero-trust">
                  <div><b>One</b> app for training, diet & community</div>
                  <div><b><span className="u">Zero</span></b> guesswork — AI does the macros</div>
                  <div><b>100%</b> built for gym-goers</div>
                </div>
              </Reveal>
            </div>

            <Reveal delay={180} className="phone-wrap">
              <div className="phone" role="img" aria-label="FitHub app home screen: a 24-day streak, calorie tracker and check-in">
                <div className="screen">
                  <div className="notch" aria-hidden />
                  <div className="hi">Hey, Arjun 👋<span>Wednesday · Push day</span></div>
                  <div className="streak">
                    <span aria-hidden style={{ fontSize: 30 }}>🔥</span>
                    <span><span className="n">24</span></span>
                    <span className="l">Day<br />streak</span>
                  </div>
                  <div className="mcard">
                    <div className="h"><span>Today’s intake</span><span>Goal 2,100</span></div>
                    <div className="big">1,480 kcal</div>
                    <div className="bar"><i /></div>
                    <div className="macros">
                      <div><div className="mv" style={{ color: '#ff854e' }}>128g</div><div className="ml">Protein</div></div>
                      <div><div className="mv" style={{ color: '#6bc6ff' }}>156g</div><div className="ml">Carbs</div></div>
                      <div><div className="mv" style={{ color: '#ffd27a' }}>42g</div><div className="ml">Fat</div></div>
                    </div>
                  </div>
                  <div className="checkin">✓ Checked in today</div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Marquee band */}
        <div className="band" aria-hidden>
          <div className="band-track">
            <span>AI food scan</span><span>Streaks</span><span>Personal records</span><span>Group chat</span><span>Progress photos</span><span>Leaderboards</span>
            <span>AI food scan</span><span>Streaks</span><span>Personal records</span><span>Group chat</span><span>Progress photos</span><span>Leaderboards</span>
          </div>
        </div>

        {/* What gym-goers want */}
        <section className="section">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow"><span className="dot" aria-hidden /> Built for gym-goers</span>
              <h2>What you actually <span className="accent">want</span> from a fitness app</h2>
              <p>Most apps hand you a spreadsheet. You don’t want a spreadsheet — you want to show up, know what to eat, and see it working. FitHub is built around exactly that.</p>
            </Reveal>
            <div className="wants">
              {WANTS.map((w, i) => (
                <Reveal as="article" className="want" key={w.h} delay={i * 60}>
                  <span className="k">{w.k}</span>
                  <h3>{w.h}</h3>
                  <p>{w.p}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="section" id="features" style={{ background: 'var(--bg-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow"><span className="dot" aria-hidden /> Everything in one app</span>
              <h2>Train smarter. Eat right. <span className="accent">Stay consistent.</span></h2>
              <p>No more juggling five apps. FitHub brings your diet, workouts, progress and gym community together — with AI doing the heavy lifting.</p>
            </Reveal>
            <div className="features">
              {FEATURES.map((f, i) => (
                <Reveal as="article" className={`feature${f.free ? ' free' : ''}`} key={f.h} delay={(i % 3) * 60}>
                  <div className="ic" aria-hidden>{f.e}</div>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                  {f.free ? <span className="tag-free">Always free</span> : null}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="section" id="how">
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow"><span className="dot" aria-hidden /> How it works</span>
              <h2>From “I should go to the gym” <span className="accent">to results</span></h2>
              <p>Four steps. A few minutes to set up. Then the app quietly keeps you on track.</p>
            </Reveal>
            <div className="steps">
              {STEPS.map((s, i) => (
                <Reveal as="article" className="step" key={s.h} delay={i * 60}>
                  <div className="num">STEP {`0${i + 1}`}</div>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Early access */}
        <section className="section" id="early" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="ea">
              <div className="ea-grid">
                <div>
                  <span className="eyebrow"><span className="dot" aria-hidden /> Limited early access</span>
                  <h2 style={{ marginTop: 14 }}>Be first <span className="accent">in the gym.</span></h2>
                  <p className="muted" style={{ marginTop: 16, fontSize: 17, lineHeight: 1.65 }}>Join the early access list and get in before everyone else — plus a real say in what we build next.</p>
                  <div className="perks">
                    <div className="perk"><span className="c">✓</span><span>Early invite before public launch</span></div>
                    <div className="perk"><span className="c">✓</span><span>Founding-member Premium perks</span></div>
                    <div className="perk"><span className="c">✓</span><span>A direct line to shape features</span></div>
                    <div className="perk"><span className="c">✓</span><span>We’ll help get your gym on FitHub</span></div>
                  </div>
                </div>
                <EarlyAccessForm />
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="section" id="faq" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="head">
              <span className="eyebrow"><span className="dot" aria-hidden /> FAQ</span>
              <h2>Questions, <span className="accent">answered</span></h2>
            </Reveal>
            <div className="faq">
              {FAQS.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <a href="#top" aria-label="FitHub home"><Logo /></a>
          <small>© {new Date().getFullYear()} {SITE.name} · Your gym, in your pocket.</small>
          <a className="btn btn-primary btn-sm" href="#early">Get early access</a>
        </div>
      </footer>
    </>
  );
}
