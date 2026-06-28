// "Today" — the daily home. The app is about staying REGULAR (check in), eating
// right, and your gym COMMUNITY. One premium screen, one clear next action.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button } from '../components/UI';
import { CalorieSummary, MacroBars } from '../components/Macros';
import { AttendanceManager } from '../components/AttendanceManager';
import { StreakCard } from '../components/StreakCard';
import { WaterCard } from '../components/WaterCard';
import { TrialBanner } from '../components/TrialBanner';
import { NoticeBanner } from '../components/NoticeBanner';
import { ProfileAPI, FoodAPI, ReminderAPI, AttendanceAPI, apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { syncReminders } from '../notifications';
import { colors, font, radius, shadow, spacing } from '../theme';

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

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

  const kcalLeft = targets ? Math.max(0, Math.round(targets.calories - totals.calories)) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      {/* Premium hero */}
      <View style={[{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing(2.5), marginBottom: spacing(2), overflow: 'hidden' }, shadow]}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: colors.primary }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Txt size={font.tiny} weight="800" style={{ color: colors.primary, letterSpacing: 1 }}>{(org?.name || user?.org?.name || 'YOUR GYM').toUpperCase()}</Txt>
            <Txt size={font.small} dim weight="700" style={{ marginTop: 6 }}>{greet()},</Txt>
            <Txt size={font.h2} weight="900" numberOfLines={1}>{user?.name?.split(' ')[0]} 👋</Txt>
            <Txt dim size={font.small} style={{ marginTop: 6 }}>Show up · eat right · stay connected</Txt>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={() => navigation.navigate('Reminders')} style={{ padding: 6 }}><Txt size={20}>⏰</Txt></TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ padding: 6 }}><Txt size={20}>⚙️</Txt></TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Finish-setup nudge */}
      {!targets && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="800">Set up your plan</Txt>
          <Txt dim size={font.small} style={{ marginVertical: 8 }}>Add your goal & stats so we can build your daily diet targets.</Txt>
          <Button title="Complete setup" onPress={() => navigation.navigate('Profile')} />
        </Card>
      )}

      {/* Trial / Premium status */}
      <TrialBanner />

      <NoticeBanner />

      {/* 1) Stay regular — check in/out (the core habit) */}
      <AttendanceManager attendance={attendance} reload={load} gymName={org?.name || user?.org?.name} />

      {/* 2) Streak + calendar + leaderboard */}
      <StreakCard onLeaderboard={() => navigation.navigate('Challenges')} />

      {/* 3) Diet for today */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt dim size={font.small} weight="800" style={{ letterSpacing: 1 }}>TODAY'S DIET</Txt>
          {kcalLeft != null && <Txt size={font.small} weight="800" style={{ color: colors.primary }}>{kcalLeft} kcal left</Txt>}
        </View>
        <CalorieSummary consumed={totals.calories} target={targets?.calories} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing(1.5) }} />
        <MacroBars protein={totals.protein_g} carbs={totals.carbs_g} fat={totals.fat_g} targets={targets} />
        <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
          <Button title="＋ Log meal" onPress={() => navigation.navigate('Scan')} style={{ flex: 1 }} />
          <Button title="🥗 My plan" variant="ghost" onPress={() => navigation.navigate('Diet')} style={{ flex: 1 }} />
        </View>
      </Card>

      {/* Water */}
      <WaterCard />

      {/* Today's meals */}
      {logs.length > 0 && (
        <>
          <Txt size={font.h3} weight="700" style={{ marginTop: spacing(1), marginBottom: spacing(1) }}>Today's meals</Txt>
          {logs.map((m) => (
            <Card key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Txt weight="600">{m.name}</Txt>
                <Txt dim size={font.small}>P {Math.round(m.protein_g)}g · C {Math.round(m.carbs_g)}g · F {Math.round(m.fat_g)}g</Txt>
              </View>
              <Txt weight="700" style={{ color: colors.primary }}>{Math.round(m.calories)}</Txt>
            </Card>
          ))}
        </>
      )}

      {/* 4) Community teaser */}
      <Card onPress={() => navigation.navigate('Community')} style={{ marginTop: spacing(1) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="800">💬 {org?.name || 'Gym'} Community</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>See updates & share your wins →</Txt>
          </View>
          <Txt size={22}>›</Txt>
        </View>
      </Card>

      {/* Share & Earn */}
      <Card onPress={() => navigation.navigate('Referral')} style={{ borderColor: colors.primary }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="800">🎁 Invite friends, get Premium free</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>Share your code & earn coins →</Txt>
          </View>
          <Txt size={22}>›</Txt>
        </View>
      </Card>

      {/* Gym schedule → device calendar reminders */}
      <Card onPress={() => navigation.navigate('GymSchedule')}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="800">📅 Add your gym times to calendar</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>Get reminded before every session →</Txt>
          </View>
          <Txt size={22}>›</Txt>
        </View>
      </Card>

      {/* AI coach as an optional helper */}
      <Card onPress={() => navigation.navigate('Coach')} style={{ backgroundColor: colors.cardAlt }}>
        <Txt weight="800">✨ Ask the AI Coach</Txt>
        <Txt dim size={font.small} style={{ marginTop: 2 }}>Diet doubts, plateaus or motivation? Get instant advice →</Txt>
      </Card>

      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
