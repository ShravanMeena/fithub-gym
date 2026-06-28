// Gym leaderboard — clean, modern ranking with profile photos.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { ChallengeAPI } from '../api/client';
import { useOrg } from '../context/OrgContext';
import { colors, font, radius, shadow, spacing } from '../theme';

const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null);

export default function ChallengesScreen() {
  const { org } = useOrg();
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p = period) => {
    try { setData(await ChallengeAPI.leaderboard(p)); } catch {}
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const board = data?.leaderboard || [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>

      <Txt size={font.h2} weight="900">🏆 Leaderboard</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Most gym check-ins at {org?.name || 'your gym'} — keep showing up to climb.</Txt>

      {/* Period switch */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing(2) }}>
        {([['month', 'This month'], ['week', 'This week']] as const).map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => { setPeriod(k); load(k); }} style={{ flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center', backgroundColor: period === k ? colors.primary : 'transparent' }}>
            <Txt weight="800" size={font.small} style={{ color: period === k ? '#fff' : colors.textDim }}>{label}</Txt>
          </TouchableOpacity>
        ))}
      </View>

      {/* Your standing */}
      {data?.me && (
        <View style={[{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing(2), marginBottom: spacing(2), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, shadow]}>
          <View>
            <Txt size={font.small} weight="700" style={{ color: '#fff', opacity: 0.85 }}>YOUR RANK</Txt>
            <Txt size={font.h1} weight="900" style={{ color: '#fff' }}>{data.me.rank ? `#${data.me.rank}` : '—'}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt size={font.h2} weight="900" style={{ color: '#fff' }}>{data.me.value}</Txt>
            <Txt size={font.tiny} style={{ color: '#fff', opacity: 0.85 }}>check-in days</Txt>
          </View>
        </View>
      )}

      {board.length === 0 ? (
        <Card><Txt dim>No check-ins yet this {period}. Be the first on the board! 💪</Txt></Card>
      ) : (
        board.map((r: any) => {
          const top = r.rank <= 3;
          return (
            <View
              key={r.id ?? r.rank}
              style={{
                flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(1.25), paddingHorizontal: spacing(1.5),
                backgroundColor: r.isMe ? colors.primary + '1f' : colors.card,
                borderWidth: 1, borderColor: r.isMe ? colors.primary : colors.border,
                borderRadius: radius.md, marginBottom: 8,
              }}>
              <View style={{ width: 34, alignItems: 'center' }}>
                {medal(r.rank) ? <Txt size={22}>{medal(r.rank)}</Txt> : <Txt weight="900" dim size={font.body}>{r.rank}</Txt>}
              </View>
              <View style={{ marginHorizontal: 10 }}>
                <Avatar userId={r.id} name={r.name} hasAvatar={r.hasAvatar} size={40} />
              </View>
              <Txt weight={r.isMe ? '900' : '700'} style={{ flex: 1 }} numberOfLines={1}>
                {r.name}{r.isMe ? '  (you)' : ''}
              </Txt>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt weight="900" size={font.h3} style={{ color: top ? colors.primary : colors.text }}>{r.value}</Txt>
                <Txt dim size={font.tiny}>days</Txt>
              </View>
            </View>
          );
        })
      )}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
