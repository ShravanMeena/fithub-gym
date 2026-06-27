import React from 'react';
import { Image } from 'react-native';
import { colors } from '../theme';

// Static requires (Metro needs literal paths).
const ICONS: Record<string, any> = {
  home: require('../assets/icons/home.png'),
  diet: require('../assets/icons/diet.png'),
  scan: require('../assets/icons/scan.png'),
  feed: require('../assets/icons/feed.png'),
  workout: require('../assets/icons/workout.png'),
  progress: require('../assets/icons/progress.png'),
  coach: require('../assets/icons/coach.png'),
  attendance: require('../assets/icons/attendance.png'),
  reminders: require('../assets/icons/reminders.png'),
  profile: require('../assets/icons/profile.png'),
  changegym: require('../assets/icons/changegym.png'),
  logout: require('../assets/icons/logout.png'),
  menu: require('../assets/icons/menu.png'),
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, color = colors.text, size = 24 }: { name: IconName; color?: string; size?: number }) {
  return <Image source={ICONS[name]} style={{ width: size, height: size, tintColor: color, resizeMode: 'contain' }} />;
}
