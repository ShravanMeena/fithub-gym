// In-workout rest timer. Counts down, vibrates + notifies when done (the
// notification fires even if the screen is locked). Can be auto-started by the
// parent after logging a set.
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { View, TouchableOpacity, Vibration, AppState } from 'react-native';
import { Txt } from './UI';
import { scheduleRestDone, cancelRestDone } from '../notifications';
import { colors, font, radius, spacing } from '../theme';

const PRESETS = [60, 90, 120, 180];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export type RestTimerHandle = { start: (seconds?: number) => void };

export const RestTimer = forwardRef<RestTimerHandle>((_props, ref) => {
  const [preset, setPreset] = useState(90);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const endAt = useRef<number>(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    setRunning(false);
    cancelRestDone().catch(() => {});
  };

  const start = (seconds?: number) => {
    const secs = seconds ?? preset;
    if (seconds) setPreset(seconds);
    endAt.current = Date.now() + secs * 1000;
    setRemaining(secs);
    setRunning(true);
    scheduleRestDone(secs).catch(() => {});
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      const left = Math.round((endAt.current - Date.now()) / 1000);
      if (left <= 0) {
        stop();
        setRemaining(0);
        Vibration.vibrate(600);
      } else {
        setRemaining(left);
      }
    }, 250);
  };

  useImperativeHandle(ref, () => ({ start }));

  // Re-sync the countdown when coming back from the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && running) {
        const left = Math.round((endAt.current - Date.now()) / 1000);
        if (left <= 0) { stop(); setRemaining(0); } else setRemaining(left);
      }
    });
    return () => { sub.remove(); if (tick.current) clearInterval(tick.current); };
  }, [running]);

  return (
    <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: spacing(1.5), marginBottom: spacing(1.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Txt size={20}>⏱</Txt>
          <Txt size={font.h2} weight="900" style={{ marginLeft: 8, color: running ? colors.primary : colors.text }}>
            {fmt(running ? remaining : preset)}
          </Txt>
        </View>
        {running ? (
          <TouchableOpacity onPress={stop} style={{ backgroundColor: colors.danger, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill }}>
            <Txt weight="800" size={font.small} style={{ color: '#fff' }}>Stop</Txt>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => start()} style={{ backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill }}>
            <Txt weight="800" size={font.small} style={{ color: '#fff' }}>Start</Txt>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flexDirection: 'row', marginTop: spacing(1) }}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => (running ? start(p) : setPreset(p))}
            style={{
              paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, marginRight: 8,
              backgroundColor: preset === p ? colors.primary + '33' : 'transparent',
              borderWidth: 1, borderColor: preset === p ? colors.primary : colors.border,
            }}>
            <Txt size={font.small} weight="700" style={{ color: preset === p ? colors.primary : colors.textDim }}>{fmt(p)}</Txt>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});
