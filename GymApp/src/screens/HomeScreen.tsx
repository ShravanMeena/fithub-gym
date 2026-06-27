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
import { colors, font, spacing } from '../theme';

export default function HomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
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
      // refresh gym branding (picks up admin name/colour changes) + sync reminders
      refreshOrg(org?.slug || user?.org?.slug).catch(() => {});
      syncReminders(r.reminders).catch(() => {});
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) }}>
        <View>
          <Txt size={font.small} weight="700" style={{ color: colors.primary }}>{(org?.name || user?.org?.name || 'Gym').toUpperCase()}</Txt>
          <Txt size={font.h2} weight="800">Hey {user?.name} 💪</Txt>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => navigation.navigate('Reminders')} style={{ padding: 8 }}>
            <Txt size={20}>⏰</Txt>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ padding: 8 }}>
            <Txt size={20}>⚙️</Txt>
          </TouchableOpacity>
        </View>
      </View>

      {/* Admin notices — highlighted, dismissible */}
      <NoticeBanner />

      {/* Attendance — check-in/out, app-open prompt, checkout reminder */}
      <AttendanceManager attendance={attendance} reload={load} gymName={org?.name || user?.org?.name} />

      {/* Streak, check-in calendar, monthly gym rank */}
      <StreakCard onLeaderboard={() => navigation.navigate('Challenges')} />

      <Card>
        <Txt dim size={font.small} weight="700" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Today</Txt>
        <CalorieSummary consumed={totals.calories} target={targets?.calories} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing(1.5) }} />
        <MacroBars protein={totals.protein_g} carbs={totals.carbs_g} fat={totals.fat_g} targets={targets} />
      </Card>

      {!targets && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="700">Finish your profile</Txt>
          <Txt dim size={font.small} style={{ marginVertical: 8 }}>
            Add your age, height, weight and goal so we can calculate your targets and build your diet.
          </Txt>
          <Button title="Complete Profile" onPress={() => navigation.navigate('Profile')} />
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
        <Button title="📷 Scan Food" onPress={() => navigation.navigate('Scan')} style={{ flex: 1 }} />
        <Button title="🥗 My Diet" variant="ghost" onPress={() => navigation.navigate('Diet')} style={{ flex: 1 }} />
      </View>
      <Button title="🏋️ Log Workout" variant="ghost" onPress={() => navigation.navigate('Workout')} style={{ marginTop: spacing(1.5) }} />

      <Txt size={font.h3} weight="700" style={{ marginTop: spacing(3), marginBottom: spacing(1) }}>Today's meals</Txt>
      {logs.length === 0 ? (
        <Card><Txt dim>No meals logged yet. Tap “Scan Food” to add one.</Txt></Card>
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

      <Button title="Log out" variant="ghost" onPress={logout} style={{ marginTop: spacing(3) }} />
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
