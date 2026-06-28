// Shows the user's free-trial / Premium status: a countdown while active, or an
// upgrade prompt once it's ended.
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Txt } from './UI';
import { useAuth } from '../context/AuthContext';
import { useBilling } from '../context/BillingContext';
import { colors, font, radius, spacing } from '../theme';

export function TrialBanner() {
  const { user } = useAuth();
  const { aiActive, showPaywall } = useBilling();

  const daysLeft = user?.ai_until
    ? Math.max(0, Math.ceil((new Date(user.ai_until).getTime() - Date.now()) / 86400000))
    : 0;

  // Active trial/premium — show a friendly countdown.
  if (aiActive && daysLeft > 0) {
    return (
      <View style={{ backgroundColor: colors.accent + '1c', borderColor: colors.accent, borderWidth: 1, borderRadius: radius.md, padding: spacing(1.5), marginBottom: spacing(2), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={font.small} weight="700">🎁 Premium active — <Txt weight="900" style={{ color: colors.accent }}>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</Txt></Txt>
        {daysLeft <= 3 && (
          <TouchableOpacity onPress={() => showPaywall('Premium')}><Txt size={font.tiny} weight="800" style={{ color: colors.primary }}>Keep it →</Txt></TouchableOpacity>
        )}
      </View>
    );
  }

  // Trial ended — prompt to upgrade.
  if (!aiActive) {
    return (
      <TouchableOpacity onPress={() => showPaywall('Premium')} style={{ backgroundColor: colors.primary + '14', borderColor: colors.primary, borderWidth: 1, borderRadius: radius.md, padding: spacing(1.5), marginBottom: spacing(2), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={font.small} weight="800">🔓 Unlock Premium</Txt>
        <Txt size={font.tiny} dim>AI scan, plans & coach →</Txt>
      </TouchableOpacity>
    );
  }
  return null;
}
