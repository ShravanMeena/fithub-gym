// Day navigator: ‹ Today › — swipe back through the diary, never into the future.
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Txt } from './UI';
import { colors, font, radius, spacing } from '../theme';

const pad = (n: number) => String(n).padStart(2, '0');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function shiftDate(date: string, days: number) {
  const [y, m, dd] = date.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function label(date: string) {
  const t = todayStr();
  if (date === t) return 'Today';
  if (date === shiftDate(t, -1)) return 'Yesterday';
  const [y, m, dd] = date.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;
}

export function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const isToday = date === todayStr();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 6, marginBottom: spacing(1.5) }}>
      <TouchableOpacity onPress={() => onChange(shiftDate(date, -1))} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
        <Txt size={20} weight="900" style={{ color: colors.primary }}>‹</Txt>
      </TouchableOpacity>
      <Txt weight="800" size={font.body}>{label(date)}</Txt>
      <TouchableOpacity disabled={isToday} onPress={() => onChange(shiftDate(date, 1))} style={{ paddingVertical: 10, paddingHorizontal: 16, opacity: isToday ? 0.25 : 1 }}>
        <Txt size={20} weight="900" style={{ color: colors.primary }}>›</Txt>
      </TouchableOpacity>
    </View>
  );
}
