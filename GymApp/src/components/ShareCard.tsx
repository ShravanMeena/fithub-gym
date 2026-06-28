// A premium, branded card capturing the member's progress — rendered off-screen
// and captured to an image (react-native-view-shot) for sharing to WhatsApp /
// Instagram. Pure presentational; the parent feeds it the numbers.
import React, { forwardRef } from 'react';
import { View } from 'react-native';
import { Txt } from './UI';
import { colors } from '../theme';

export type ShareCardProps = {
  name: string;
  gym?: string | null;
  streak: number;
  longest: number;
  monthCheckins: number;
  weightChange?: number | null;
};

export const ShareCard = forwardRef<View, ShareCardProps>(
  ({ name, gym, streak, longest, monthCheckins, weightChange }, ref) => {
    const stats: { label: string; value: string }[] = [
      { label: 'This month', value: `${monthCheckins}` },
      { label: 'Best streak', value: `${longest}d` },
    ];
    if (weightChange != null && Math.abs(weightChange) >= 0.1) {
      stats.push({ label: 'Weight', value: `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}kg` });
    }

    return (
      <View ref={ref} collapsable={false} style={{ width: 360, backgroundColor: '#0E1016', borderRadius: 28, padding: 28, overflow: 'hidden' }}>
        {/* header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt size={15} weight="800" style={{ color: colors.textDim, letterSpacing: 1 }}>{(gym || 'MY GYM').toUpperCase()}</Txt>
          <View style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Txt size={13} weight="900" style={{ color: '#fff', letterSpacing: 1 }}>FitHub</Txt>
          </View>
        </View>

        {/* streak hero */}
        <View style={{ alignItems: 'center', marginTop: 28, marginBottom: 8 }}>
          <Txt size={84} weight="900" style={{ color: '#fff' }}>🔥{streak}</Txt>
          <Txt size={18} weight="800" style={{ color: colors.primary, letterSpacing: 2, marginTop: -6 }}>DAY STREAK</Txt>
        </View>

        <Txt size={22} weight="800" style={{ color: '#fff', textAlign: 'center', marginTop: 10 }}>{name}</Txt>

        {/* stats */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 26, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#22252E' }}>
          {stats.map((s) => (
            <View key={s.label} style={{ alignItems: 'center' }}>
              <Txt size={26} weight="900" style={{ color: '#fff' }}>{s.value}</Txt>
              <Txt size={12} weight="700" style={{ color: colors.textDim, marginTop: 2 }}>{s.label}</Txt>
            </View>
          ))}
        </View>

        {/* footer */}
        <Txt size={14} weight="700" style={{ color: colors.textDim, textAlign: 'center', marginTop: 26 }}>
          Showing up. Every day. 💪
        </Txt>
      </View>
    );
  }
);
