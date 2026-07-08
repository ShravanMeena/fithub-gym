// "Me" tab — the single home for everything that isn't part of the daily loop.
// Replaces the old hamburger sidebar: profile, progress, premium, and grouped
// links to every secondary screen (all kept, just tucked out of the main flow).
import React, { useEffect, useState } from 'react';
import { ScrollView, View, TouchableOpacity, Linking } from 'react-native';
import { Card, Txt } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { TrialBanner } from '../components/TrialBanner';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { AppAPI } from '../api/client';
import { APP_VERSION } from '../api/config';
import { colors, font, radius, spacing } from '../theme';

type Item = { label: string; icon: IconName; screen: string };

const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Premium', items: [
    { label: 'AI Coach', icon: 'coach', screen: 'Coach' },
  ] },
  { title: 'Training', items: [
    { label: 'Log a workout', icon: 'workout', screen: 'Workout' },
    { label: 'Personal records', icon: 'workout', screen: 'PRs' },
    { label: 'Badges', icon: 'attendance', screen: 'Badges' },
    { label: 'Attendance history', icon: 'attendance', screen: 'Attendance' },
  ] },
  { title: 'Community', items: [
    { label: 'Messages', icon: 'feed', screen: 'Messages' },
    { label: 'Leaderboard', icon: 'attendance', screen: 'Challenges' },
  ] },
  { title: 'Nutrition', items: [
    { label: 'Food diary', icon: 'diet', screen: 'FoodDiary' },
  ] },
  { title: 'Gym & reminders', items: [
    { label: 'Gym timing', icon: 'reminders', screen: 'GymSchedule' },
    { label: 'Reminders', icon: 'reminders', screen: 'Reminders' },
  ] },
  { title: 'Account', items: [
    { label: 'Invite & earn', icon: 'profile', screen: 'Referral' },
    { label: 'Profile & goals', icon: 'profile', screen: 'Profile' },
  ] },
];

export default function MeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { org, clearOrg } = useOrg();
  const [upd, setUpd] = useState<{ force?: boolean; download_url?: string } | null>(null);
  useEffect(() => { AppAPI.checkUpdate().then((d) => { if (d?.update) setUpd(d); }).catch(() => {}); }, []);

  const go = (screen: string) => navigation.navigate(screen);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(5) }}>
      {/* Profile header */}
      <TouchableOpacity onPress={() => go('Profile')} activeOpacity={0.8}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar userId={(user as any)?.id} name={user?.name} hasAvatar size={56} />
          <View style={{ marginLeft: spacing(1.5), flex: 1 }}>
            <Txt size={font.h3} weight="800" numberOfLines={1}>{user?.name}</Txt>
            <Txt dim size={font.small} numberOfLines={1}>{org?.name || 'Gym'}{user?.role === 'admin' ? ' · admin' : ''}</Txt>
          </View>
          <Txt size={22} dim>›</Txt>
        </Card>
      </TouchableOpacity>

      {/* Progress — kept prominent */}
      <TouchableOpacity onPress={() => go('Progress')} activeOpacity={0.85}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', borderColor: colors.primary }}>
          <Txt size={26} style={{ marginRight: spacing(1.5) }}>📈</Txt>
          <View style={{ flex: 1 }}>
            <Txt weight="800">Your progress</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>Weight, photos & your transformation</Txt>
          </View>
          <Txt size={22} dim>›</Txt>
        </Card>
      </TouchableOpacity>

      <TrialBanner />

      {GROUPS.map((g) => (
        <View key={g.title} style={{ marginTop: spacing(2) }}>
          <Txt dim size={font.tiny} weight="800" style={{ letterSpacing: 1, marginBottom: spacing(0.5), marginLeft: 4 }}>{g.title.toUpperCase()}</Txt>
          <Card style={{ padding: 0 }}>
            {g.items.map((it, i) => (
              <TouchableOpacity key={it.screen} onPress={() => go(it.screen)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: spacing(2), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ width: 32 }}><Icon name={it.icon} color={colors.textDim} size={20} /></View>
                <Txt size={font.body} weight="600" style={{ flex: 1 }}>{it.label}</Txt>
                <Txt size={18} dim>›</Txt>
              </TouchableOpacity>
            ))}
          </Card>
        </View>
      ))}

      {user?.role === 'admin' ? (
        <Card style={{ marginTop: spacing(2), backgroundColor: colors.cardAlt }}>
          <Txt weight="700" style={{ color: org?.primary_color || colors.primary }}>You're an admin 👑</Txt>
          <Txt dim size={font.tiny} style={{ marginTop: 4 }}>Manage members & attendance on the web dashboard.</Txt>
        </Card>
      ) : null}

      {/* Change gym / log out */}
      <View style={{ marginTop: spacing(2) }}>
        <Card style={{ padding: 0 }}>
          <TouchableOpacity onPress={() => clearOrg()} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: spacing(2) }}>
            <View style={{ width: 32 }}><Icon name="changegym" color={colors.textDim} size={20} /></View>
            <Txt size={font.body}>Change gym</Txt>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: spacing(2), borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ width: 32 }}><Icon name="logout" color={colors.danger} size={20} /></View>
            <Txt size={font.body} style={{ color: colors.danger }}>Log out</Txt>
          </TouchableOpacity>
        </Card>
      </View>

      {/* Version + update */}
      <View style={{ alignItems: 'center', marginTop: spacing(2) }}>
        {upd ? (
          <TouchableOpacity onPress={() => upd.download_url && Linking.openURL(upd.download_url).catch(() => {})} style={{ marginBottom: 6 }}>
            <Txt size={font.tiny} weight="800" style={{ color: upd.force ? colors.danger : colors.primary }}>
              {upd.force ? '⛔ Update required' : '🔔 Update available'} · tap to update
            </Txt>
          </TouchableOpacity>
        ) : null}
        <Txt size={font.tiny} dim>FitHub v{APP_VERSION}</Txt>
      </View>
    </ScrollView>
  );
}
