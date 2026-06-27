// Home-screen card: workout streak, check-in calendar, and monthly gym rank.
// Pure motivation, built entirely from attendance data (no AI).
import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from './UI';
import { ContributionGrid } from './Charts';
import { AttendanceAPI } from '../api/client';
import { colors, font, spacing } from '../theme';

type Stats = { streak: number; days: string[]; monthVisits: number; rank: number | null; rankedMembers: number };

export function StreakCard({ onLeaderboard }: { onLeaderboard?: () => void }) {
  const [s, setS] = useState<Stats | null>(null);

  useFocusEffect(
    useCallback(() => {
      AttendanceAPI.stats().then(setS).catch(() => {});
    }, []),
  );

  if (!s) return null;
  const hasData = s.days.length > 0;

  return (
    <Card style={{ marginBottom: spacing(2) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(1.5) }}>
        <View>
          <Txt size={font.small} dim weight="700">CONSISTENCY</Txt>
          <Txt size={font.h1} weight="900" style={{ color: colors.primary }}>
            {s.streak > 0 ? `🔥 ${s.streak}` : '0'}
            <Txt size={font.body} weight="700" dim>  day{s.streak === 1 ? '' : 's'} streak</Txt>
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt size={font.h2} weight="900">{s.monthVisits}</Txt>
          <Txt size={font.tiny} dim>visits this month</Txt>
          {s.rank != null && (
            <View style={{ backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 }}>
              <Txt size={font.tiny} weight="800" style={{ color: colors.accent }}>
                🏆 #{s.rank}{s.rankedMembers ? ` of ${s.rankedMembers}` : ''}
              </Txt>
            </View>
          )}
        </View>
      </View>

      {hasData ? (
        <ContributionGrid days={s.days} />
      ) : (
        <Txt dim size={font.small}>Check in at the gym to start your streak 💪</Txt>
      )}

      {onLeaderboard && (
        <TouchableOpacity onPress={onLeaderboard} style={{ marginTop: spacing(1.5), alignItems: 'flex-end' }}>
          <Txt size={font.small} weight="700" style={{ color: colors.primary }}>🏆 View gym leaderboard →</Txt>
        </TouchableOpacity>
      )}
    </Card>
  );
}
