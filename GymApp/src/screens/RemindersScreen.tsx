import React, { useEffect, useState } from 'react';
import { ScrollView, View, Switch, Alert, TouchableOpacity } from 'react-native';
import { Card, Txt, Field, Button } from '../components/UI';
import { ReminderAPI, apiError } from '../api/client';
import { scheduleReminder, cancelReminder, ensureNotifPermission, sendNow } from '../notifications';
import { colors, font, spacing } from '../theme';

const pad = (n: number) => String(n).padStart(2, '0');

// Quick presets: [label, message, hour, minute]
const QUICK: [string, string, number, number][] = [
  ['🍳 Breakfast', 'Time for breakfast! Fuel up with protein 💪', 8, 0],
  ['🥗 Lunch', 'Lunch time — eat your meal & hit your macros 🥗', 13, 0],
  ['🥤 Pre-workout', 'Pre-workout snack + water before the gym 🏋️', 17, 0],
  ['🍗 Dinner', 'Dinner time — last big meal of the day 🍽️', 20, 30],
  ['💧 Water', 'Drink a glass of water now 💧', 11, 0],
];

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { reminders } = await ReminderAPI.list();
      setReminders(reminders);
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  };

  useEffect(() => { ensureNotifPermission(); load(); }, []);

  const add = async () => {
    const h = Number(hour), m = Number(minute);
    if (!title) return Alert.alert('Missing', 'Give the reminder a title.');
    if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
      return Alert.alert('Invalid time', 'Use 0-23 hour and 0-59 minute.');
    }
    const granted = await ensureNotifPermission();
    if (!granted) {
      Alert.alert('Notifications off', 'Enable notifications for IronFuel in Settings to get reminders.');
    }
    setSaving(true);
    try {
      // body is the message shown in the notification
      const { reminder } = await ReminderAPI.create({ title, body: message || undefined, hour: h, minute: m, enabled: true });
      await scheduleReminder(reminder);
      setTitle(''); setMessage('');
      await load();
      Alert.alert('Reminder set ✅', `You'll be notified daily at ${pad(h)}:${pad(m)}.`);
    } catch (e) {
      Alert.alert('Error', apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: any) => {
    const enabled = !r.enabled;
    try {
      const { reminder } = await ReminderAPI.update(r.id, { enabled });
      await scheduleReminder(reminder);
      await load();
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  };

  const remove = async (r: any) => {
    try {
      await ReminderAPI.remove(r.id);
      await cancelReminder(r.id);
      await load();
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  };

  const test = async (r: any) => {
    const ok = await sendNow(r.title, r.body || 'Time to stay on track 💪');
    if (!ok) Alert.alert('Notifications off', 'Enable notifications for IronFuel in Settings.');
  };

  const quickAdd = (label: string, msg: string, h: number, m: number) => {
    setTitle(label); setMessage(msg); setHour(pad(h)); setMinute(pad(m));
  };

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Meal & Workout Reminders</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Daily alarms so you never miss a meal or session. They fire even when the app is closed.</Txt>

      <Card>
        <Field label="Reminder title" value={title} onChangeText={setTitle} placeholder="e.g. Drink protein shake" />
        <Field
          label="Notification message"
          value={message}
          onChangeText={setMessage}
          placeholder="e.g. Please eat something now 🍽️"
        />
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Field label="Hour (0-23)" keyboardType="numeric" value={hour} onChangeText={setHour} /></View>
          <View style={{ flex: 1 }}><Field label="Minute" keyboardType="numeric" value={minute} onChangeText={setMinute} /></View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
          {QUICK.map(([label, msg, h, m]) => (
            <TouchableOpacity
              key={label}
              onPress={() => quickAdd(label, msg, h, m)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.cardAlt, borderRadius: 999, marginRight: 8, marginBottom: 8 }}>
              <Txt size={font.small}>{label}</Txt>
            </TouchableOpacity>
          ))}
        </View>
        <Button title="＋ Add reminder" loading={saving} onPress={add} />
        <Button
          title="🔔 Send a test notification now"
          variant="ghost"
          onPress={() => test({ title: title || 'IronFuel', body: message || 'Please eat something now 🍽️' })}
          style={{ marginTop: spacing(1) }}
        />
      </Card>

      {reminders.length === 0 ? (
        <Card><Txt dim>No reminders yet.</Txt></Card>
      ) : (
        reminders.map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Txt weight="700" size={font.h3}>{pad(r.hour)}:{pad(r.minute)}</Txt>
                <Txt weight="600">{r.title}</Txt>
                {r.body ? <Txt dim size={font.small}>{r.body}</Txt> : null}
              </View>
              <Switch value={!!r.enabled} onValueChange={() => toggle(r)} trackColor={{ true: colors.primary }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing(1), gap: spacing(2) }}>
              <TouchableOpacity onPress={() => test(r)}>
                <Txt size={font.small} style={{ color: colors.accent }}>🔔 Test</Txt>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(r)}>
                <Txt size={font.small} style={{ color: colors.danger }}>Delete</Txt>
              </TouchableOpacity>
            </View>
          </Card>
        ))
      )}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
