// Gym leaderboard — clean, modern ranking with profile photos.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { ChallengeAPI, MeAPI, AttendanceAPI } from '../api/client';
import { useOrg } from '../context/OrgContext';
import { colors, font, radius, shadow, spacing } from '../theme';

const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null);

export default function ChallengesScreen() {
  const { org } = useOrg();
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  const [data, setData] = useState<any>(null);
  const [challenge, setChallenge] = useState<any>(null);
  const [crew, setCrew] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p = period) => {
    try { setData(await ChallengeAPI.leaderboard(p)); } catch {}
    MeAPI.challenge().then(setChallenge).catch(() => {});
    AttendanceAPI.crew().then((d) => setCrew(d.crew || [])).catch(() => {});
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const board = data?.leaderboard || [];

  const cheer = async (u: any) => {
    setCrew((prev) => prev.map((c) => (c.id === u.id ? { ...c, cheers: Number(c.cheers) + 1, i_cheered: true } : c)));
    try { await AttendanceAPI.cheer(u.id); } catch {}
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>

      <Txt size={font.h2} weight="900">🏆 Leaderboard</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Most gym check-ins at {org?.name || 'your gym'} — keep showing up to climb.</Txt>

      {/* Monthly challenge */}
      {challenge && (
        <Card style={{ borderColor: colors.primary, backgroundColor: colors.primary + '10' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt weight="800">🎯 {challenge.title}</Txt>
            <Txt size={font.small} weight="800" style={{ color: challenge.done ? colors.accent : colors.primary }}>{challenge.done ? '✅ Done!' : `${challenge.mine}/${challenge.goal}`}</Txt>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.cardAlt, marginTop: spacing(1), overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.round((challenge.mine / challenge.goal) * 100))}%`, height: '100%', backgroundColor: challenge.done ? colors.accent : colors.primary }} />
          </View>
          <Txt dim size={font.tiny} style={{ marginTop: 6 }}>{challenge.done ? 'You crushed this month’s challenge!' : `${challenge.goal - challenge.mine} more check-ins this month`} · {challenge.finishers} member{challenge.finishers === 1 ? '' : 's'} finished</Txt>
        </Card>
      )}

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

      {/* Top-3 podium */}
      {board.length >= 3 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: spacing(2) }}>
          {[board[1], board[0], board[2]].map((r: any, i: number) => {
            const isFirst = i === 1;
            const h = isFirst ? 92 : 70;
            return (
              <View key={r.id ?? r.rank} style={{ alignItems: 'center', flex: 1, marginHorizontal: 4 }}>
                <Txt size={isFirst ? 26 : 20}>{medal(r.rank)}</Txt>
                <View style={{ marginVertical: 4 }}>
                  <Avatar userId={r.id} name={r.name} hasAvatar={r.hasAvatar} size={isFirst ? 58 : 46} />
                </View>
                <Txt weight="800" size={font.small} numberOfLines={1} style={{ maxWidth: '100%' }}>{r.name?.split(' ')[0]}</Txt>
                <View style={{ width: '100%', height: h, backgroundColor: isFirst ? colors.primary : colors.card, borderWidth: 1, borderColor: isFirst ? colors.primary : colors.border, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, marginTop: 4, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 }}>
                  <Txt weight="900" size={font.h3} style={{ color: isFirst ? '#fff' : colors.primary }}>{r.value}</Txt>
                  <Txt size={font.tiny} style={{ color: isFirst ? '#fff' : colors.textDim }}>days</Txt>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {board.length === 0 ? (
        <Card><Txt dim>No check-ins yet this {period}. Be the first on the board! 💪</Txt></Card>
      ) : (
        (board.length >= 3 ? board.slice(3) : board).map((r: any) => {
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

      {/* Today's crew — cheer whoever showed up today */}
      {crew.length > 0 && (
        <>
          <Txt size={font.h3} weight="800" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>🔥 In the gym today</Txt>
          {crew.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing(1.25), marginBottom: 8 }}>
              <Avatar userId={c.id} name={c.name} hasAvatar={c.has_avatar} size={38} />
              <Txt weight="700" style={{ flex: 1, marginLeft: 10 }} numberOfLines={1}>{c.name}{c.me ? '  (you)' : ''}</Txt>
              {Number(c.cheers) > 0 ? <Txt size={font.small} weight="800" style={{ color: colors.accent, marginRight: 10 }}>👏 {c.cheers}</Txt> : null}
              {!c.me && (
                <TouchableOpacity onPress={() => cheer(c)} disabled={c.i_cheered}
                  style={{ backgroundColor: c.i_cheered ? colors.cardAlt : colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill }}>
                  <Txt weight="800" size={font.small} style={{ color: c.i_cheered ? colors.textDim : '#fff' }}>{c.i_cheered ? 'Cheered' : '👏 Cheer'}</Txt>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </>
      )}

      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
