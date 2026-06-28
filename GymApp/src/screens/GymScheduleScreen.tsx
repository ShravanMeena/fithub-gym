// Gym timing: the member sets when they go to the gym (e.g. 6:00 am) and on which
// days, and we set a repeating ALARM in their Clock app for it — plus optionally
// add it to their calendar. The OS rings it even if the app is closed.
import React, { useState } from 'react';
import { View, TouchableOpacity, Alert, Linking } from 'react-native';
import { Card, Txt, Field, Button } from '../components/UI';
import { ensureCalendarPermission, addGymSchedule, canSetAlarm, setGymAlarm } from '../utils/calendar';
import { colors, font, radius, spacing } from '../theme';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // index 0=Sun
const LEADS = [
  { label: 'At gym time', min: 0 },
  { label: '15 min before', min: 15 },
  { label: '30 min before', min: 30 },
];

// hour:minute minus `lead` minutes, wrapped within the day.
function minusLead(hour: number, minute: number, lead: number) {
  let total = ((hour * 60 + minute - lead) % 1440 + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export default function GymScheduleScreen() {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); // Mon–Sat
  const [time, setTime] = useState('06:00');
  const [lead, setLead] = useState(0);
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  // Validate days + time; returns {hour, minute} or null (after alerting).
  const parseInput = (): { hour: number; minute: number } | null => {
    if (days.length === 0) { Alert.alert('Pick your days', 'Select at least one gym day.'); return null; }
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!m) { Alert.alert('Check the time', 'Enter your gym time as HH:MM, e.g. 06:00'); return null; }
    const hour = Number(m[1]), minute = Number(m[2]);
    if (hour > 23 || minute > 59) { Alert.alert('Check the time', 'Enter a valid 24-hour time.'); return null; }
    return { hour, minute };
  };

  // Set a repeating Clock alarm (ringing) for the gym time, minus the lead.
  const onSetAlarm = async () => {
    const t = parseInput();
    if (!t) return;
    const a = minusLead(t.hour, t.minute, lead);
    setSaving(true);
    try {
      await setGymAlarm(days, a.hour, a.minute);
      const pad = (n: number) => String(n).padStart(2, '0');
      Alert.alert('Alarm set ⏰', `A repeating alarm is set for ${pad(a.hour)}:${pad(a.minute)} on your gym days. It'll ring even if the app is closed.`);
    } catch (e: any) {
      Alert.alert('Could not set alarm', e?.message || 'Your Clock app may not support auto-setting alarms — try opening it manually.');
    } finally {
      setSaving(false);
    }
  };

  // Add the gym time to the phone calendar with a reminder.
  const onAddCalendar = async () => {
    const t = parseInput();
    if (!t) return;
    setSaving(true);
    try {
      const ok = await ensureCalendarPermission();
      if (!ok) {
        Alert.alert('Calendar access needed', 'Allow calendar access so we can add your gym timing.', [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      const n = await addGymSchedule(days, t.hour, t.minute, lead);
      Alert.alert('Added to your calendar 📅', `${n} weekly gym reminder${n === 1 ? '' : 's'} added${lead ? ` (${lead} min before)` : ''}.`);
    } catch (e: any) {
      Alert.alert('Could not add', e?.message || 'Something went wrong adding to your calendar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Gym Timing ⏰</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>
        Set the time you go to the gym and we'll set a repeating alarm — so you never miss your slot.
      </Txt>

      <Card>
        <Txt weight="800" style={{ marginBottom: spacing(1) }}>Which days do you go?</Txt>
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
        <Field label="Your gym time (24h, e.g. 06:00)" value={time} onChangeText={setTime} placeholder="06:00" keyboardType="numbers-and-punctuation" />

        <Txt dim size={font.small} weight="700" style={{ marginBottom: 8 }}>Ring the alarm</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
          {LEADS.map((l) => (
            <TouchableOpacity key={l.min} onPress={() => setLead(l.min)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, marginRight: 8, marginBottom: 8, backgroundColor: lead === l.min ? colors.primary : colors.cardAlt }}>
              <Txt size={font.small} weight="700" style={{ color: lead === l.min ? '#fff' : colors.textDim }}>{l.label}</Txt>
            </TouchableOpacity>
          ))}
        </View>

        {canSetAlarm ? (
          <>
            <Button title="⏰ Set my gym alarm" loading={saving} onPress={onSetAlarm} style={{ marginTop: spacing(1) }} />
            <Button title="📅 Also add to calendar" variant="ghost" loading={saving} onPress={onAddCalendar} style={{ marginTop: spacing(1) }} />
          </>
        ) : (
          <Button title="📅 Add to my calendar" loading={saving} onPress={onAddCalendar} style={{ marginTop: spacing(1) }} />
        )}
      </Card>

      <Card style={{ backgroundColor: colors.cardAlt }}>
        <Txt dim size={font.small} style={{ lineHeight: 20 }}>
          {canSetAlarm
            ? "The alarm repeats weekly on your chosen days and rings even if the app is closed. You can edit or delete it anytime in your Clock app."
            : 'We add a repeating weekly event with an alert on your chosen days. You can edit or remove it anytime in your Calendar app.'}
        </Txt>
      </Card>
    </View>
  );
}
