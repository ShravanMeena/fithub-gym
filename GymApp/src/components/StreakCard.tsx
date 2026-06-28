// Home card: check-in streak (rest-day protected), milestones, calendar, gym rank.
// Pure motivation, built from attendance data (no AI).
import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from './UI';
import { ContributionGrid } from './Charts';
import { AttendanceAPI, apiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

const MILESTONE_LABEL: Record<number, string> = { 7: '🔥', 14: '⚡', 30: '🏅', 50: '💎', 100: '👑', 200: '🦾', 365: '🐐' };

type Stats = {
  streak: number; longest: number; days: string[]; restDays: string[];
  restToday: boolean; restRemaining: number; checkedInToday: boolean;
  milestones: number[]; nextMilestone: number | null;
  monthVisits: number; rank: number | null; rankedMembers: number;
};

export function StreakCard({ onLeaderboard }: { onLeaderboard?: () => void }) {
  const [s, setS] = useState<Stats | null>(null);
  const load = useCallback(() => { AttendanceAPI.stats().then(setS).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const takeRest = async () => {
    try { await AttendanceAPI.rest(); load(); }
    catch (e) { Alert.alert('Rest day', apiError(e)); }
  };

  if (!s) return null;
  // Defensive defaults so an older backend (missing new fields) never crashes.
  const days = s.days || [];
  const restDays = s.restDays || [];
  const milestones = s.milestones || [];
  const longest = s.longest || 0;
  const restRemaining = s.restRemaining ?? 0;
  const hasData = days.length > 0 || restDays.length > 0;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(1.5) }}>
        <View>
          <Txt size={font.small} dim weight="800" style={{ letterSpacing: 1 }}>STREAK</Txt>
          <Txt size={font.h1} weight="900" style={{ color: colors.primary }}>
            {s.streak > 0 ? `🔥 ${s.streak}` : '0'}
            <Txt size={font.body} weight="700" dim>  day{s.streak === 1 ? '' : 's'}</Txt>
          </Txt>
          {longest > 0 && <Txt dim size={font.tiny}>Longest: {longest} days</Txt>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt size={font.h2} weight="900">{s.monthVisits}</Txt>
          <Txt size={font.tiny} dim>this month</Txt>
          {s.rank != null && (
            <View style={{ backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 }}>
              <Txt size={font.tiny} weight="800" style={{ color: colors.accent }}>🏆 #{s.rank}{s.rankedMembers ? `/${s.rankedMembers}` : ''}</Txt>
            </View>
          )}
        </View>
      </View>

      {/* Milestone badges */}
      {milestones.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1.5) }}>
          {milestones.map((m) => (
            <View key={m} style={{ backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
              <Txt size={font.small}>{MILESTONE_LABEL[m] || '🏅'} </Txt>
              <Txt size={font.tiny} weight="800">{m}-day</Txt>
            </View>
          ))}
        </View>
      )}

      {hasData ? (
        <ContributionGrid days={days} />
      ) : (
        <Txt dim size={font.small}>Check in at the gym to start your streak 💪</Txt>
      )}

      {s.nextMilestone && s.streak > 0 && (
        <Txt dim size={font.tiny} style={{ marginTop: 8 }}>{s.nextMilestone - s.streak} more day{s.nextMilestone - s.streak === 1 ? '' : 's'} to your {MILESTONE_LABEL[s.nextMilestone] || ''} {s.nextMilestone}-day badge</Txt>
      )}

      {/* Rest-day freeze + leaderboard */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1.5) }}>
        {!s.checkedInToday ? (
          <TouchableOpacity onPress={takeRest}>
            <Txt size={font.small} weight="700" style={{ color: s.restToday ? colors.accent : colors.textDim }}>
              {s.restToday ? '❄️ Resting today (streak safe)' : `❄️ Take a rest day (${restRemaining} left)`}
            </Txt>
          </TouchableOpacity>
        ) : <View />}
        {onLeaderboard && (
          <TouchableOpacity onPress={onLeaderboard}>
            <Txt size={font.small} weight="800" style={{ color: colors.primary }}>🏆 Leaderboard →</Txt>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}
