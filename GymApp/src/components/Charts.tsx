// Lightweight, dependency-free charts (no react-native-svg needed).
// LineChart draws line segments as rotated Views; ContributionGrid is a
// GitHub-style check-in calendar.
import React, { useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Txt } from './UI';
import { colors, font } from '../theme';

const lz = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${lz(d.getMonth() + 1)}-${lz(d.getDate())}`;

// ---- Line chart ------------------------------------------------------------
export function LineChart({
  values,
  goal,
  color = colors.primary,
  height = 150,
  unit = '',
}: {
  values: number[];
  goal?: number | null;
  color?: string;
  height?: number;
  unit?: string;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  if (!values.length) return null;
  const padV = 18; // vertical padding for the plot area
  const plotH = height - padV * 2;
  const lo = Math.min(...values, goal ?? Infinity);
  const hi = Math.max(...values, goal ?? -Infinity);
  const span = hi - lo || 1;
  const yOf = (v: number) => padV + plotH - ((v - lo) / span) * plotH;
  const n = values.length;
  const xOf = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);

  const segments = [];
  for (let i = 0; i < n - 1; i++) {
    const x1 = xOf(i), y1 = yOf(values[i]);
    const x2 = xOf(i + 1), y2 = yOf(values[i + 1]);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    segments.push(
      <View
        key={`s${i}`}
        style={{
          position: 'absolute',
          left: (x1 + x2) / 2 - len / 2,
          top: (y1 + y2) / 2 - 1,
          width: len,
          height: 2.5,
          backgroundColor: color,
          borderRadius: 2,
          transform: [{ rotate: `${angle}deg` }],
        }}
      />,
    );
  }

  const last = values[n - 1];
  return (
    <View>
      <View onLayout={onLayout} style={{ height, width: '100%' }}>
        {w > 0 && (
          <>
            {/* goal line */}
            {goal != null && (
              <View style={{ position: 'absolute', left: 0, right: 0, top: yOf(goal), height: 1, backgroundColor: colors.accent, opacity: 0.6 }} />
            )}
            {segments}
            {/* dots */}
            {values.map((v, i) => (
              <View
                key={`d${i}`}
                style={{
                  position: 'absolute',
                  left: xOf(i) - 3,
                  top: yOf(v) - 3,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === n - 1 ? color : colors.card,
                  borderWidth: 1.5,
                  borderColor: color,
                }}
              />
            ))}
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Txt dim size={font.tiny}>low {Math.round(lo)}{unit}</Txt>
        {goal != null && <Txt size={font.tiny} style={{ color: colors.accent }}>goal {Math.round(goal)}{unit}</Txt>}
        <Txt size={font.tiny} weight="800" style={{ color }}>now {Math.round(last)}{unit}</Txt>
      </View>
    </View>
  );
}

// ---- Contribution grid (check-in calendar) --------------------------------
export function ContributionGrid({ days, weeks = 5 }: { days: string[]; weeks?: number }) {
  const set = new Set(days);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Monday of the current week
  const mon = new Date(today);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const start = new Date(mon);
  start.setDate(start.getDate() - (weeks - 1) * 7);

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const rows = [];
  for (let c = 0; c < 7; c++) {
    const cells = [];
    for (let r = 0; r < weeks; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + r * 7 + c);
      const future = d > today;
      const filled = set.has(isoLocal(d));
      cells.push(
        <View
          key={`${r}-${c}`}
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            margin: 2,
            backgroundColor: future ? 'transparent' : filled ? colors.primary : colors.cardAlt,
            borderWidth: future ? 0 : filled ? 0 : 1,
            borderColor: colors.border,
          }}
        />,
      );
    }
    rows.push(
      <View key={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt dim size={font.tiny} style={{ width: 14 }}>{dayLabels[c]}</Txt>
        {cells}
      </View>,
    );
  }
  return <View>{rows}</View>;
}
