// Home card: check-in streak (rest-day protected), milestones, a full-width
// scrollable date calendar, and gym rank. Pure motivation from attendance data.
import React, { useCallback, useRef, useState } from 'react';
import { View, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from './UI';
import { AttendanceAPI, apiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

const MILESTONE_LABEL: Record<number, string> = { 7: '🔥', 14: '⚡', 30: '🏅', 50: '💎', 100: '👑', 200: '🦾', 365: '🐐' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS_SHOWN = 35;

type Stats = {
  streak: number; longest: number; days: string[]; restDays: string[];
  restToday: boolean; restRemaining: number; checkedInToday: boolean;
  milestones: number[]; nextMilestone: number | null;
  monthVisits: number; rank: number | null; rankedMembers: number;
};

// Horizontal strip of the last DAYS_SHOWN days with real dates. Check-ins filled,
// rest days frozen, today ringed — auto-scrolled to today.
function StreakCalendar({ days, restDays }: { days: string[]; restDays: string[] }) {
  const ref = useRef<ScrollView>(null);
  const daySet = new Set(days);
  const restSet = new Set(restDays);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIso = isoLocal(today);

  const cells = [];
  for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const iso = isoLocal(d);
    const checked = daySet.has(iso);
    const rest = restSet.has(iso);
    const isToday = iso === todayIso;
    const firstOfMonth = d.getDate() === 1 || i === DAYS_SHOWN - 1;

    const bg = checked ? colors.primary : rest ? colors.accent + '26' : colors.cardAlt;
    const numColor = checked ? '#fff' : rest ? colors.accent : colors.text;

    cells.push(
      <View key={iso} style={{ alignItems: 'center', width: 40 }}>
        <Txt size={9} weight="800" style={{ color: colors.textDim, height: 12 }}>{firstOfMonth ? MONTHS[d.getMonth()] : ''}</Txt>
        <Txt size={font.tiny} style={{ color: isToday ? colors.primary : colors.textDim, marginBottom: 4 }} weight={isToday ? '800' : '400'}>{DOW[d.getDay()]}</Txt>
        <View style={{
          width: 34, height: 40, borderRadius: 10, backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: isToday ? 2 : checked ? 0 : 1,
          borderColor: isToday ? colors.primary : colors.border,
        }}>
          <Txt size={font.small} weight="800" style={{ color: numColor }}>{d.getDate()}</Txt>
          {rest ? <Txt size={8}>❄️</Txt> : null}
        </View>
      </View>,
    );
  }

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{ paddingVertical: 2 }}>
      {cells}
    </ScrollView>
  );
}

export function StreakCard({ onLeaderboard }: { onLeaderboard?: () => void }) {
  const [s, setS] = useState<Stats | null>(null);
  const load = useCallback(() => { AttendanceAPI.stats().then(setS).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const takeRest = async () => {
    try { await AttendanceAPI.rest(); load(); }
    catch (e) { Alert.alert('Rest day', apiError(e)); }
  };

  if (!s) return null;
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
        <StreakCalendar days={days} restDays={restDays} />
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
