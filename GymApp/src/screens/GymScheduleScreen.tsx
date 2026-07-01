// Gym timing: the member sets when they go to the gym and on which days. We can
// add it to their phone calendar (removable/updatable) and set a ringing Clock
// alarm. Adding to the calendar also offers to set the alarm.
import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Field, Button } from '../components/UI';
import { ensureCalendarPermission, addGymSchedule, removeGymSchedule, canSetAlarm, setGymAlarm } from '../utils/calendar';
import { colors, font, radius, spacing } from '../theme';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // index 0=Sun
const LEADS = [
  { label: 'At gym time', min: 0 },
  { label: '15 min before', min: 15 },
  { label: '30 min before', min: 30 },
];
const EVENTS_KEY = 'gym.calEventIds';
const pad = (n: number) => String(n).padStart(2, '0');

// hour:minute minus `lead` minutes, wrapped within the day.
function minusLead(hour: number, minute: number, lead: number) {
  const total = ((hour * 60 + minute - lead) % 1440 + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export default function GymScheduleScreen() {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); // Mon–Sat
  const [time, setTime] = useState('06:00');
  const [lead, setLead] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  // Load any previously-added calendar events (so we can update/remove them).
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(EVENTS_KEY).then((v) => { try { setSavedIds(v ? JSON.parse(v) : []); } catch { setSavedIds([]); } });
  }, []));

  const persistIds = async (ids: string[]) => { setSavedIds(ids); await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(ids)).catch(() => {}); };

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const parseInput = (): { hour: number; minute: number } | null => {
    if (days.length === 0) { Alert.alert('Pick your days', 'Select at least one gym day.'); return null; }
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!m) { Alert.alert('Check the time', 'Enter your gym time as HH:MM, e.g. 06:00'); return null; }
    const hour = Number(m[1]), minute = Number(m[2]);
    if (hour > 23 || minute > 59) { Alert.alert('Check the time', 'Enter a valid 24-hour time.'); return null; }
    return { hour, minute };
  };

  // Set a repeating Clock alarm (ringing) for the gym time, minus the lead.
  const doSetAlarm = async () => {
    const t = parseInput();
    if (!t) return;
    const a = minusLead(t.hour, t.minute, lead);
    setSaving(true);
    try {
      await setGymAlarm(days, a.hour, a.minute);
      Alert.alert('Alarm set ⏰', `A repeating alarm is set for ${pad(a.hour)}:${pad(a.minute)} on your gym days. It'll ring even if the app is closed.`);
    } catch (e: any) {
      Alert.alert('Could not set alarm', e?.message || 'Your Clock app may not support auto-setting alarms — try opening it manually.');
    } finally { setSaving(false); }
  };

  // Add (or update) the gym time in the phone calendar, then offer the alarm.
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
      // Updating: clear the previous events first so we don't create duplicates.
      if (savedIds.length) await removeGymSchedule(savedIds);
      const ids = await addGymSchedule(days, t.hour, t.minute, lead);
      await persistIds(ids);
      // Offer to set a ringing alarm too.
      Alert.alert(
        savedIds.length ? 'Calendar updated 📅' : 'Added to your calendar 📅',
        canSetAlarm
          ? `${ids.length} weekly reminder${ids.length === 1 ? '' : 's'} set. Want a ringing alarm too?`
          : `${ids.length} weekly reminder${ids.length === 1 ? '' : 's'} set.`,
        canSetAlarm
          ? [{ text: '⏰ Set alarm', onPress: doSetAlarm }, { text: 'Not now', style: 'cancel' }]
          : [{ text: 'OK' }]
      );
    } catch (e: any) {
      Alert.alert('Could not add', e?.message || 'Something went wrong adding to your calendar.');
    } finally { setSaving(false); }
  };

  const onRemoveCalendar = () => {
    Alert.alert('Remove gym timing?', 'This deletes the gym events from your calendar.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try { await removeGymSchedule(savedIds); await persistIds([]); Alert.alert('Removed', 'Your gym timing was removed from the calendar.'); }
          catch (e: any) { Alert.alert('Could not remove', e?.message || 'Try removing it from your Calendar app.'); }
          finally { setSaving(false); }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Gym Timing ⏰</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>
        Set the time you go to the gym and we'll remind you — set an alarm and/or add it to your calendar.
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

        <Txt dim size={font.small} weight="700" style={{ marginBottom: 8 }}>Remind me</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
          {LEADS.map((l) => (
            <TouchableOpacity key={l.min} onPress={() => setLead(l.min)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, marginRight: 8, marginBottom: 8, backgroundColor: lead === l.min ? colors.primary : colors.cardAlt }}>
              <Txt size={font.small} weight="700" style={{ color: lead === l.min ? '#fff' : colors.textDim }}>{l.label}</Txt>
            </TouchableOpacity>
          ))}
        </View>

        {canSetAlarm && (
          <Button title="⏰ Set my gym alarm" loading={saving} onPress={doSetAlarm} style={{ marginTop: spacing(1) }} />
        )}
        <Button title={savedIds.length ? '📅 Update calendar timing' : '📅 Add to my calendar'} variant={canSetAlarm ? 'ghost' : undefined} loading={saving} onPress={onAddCalendar} style={{ marginTop: spacing(1) }} />
        {savedIds.length > 0 && (
          <TouchableOpacity onPress={onRemoveCalendar} disabled={saving} style={{ alignItems: 'center', paddingVertical: spacing(1.25) }}>
            <Txt weight="700" size={font.small} style={{ color: colors.danger }}>🗑 Remove from calendar</Txt>
          </TouchableOpacity>
        )}
      </Card>

      <Card style={{ backgroundColor: colors.cardAlt }}>
        <Txt dim size={font.small} style={{ lineHeight: 20 }}>
          {savedIds.length
            ? 'Your gym timing is on your calendar. Change the time/days above and tap "Update calendar timing" to change it, or remove it anytime.'
            : (canSetAlarm
              ? 'The alarm repeats weekly and rings even if the app is closed. Adding to the calendar also offers to set the alarm.'
              : 'We add a repeating weekly event on your chosen days. You can update or remove it anytime here.')}
        </Txt>
      </Card>
    </View>
  );
}
