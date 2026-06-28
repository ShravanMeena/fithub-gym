// Set your gym days + time and add them to your phone's calendar, so you get a
// reminder before every session — no notifications/login needed, the OS handles it.
import React, { useState } from 'react';
import { View, TouchableOpacity, Alert, Linking } from 'react-native';
import { Card, Txt, Field, Button } from '../components/UI';
import { ensureCalendarPermission, addGymSchedule, canSetAlarm, setGymAlarm } from '../utils/calendar';
import { colors, font, radius, spacing } from '../theme';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // index 0=Sun
const LEADS = [
  { label: 'At gym time', min: 0 },
  { label: '30 min before', min: 30 },
  { label: '1 hour before', min: 60 },
];

export default function GymScheduleScreen() {
  const [days, setDays] = useState<number[]>([1, 3, 5]); // Mon/Wed/Fri
  const [time, setTime] = useState('18:00');
  const [lead, setLead] = useState(30);
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  // Validate days + time; returns {hour, minute} or null (after alerting).
  const parseInput = (): { hour: number; minute: number } | null => {
    if (days.length === 0) { Alert.alert('Pick your days', 'Select at least one gym day.'); return null; }
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!m) { Alert.alert('Check the time', 'Enter time as HH:MM, e.g. 18:00'); return null; }
    const hour = Number(m[1]), minute = Number(m[2]);
    if (hour > 23 || minute > 59) { Alert.alert('Check the time', 'Enter a valid 24-hour time.'); return null; }
    return { hour, minute };
  };

  const onAdd = async () => {
    const t = parseInput();
    if (!t) return;
    setSaving(true);
    try {
      const ok = await ensureCalendarPermission();
      if (!ok) {
        Alert.alert('Calendar access needed', 'Allow calendar access so we can add your gym reminders.', [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      const n = await addGymSchedule(days, t.hour, t.minute, lead);
      Alert.alert('Added to your calendar 📅', `${n} weekly gym reminder${n === 1 ? '' : 's'} set${lead ? ` (${lead} min before)` : ''}. Your phone will remind you before every session 💪`);
    } catch (e: any) {
      Alert.alert('Could not add', e?.message || 'Something went wrong adding to your calendar.');
    } finally {
      setSaving(false);
    }
  };

  const onSetAlarm = async () => {
    const t = parseInput();
    if (!t) return;
    setSaving(true);
    try {
      await setGymAlarm(days, t.hour, t.minute);
      Alert.alert('Alarm set ⏰', "A repeating alarm is set in your Clock app for your gym days. It'll ring even if the app is closed.");
    } catch (e: any) {
      Alert.alert('Could not set alarm', e?.message || 'Your Clock app may not support auto-setting alarms — try opening it manually.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Gym Schedule 📅</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>
        Add your gym timings to your phone calendar and get a reminder before every session.
      </Txt>

      <Card>
        <Txt weight="800" style={{ marginBottom: spacing(1) }}>Which days do you train?</Txt>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {DAYS.map((label, i) => {
            const on = days.includes(i);
            return (
              <TouchableOpacity key={i} onPress={() => toggleDay(i)}
                style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.cardAlt, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                <Txt weight="800" style={{ color: on ? '#fff' : colors.textDim }}>{label}</Txt>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: spacing(2) }} />
        <Field label="Gym time (24h, e.g. 18:00)" value={time} onChangeText={setTime} placeholder="18:00" keyboardType="numbers-and-punctuation" />

        <Txt dim size={font.small} weight="700" style={{ marginBottom: 8 }}>Remind me</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
          {LEADS.map((l) => (
            <TouchableOpacity key={l.min} onPress={() => setLead(l.min)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, marginRight: 8, marginBottom: 8, backgroundColor: lead === l.min ? colors.primary : colors.cardAlt }}>
              <Txt size={font.small} weight="700" style={{ color: lead === l.min ? '#fff' : colors.textDim }}>{l.label}</Txt>
            </TouchableOpacity>
          ))}
        </View>

        <Button title="📅 Add to my calendar" loading={saving} onPress={onAdd} style={{ marginTop: spacing(1) }} />
        {canSetAlarm && (
          <Button title="⏰ Also set a phone alarm" variant="ghost" loading={saving} onPress={onSetAlarm} style={{ marginTop: spacing(1) }} />
        )}
      </Card>

      <Card style={{ backgroundColor: colors.cardAlt }}>
        <Txt dim size={font.small} style={{ lineHeight: 20 }}>
          We'll create a repeating weekly event on your chosen days. Your phone's calendar reminds you — it works even if the app is closed, and you can edit or remove the events anytime in your Calendar app.
        </Txt>
      </Card>
    </View>
  );
}
