import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Dynamic social-share image (Open Graph + Twitter card).
// Note: Satori requires display:flex on every element with >1 child.
export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          backgroundColor: '#09090B',
          backgroundImage: 'radial-gradient(circle at 78% 12%, #3a1e0e 0%, transparent 58%)',
          padding: 76, color: '#F1EDE7', fontFamily: 'serif',
        }}
      >
        {/* logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 32 }}>
            <div style={{ width: 8, height: 16, backgroundColor: '#FF6A2B', borderRadius: 3 }} />
            <div style={{ width: 8, height: 24, backgroundColor: '#FF6A2B', borderRadius: 3 }} />
            <div style={{ width: 8, height: 32, backgroundColor: '#FF6A2B', borderRadius: 3 }} />
          </div>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, fontFamily: 'sans-serif' }}>
            <span style={{ color: '#F1EDE7' }}>FIT</span>
            <span style={{ color: '#FF6A2B' }}>HUB</span>
          </div>
        </div>

        {/* headline block */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 600, letterSpacing: 6, color: '#E8C88B', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>
            Early access · now open
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 90, fontWeight: 400, lineHeight: 1.02, marginTop: 18, letterSpacing: -3 }}>
            <div style={{ display: 'flex' }}>Your gym, in your</div>
            <div style={{ display: 'flex', color: '#FF6A2B', fontStyle: 'italic' }}>pocket.</div>
          </div>
          <div style={{ display: 'flex', fontSize: 29, color: '#97918A', marginTop: 24, maxWidth: 950, fontFamily: 'sans-serif' }}>
            AI diet, food scanning, streaks, PRs & your gym community — one app that keeps you showing up.
          </div>
        </div>

        {/* chips */}
        <div style={{ display: 'flex', gap: 14, fontFamily: 'sans-serif' }}>
          {['AI food scan', 'Streaks', 'Track PRs', 'Community'].map((t) => (
            <div key={t} style={{ display: 'flex', fontSize: 22, fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', padding: '12px 22px', borderRadius: 999 }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
