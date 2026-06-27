import React from 'react';
import { View, Image } from 'react-native';
import { Txt } from './UI';
import { colors, font } from '../theme';

// Dynamic white-label lockup: tintable dumbbell mark + gym name.
export function BrandMark({
  name,
  tagline,
  color,
  size = 'lg',
}: {
  name: string;
  tagline?: string;
  color?: string;
  size?: 'sm' | 'lg';
}) {
  const tint = color || colors.primary;
  const markW = size === 'lg' ? 92 : 30;
  return (
    <View style={{ alignItems: size === 'lg' ? 'center' : 'flex-start' }}>
      <Image
        source={require('../assets/mark.png')}
        style={{ width: markW, height: markW * 0.625, tintColor: tint, resizeMode: 'contain' }}
      />
      <Txt size={size === 'lg' ? font.h1 : font.h3} weight="800" style={{ marginTop: size === 'lg' ? 10 : 2 }}>
        {name}
      </Txt>
      {tagline ? <Txt dim size={font.small} style={{ marginTop: 2 }}>{tagline}</Txt> : null}
    </View>
  );
}
