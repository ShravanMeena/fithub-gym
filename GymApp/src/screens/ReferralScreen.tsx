// Share & Earn — invite friends with your code, earn coins, unlock free Premium.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Share, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button } from '../components/UI';
import { ReferralAPI } from '../api/client';
import { colors, font, radius, shadow, spacing } from '../theme';

const APP_LINK = 'https://play.google.com/store/apps/details?id=com.fithub.gym';
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export default function ReferralScreen() {
  const [d, setD] = useState<any>(null);

  const load = useCallback(() => { ReferralAPI.get().then(setD).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = () => {
    if (!d?.code) return;
    Share.share({
      message: `Join me on FitHub 💪 Use my code ${d.code} when you sign up and let's stay consistent together!\n\nDownload: ${APP_LINK}`,
    }).catch(() => {});
  };

  if (!d) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const next = d.next;
  const progress = next ? clamp(d.referrals / next.count) : 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="900">Share & Earn 🎁</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Invite friends, earn coins, and unlock free Premium.</Txt>

      {/* Coins + code hero */}
      <View style={[{ backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing(2.5), marginBottom: spacing(2) }, shadow]}>
        <Txt size={font.small} weight="800" style={{ color: '#fff', opacity: 0.9 }}>YOUR COINS</Txt>
        <Txt size={font.h1} weight="900" style={{ color: '#fff' }}>🪙 {d.coins}</Txt>
        <View style={{ backgroundColor: '#ffffff22', borderRadius: radius.md, padding: spacing(1.5), marginTop: spacing(1.5), alignItems: 'center' }}>
          <Txt size={font.tiny} weight="700" style={{ color: '#fff', opacity: 0.9 }}>YOUR REFERRAL CODE</Txt>
          <Txt size={font.h2} weight="900" style={{ color: '#fff', letterSpacing: 3, marginTop: 2 }}>{d.code}</Txt>
        </View>
      </View>

      <Button title="📲 Share my code" onPress={share} />

      {/* Progress to next reward */}
      <Card style={{ marginTop: spacing(2) }}>
        <Txt weight="800">{d.referrals} friend{d.referrals === 1 ? '' : 's'} joined 🎉</Txt>
        {next ? (
          <>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>
              {next.count - d.referrals} more to unlock <Txt weight="800" style={{ color: colors.primary }}>{next.label}</Txt> free
            </Txt>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.cardAlt, marginTop: spacing(1.5), overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
            </View>
          </>
        ) : (
          <Txt size={font.small} style={{ color: colors.accent, marginTop: 4 }}>🏆 You've unlocked every reward — amazing!</Txt>
        )}
      </Card>

      {/* Rewards list */}
      <Txt weight="800" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>Rewards</Txt>
      {(d.milestones || []).map((m: any) => {
        const done = d.referrals >= m.count;
        return (
          <Card key={m.count} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: done ? colors.accent : colors.border }}>
            <View style={{ flex: 1 }}>
              <Txt weight="800">{m.label}</Txt>
              <Txt dim size={font.small}>Refer {m.count} friends</Txt>
            </View>
            <Txt size={20}>{done ? '✅' : '🔒'}</Txt>
          </Card>
        );
      })}

      <Card style={{ backgroundColor: colors.cardAlt, marginTop: spacing(1) }}>
        <Txt weight="800">How it works</Txt>
        <Txt dim size={font.small} style={{ marginTop: 6, lineHeight: 20 }}>
          1. Share your code with friends.{'\n'}
          2. They enter it when creating their account.{'\n'}
          3. You earn {d.coinsPerReferral} coins per friend — and free Premium at each milestone. 🎉
        </Txt>
      </Card>
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
