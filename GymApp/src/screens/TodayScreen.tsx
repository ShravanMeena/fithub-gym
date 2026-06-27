// "Today" — the daily home. One screen that answers: am I at the gym, what's my
// workout, what should I eat, am I progressing? Everything points to one next action.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button } from '../components/UI';
import { CalorieSummary, MacroBars } from '../components/Macros';
import { AttendanceManager } from '../components/AttendanceManager';
import { StreakCard } from '../components/StreakCard';
import { NoticeBanner } from '../components/NoticeBanner';
import { ProfileAPI, FoodAPI, ReminderAPI, AttendanceAPI, apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { syncReminders } from '../notifications';
import { TEMPLATES } from '../data/templates';
import { colors, font, radius, spacing } from '../theme';

// Suggested routine by weekday (a simple PPL-ish split). Sunday = rest.
const WEEK_PLAN = ['Rest', 'Push Day', 'Pull Day', 'Leg Day', 'Upper Body', 'Push Day', 'Full Body'];

export default function TodayScreen({ navigation }: any) {
  const { user } = useAuth();
  const { org, refreshOrg } = useOrg();
  const [targets, setTargets] = useState<any>(null);
  const [totals, setTotals] = useState<any>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t, r, a] = await Promise.all([ProfileAPI.get(), FoodAPI.today(), ReminderAPI.list(), AttendanceAPI.status()]);
      setTargets(p.targets);
      setTotals(t.totals);
      setLogs(t.logs);
      setAttendance(a);
      refreshOrg(org?.slug || user?.org?.slug).catch(() => {});
      syncReminders(r.reminders).catch(() => {});
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const todayName = WEEK_PLAN[new Date().getDay()];
  const isRest = todayName === 'Rest';
  const template = TEMPLATES.find((t) => t.name === todayName);
  const kcalLeft = targets ? Math.max(0, Math.round(targets.calories - totals.calories)) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) }}>
        <View style={{ flex: 1 }}>
          <Txt size={font.small} weight="700" style={{ color: colors.primary }}>{(org?.name || user?.org?.name || 'Gym').toUpperCase()}</Txt>
          <Txt size={font.h2} weight="800">Hi {user?.name?.split(' ')[0]} 👋</Txt>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => navigation.navigate('Reminders')} style={{ padding: 8 }}><Txt size={20}>⏰</Txt></TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ padding: 8 }}><Txt size={20}>⚙️</Txt></TouchableOpacity>
        </View>
      </View>

      {/* Finish-profile nudge (only if targets not set) */}
      {!targets && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="800">Set up your plan</Txt>
          <Txt dim size={font.small} style={{ marginVertical: 8 }}>Add your goal & stats so we can build your daily targets and workout plan.</Txt>
          <Button title="Complete setup" onPress={() => navigation.navigate('Profile')} />
        </Card>
      )}

      <NoticeBanner />

      {/* 1) Am I at the gym? */}
      <AttendanceManager attendance={attendance} reload={load} gymName={org?.name || user?.org?.name} />

      {/* 2) Today's workout */}
      <Card style={{ borderColor: isRest ? colors.border : colors.primary }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt dim size={font.small} weight="700">TODAY'S WORKOUT</Txt>
            <Txt size={font.h3} weight="800" style={{ marginTop: 2 }}>{isRest ? '🧘 Rest & recover' : `🏋️ ${todayName}`}</Txt>
            {template && <Txt dim size={font.small} style={{ marginTop: 2 }}>{template.focus}</Txt>}
          </View>
        </View>
        {!isRest && (
          <Button title="Start workout →" onPress={() => navigation.navigate('Train')} style={{ marginTop: spacing(1.5) }} />
        )}
      </Card>

      {/* 3) Nutrition */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt dim size={font.small} weight="700">TODAY'S NUTRITION</Txt>
          {kcalLeft != null && <Txt size={font.small} weight="800" style={{ color: colors.primary }}>{kcalLeft} kcal left</Txt>}
        </View>
        <CalorieSummary consumed={totals.calories} target={targets?.calories} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing(1.5) }} />
        <MacroBars protein={totals.protein_g} carbs={totals.carbs_g} fat={totals.fat_g} targets={targets} />
        <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
          <Button title="📷 Log meal" onPress={() => navigation.navigate('Scan')} style={{ flex: 1 }} />
          <Button title="🥗 My plan" variant="ghost" onPress={() => navigation.navigate('Eat')} style={{ flex: 1 }} />
        </View>
      </Card>

      {/* 4) Progress / streak / leaderboard */}
      <StreakCard onLeaderboard={() => navigation.navigate('Challenges')} />

      {/* Today's meals list */}
      <Txt size={font.h3} weight="700" style={{ marginTop: spacing(1), marginBottom: spacing(1) }}>Today's meals</Txt>
      {logs.length === 0 ? (
        <Card><Txt dim>No meals logged yet. Tap “Log meal” above to add one.</Txt></Card>
      ) : (
        logs.map((m) => (
          <Card key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Txt weight="600">{m.name}</Txt>
              <Txt dim size={font.small}>P {Math.round(m.protein_g)}g · C {Math.round(m.carbs_g)}g · F {Math.round(m.fat_g)}g</Txt>
            </View>
            <Txt weight="700" style={{ color: colors.primary }}>{Math.round(m.calories)}</Txt>
          </Card>
        ))
      )}

      {/* AI coach as an optional helper */}
      <Card onPress={() => navigation.navigate('Coach')} style={{ backgroundColor: colors.cardAlt, marginTop: spacing(1) }}>
        <Txt weight="800">✨ Ask the AI Coach</Txt>
        <Txt dim size={font.small} style={{ marginTop: 2 }}>Stuck on form, plateaus or motivation? Get instant advice →</Txt>
      </Card>

      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
