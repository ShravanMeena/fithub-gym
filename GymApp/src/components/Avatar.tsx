// Profile avatar — shows the user's photo, or a coloured initial fallback.
import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { Txt } from './UI';
import { avatarSource } from '../api/client';
import { colors } from '../theme';

// Deterministic colour from the name so fallbacks look intentional.
const PALETTE = ['#FF5A1F', '#23D18B', '#22D3EE', '#7C5CFF', '#F7B500', '#FF4D8D'];
const colorFor = (name?: string) => {
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export function Avatar({
  userId, name, hasAvatar = true, size = 40, version,
}: { userId?: number; name?: string; hasAvatar?: boolean; size?: number; version?: number }) {
  const [src, setSrc] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false); setSrc(null);
    if (userId && hasAvatar) avatarSource(userId, version).then((s) => alive && setSrc(s)).catch(() => {});
    return () => { alive = false; };
  }, [userId, hasAvatar, version]);

  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';
  const showImg = src && !failed && hasAvatar;

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colorFor(name), alignItems: 'center', justifyContent: 'center' }}>
      {showImg ? (
        <Image source={src} onError={() => setFailed(true)} style={{ width: size, height: size }} />
      ) : (
        <Txt weight="800" size={Math.round(size * 0.42)} style={{ color: '#fff' }}>{initial}</Txt>
      )}
    </View>
  );
}
