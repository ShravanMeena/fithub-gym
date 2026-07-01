// Image that renders at its natural aspect ratio (full height, no crop). Uses the
// onLoad source dimensions so it also works for authenticated (header) sources.
import React, { useState } from 'react';
import { Image } from 'react-native';
import { colors, radius } from '../theme';

export function AutoImage({ source, style }: { source: any; style?: any }) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <Image
      source={source}
      onLoad={(e) => {
        const s = e?.nativeEvent?.source as any;
        if (s?.width && s?.height) setRatio(s.width / s.height);
      }}
      resizeMode="cover"
      style={[{ width: '100%', aspectRatio: ratio || 1.25, borderRadius: radius.sm, backgroundColor: colors.cardAlt }, style]}
    />
  );
}
