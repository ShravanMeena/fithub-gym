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
  const [attendance, setAttendance] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t, r, a] = await Promise.all([ProfileAPI.get(), FoodAPI.today(), ReminderAPI.list(), AttendanceAPI.status()]);
      setTargets(p.targets);
      setTotals(t.totals);
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

      {/* Finish-setup nudge — clear about what the "plan" is */}
      {!targets && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="800">🥗 Get your personalised diet plan</Txt>
          <Txt dim size={font.small} style={{ marginVertical: 8 }}>Tell us your goal & body stats — we'll set your daily calories, protein target and a meal plan built just for you.</Txt>
          <Button title="Set up my plan" onPress={() => navigation.navigate('Profile')} />
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
        <Txt dim size={font.tiny} style={{ marginTop: 2 }}>Add everything you eat to hit your daily goal.</Txt>
        <View style={{ marginTop: spacing(1) }}><CalorieSummary consumed={totals.calories} target={targets?.calories} /></View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing(1.5) }} />
        <MacroBars protein={totals.protein_g} carbs={totals.carbs_g} fat={totals.fat_g} targets={targets} />
        <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
          <Button title="📷 Add food" onPress={() => navigation.navigate('Scan')} style={{ flex: 1 }} />
          <Button title="🥗 My diet plan" variant="ghost" onPress={() => navigation.navigate('Diet')} style={{ flex: 1 }} />
        </View>
      </Card>

      {/* Water */}
      <WaterCard />

      {/* 4) Leaderboard — highlighted (competition = motivation) */}
      <Card onPress={() => navigation.navigate('Challenges')} style={{ borderColor: colors.primary, backgroundColor: colors.primary + '10' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="800">🏆 {org?.name || 'Gym'} Leaderboard</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>See where you rank this month — keep showing up to climb →</Txt>
          </View>
          <Txt size={22}>›</Txt>
        </View>
      </Card>

      {/* Compact tiles for everything else (declutter) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing(1) }}>
        <Tile emoji="💬" label="Community" onPress={() => navigation.navigate('Community')} />
        <Tile emoji="✉️" label="Messages" onPress={() => navigation.navigate('Messages')} />
        <Tile emoji="🎁" label="Invite & earn" onPress={() => navigation.navigate('Referral')} />
        <Tile emoji="⏰" label="Gym timing" onPress={() => navigation.navigate('GymSchedule')} />
        <Tile emoji="✨" label="AI Coach" onPress={() => navigation.navigate('Coach')} />
      </View>

      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}

function Tile({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ width: '48.5%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing(1.75), alignItems: 'center', marginBottom: spacing(1) }}>
      <Txt size={24}>{emoji}</Txt>
      <Txt weight="700" size={font.small} style={{ marginTop: 4 }}>{label}</Txt>
    </TouchableOpacity>
  );
}
