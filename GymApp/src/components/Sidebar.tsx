import React, { useEffect, useRef } from 'react';
import { Animated, View, TouchableOpacity, TouchableWithoutFeedback, ScrollView, Dimensions, Platform } from 'react-native';
import { Txt } from './UI';
import { Avatar } from './Avatar';
import { Icon, IconName } from './Icon';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { navTo } from '../navigation/ref';
import { colors, font, spacing } from '../theme';

const W = Math.min(300, Dimensions.get('window').width * 0.82);

const ITEMS: { label: string; icon: IconName; screen: string }[] = [
  { label: 'Share & Earn 🎁', icon: 'profile', screen: 'Referral' },
  { label: 'AI Coach ✨', icon: 'coach', screen: 'Coach' },
  { label: 'Leaderboard', icon: 'attendance', screen: 'Challenges' },
  { label: 'Attendance history', icon: 'attendance', screen: 'Attendance' },
  { label: 'Reminders', icon: 'reminders', screen: 'Reminders' },
  { label: 'Log a workout', icon: 'workout', screen: 'Workout' },
  { label: 'Profile & Goals', icon: 'profile', screen: 'Profile' },
];

export function Sidebar() {
  const { sidebarOpen, closeSidebar } = useUI();
  const { user, logout } = useAuth();
  const { org, clearOrg } = useOrg();
  const tx = useRef(new Animated.Value(-W)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, { toValue: sidebarOpen ? 0 : -W, duration: 220, useNativeDriver: true }),
      Animated.timing(fade, { toValue: sidebarOpen ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [sidebarOpen, tx, fade]);

  if (!user) return null;

  const go = (screen: string) => { closeSidebar(); setTimeout(() => navTo(screen), 180); };
  const brand = org?.primary_color || colors.primary;

  return (
    <View pointerEvents={sidebarOpen ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
      <TouchableWithoutFeedback onPress={closeSidebar}>
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#000', opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }} />
      </TouchableWithoutFeedback>

      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: W, backgroundColor: colors.card, transform: [{ translateX: tx }], paddingTop: Platform.OS === 'ios' ? 58 : 28, borderRightWidth: 1, borderRightColor: colors.border }}>
        {/* Profile header */}
        <TouchableOpacity onPress={() => go('Profile')} style={{ paddingHorizontal: spacing(2), paddingBottom: spacing(2), borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
          <Avatar userId={(user as any).id} name={user.name} hasAvatar size={52} />
          <View style={{ marginLeft: spacing(1.5), flex: 1 }}>
            <Txt size={font.h3} weight="800" numberOfLines={1}>{user.name}</Txt>
            <Txt dim size={font.small} numberOfLines={1}>{org?.name || 'Gym'}{user.role === 'admin' ? ' · admin' : ''}</Txt>
          </View>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }}>
          {ITEMS.map((it) => (
            <TouchableOpacity key={it.screen} onPress={() => go(it.screen)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: spacing(2) }}>
              <View style={{ width: 34 }}><Icon name={it.icon} color={colors.textDim} size={21} /></View>
              <Txt size={font.body} weight="600">{it.label}</Txt>
            </TouchableOpacity>
          ))}

          {user.role === 'admin' ? (
            <View style={{ margin: spacing(2), padding: spacing(1.5), backgroundColor: colors.cardAlt, borderRadius: 12 }}>
              <Txt size={font.small} weight="700" style={{ color: brand }}>You're an admin 👑</Txt>
              <Txt dim size={font.tiny} style={{ marginTop: 4 }}>Manage members & attendance on the web dashboard.</Txt>
            </View>
          ) : null}
        </ScrollView>

        {/* Footer */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing(1) }}>
          <TouchableOpacity onPress={() => { closeSidebar(); clearOrg(); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: spacing(2) }}>
            <View style={{ width: 34 }}><Icon name="changegym" color={colors.textDim} size={21} /></View>
            <Txt size={font.body}>Change gym</Txt>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { closeSidebar(); logout(); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: spacing(2) }}>
            <View style={{ width: 34 }}><Icon name="logout" color={colors.danger} size={21} /></View>
            <Txt size={font.body} style={{ color: colors.danger }}>Log out</Txt>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
