// Share & Earn — invite friends with your code, earn FREE Premium days. The more
// friends join, the more days you get (1→1, 2→2, 3→3, 5→10, 10→30, 25→90).
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
    const reward = d.next ? ` Every friend who joins gets me free Premium days!` : '';
    Share.share({
      message: `Join me on FitHub 💪 Use my code ${d.code} when you sign up and let's stay consistent together!${reward}\n\nDownload: ${APP_LINK}`,
    }).catch(() => {});
  };

  if (!d) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const next = d.next;
  const progress = next ? clamp(d.referrals / next.count) : 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="900">Share & Earn 🎁</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Invite friends — earn <Txt weight="800" style={{ color: colors.primary }}>free Premium days</Txt>. The more who join, the more you get.</Txt>

      {/* Premium-days earned + code hero */}
      <View style={[{ backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing(2.5), marginBottom: spacing(2) }, shadow]}>
        <Txt size={font.small} weight="800" style={{ color: '#fff', opacity: 0.9 }}>FREE PREMIUM EARNED</Txt>
        <Txt size={font.h1} weight="900" style={{ color: '#fff' }}>🎁 {d.daysEarned || 0} day{d.daysEarned === 1 ? '' : 's'}</Txt>
        <Txt size={font.tiny} weight="700" style={{ color: '#fff', opacity: 0.9 }}>{d.referrals} friend{d.referrals === 1 ? '' : 's'} joined</Txt>
        <View style={{ backgroundColor: '#ffffff22', borderRadius: radius.md, padding: spacing(1.5), marginTop: spacing(1.5), alignItems: 'center' }}>
          <Txt size={font.tiny} weight="700" style={{ color: '#fff', opacity: 0.9 }}>YOUR REFERRAL CODE</Txt>
          <Txt size={font.h2} weight="900" style={{ color: '#fff', letterSpacing: 3, marginTop: 2 }}>{d.code}</Txt>
        </View>
      </View>

      <Button title="📲 Share my code" onPress={share} />

      {/* The nudge: next reward */}
      {next ? (
        <Card style={{ marginTop: spacing(2), borderColor: colors.primary }}>
          <Txt size={font.h3} weight="900" style={{ color: colors.primary }}>
            {next.friendsAway === 1 ? 'Just 1 more friend' : `${next.friendsAway} more friends`} → +{next.days} day{next.days === 1 ? '' : 's'} free! 🔥
          </Txt>
          <Txt dim size={font.small} style={{ marginTop: 2 }}>Invite {next.friendsAway} more to unlock your next reward.</Txt>
          <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.cardAlt, marginTop: spacing(1.5), overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
          </View>
          <Txt dim size={font.tiny} style={{ marginTop: 6 }}>{d.referrals} / {next.count} friends</Txt>
        </Card>
      ) : (
        <Card style={{ marginTop: spacing(2), borderColor: colors.accent }}>
          <Txt weight="800" style={{ color: colors.accent }}>🏆 You've unlocked every reward — legend!</Txt>
          <Txt dim size={font.small} style={{ marginTop: 2 }}>Keep sharing to help your gym grow.</Txt>
        </Card>
      )}

      {/* Reward ladder */}
      <Txt weight="800" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>Reward ladder</Txt>
      {(d.milestones || []).map((m: any) => {
        const done = m.reached;
        const isNext = next && m.count === next.count;
        return (
          <Card key={m.count} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: done ? colors.accent : isNext ? colors.primary : colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: done ? colors.accent : isNext ? colors.primary : colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: spacing(1.5) }}>
                <Txt weight="900" style={{ color: done || isNext ? '#fff' : colors.textDim }}>{m.count}</Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="800">{m.days} day{m.days === 1 ? '' : 's'} free Premium</Txt>
                <Txt dim size={font.small}>Refer {m.count} friend{m.count === 1 ? '' : 's'}{isNext ? '  · next up!' : ''}</Txt>
              </View>
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
          3. Each friend who joins moves you up the ladder — and free Premium days land on your account automatically. 🎉
        </Txt>
      </Card>
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
