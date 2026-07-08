// Home — the daily driver. Leads with the #1 habit (check in), then today's
// calories, then one nudge. Everything else lives under the Me tab.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button } from '../components/UI';
import { CalorieSummary, MacroBars } from '../components/Macros';
import { AttendanceManager } from '../components/AttendanceManager';
import { StreakCard } from '../components/StreakCard';
import { NoticeBanner } from '../components/NoticeBanner';
import { ProfileAPI, FoodAPI, ReminderAPI, AttendanceAPI, DietAPI, apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { syncReminders } from '../notifications';
import { colors, font, radius, shadow, spacing } from '../theme';

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function TodayScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { org, refreshOrg } = useOrg();
  const [targets, setTargets] = useState<any>(null);
  const [totals, setTotals] = useState<any>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [attendance, setAttendance] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t, r, a, d] = await Promise.all([ProfileAPI.get(), FoodAPI.today(), ReminderAPI.list(), AttendanceAPI.status(), DietAPI.current().catch(() => null)]);
      setTargets(p.targets);
      setTotals(t.totals);
      setAttendance(a);
      const pl = d?.plan; setPlan(Array.isArray(pl?.plans) ? pl.plans[0] : pl || null);
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
      contentContainerStyle={{ padding: spacing(2), paddingTop: insets.top + spacing(1) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      {/* Greeting */}
      <View style={[{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing(2.5), marginBottom: spacing(2), overflow: 'hidden' }, shadow]}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: colors.primary }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Txt size={font.tiny} weight="800" style={{ color: colors.primary, letterSpacing: 1 }}>{(org?.name || user?.org?.name || 'YOUR GYM').toUpperCase()}</Txt>
            <Txt size={font.small} dim weight="700" style={{ marginTop: 6 }}>{greet()},</Txt>
            <Txt size={font.h2} weight="900" numberOfLines={1}>{user?.name?.split(' ')[0]} 👋</Txt>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Me')} style={{ padding: 6 }}><Txt size={22}>⚙️</Txt></TouchableOpacity>
        </View>
      </View>

      <NoticeBanner />

      {/* Finish-setup nudge — only until targets are set */}
      {!targets && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="800">🥗 Get your personalised plan</Txt>
          <Txt dim size={font.small} style={{ marginVertical: 8 }}>Tell us your goal & body stats — we'll set your daily calories, protein target and a meal plan built just for you.</Txt>
          <Button title="Set up my plan" onPress={() => navigation.navigate('Profile')} />
        </Card>
      )}

      {/* 1) The #1 habit — check in */}
      <AttendanceManager attendance={attendance} reload={load} gymName={org?.name || user?.org?.name} />

      {/* Streak */}
      <StreakCard onLeaderboard={() => navigation.navigate('Challenges')} />

      {/* 2) Today's calories */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt dim size={font.small} weight="800" style={{ letterSpacing: 1 }}>TODAY'S CALORIES</Txt>
          {kcalLeft != null && <Txt size={font.small} weight="800" style={{ color: colors.primary }}>{kcalLeft} kcal left</Txt>}
        </View>
        <View style={{ marginTop: spacing(1) }}><CalorieSummary consumed={totals.calories} target={targets?.calories} /></View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing(1.5) }} />
        <MacroBars protein={totals.protein_g} carbs={totals.carbs_g} fat={totals.fat_g} targets={targets} />

        {/* Meal plan — surfaced from Diet */}
        <TouchableOpacity onPress={() => navigation.navigate('Diet')} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: spacing(1.25), marginTop: spacing(1.5) }}>
          <Txt size={20} style={{ marginRight: 10 }}>🥗</Txt>
          <View style={{ flex: 1 }}>
            {plan ? (
              <>
                <Txt weight="700" size={font.small} numberOfLines={1}>{plan.title || 'Your meal plan'}</Txt>
                <Txt dim size={font.tiny}>{(plan.meals || []).length} meals · what to eat today</Txt>
              </>
            ) : (
              <>
                <Txt weight="700" size={font.small}>Get your meal plan</Txt>
                <Txt dim size={font.tiny}>Know exactly what to eat for your goal</Txt>
              </>
            )}
          </View>
          <Txt size={18} dim>›</Txt>
        </TouchableOpacity>

        <Button title="📷 Log food" onPress={() => navigation.navigate('Scan')} style={{ marginTop: spacing(1.5) }} />
      </Card>

      {/* 3) One nudge — leaderboard */}
      <Card onPress={() => navigation.navigate('Challenges')} style={{ borderColor: colors.primary, backgroundColor: colors.primary + '10' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="800">🏆 {org?.name || 'Gym'} Leaderboard</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>See where you rank — keep showing up to climb →</Txt>
          </View>
          <Txt size={22}>›</Txt>
        </View>
      </Card>

      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
