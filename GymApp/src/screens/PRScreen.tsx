// Personal records — log the big lifts, watch your numbers climb, celebrate PRs.
import React, { useCallback, useState } from 'react';
import { View, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Field, Button, Pill } from '../components/UI';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { Celebration } from '../components/Celebration';
import { PRsAPI, apiError } from '../api/client';
import { colors, font, spacing } from '../theme';

const LIFTS = ['Bench', 'Squat', 'Deadlift', 'Shoulder Press', 'Barbell Row', 'Pull-up'];

export default function PRScreen() {
  const [data, setData] = useState<any>(null);
  const [lift, setLift] = useState('Bench');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('1');
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const load = useCallback(() => { PRsAPI.list().then(setData).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    const w = Number(weight); const r = Number(reps) || 1;
    if (!w) return Alert.alert('Enter weight', 'How much did you lift?');
    setSaving(true);
    try {
      const res = await PRsAPI.add(lift, w, r);
      setWeight('');
      await load();
      if (res.isBest) setCelebrate(true);
    } catch (e) { Alert.alert('Error', apiError(e)); }
    finally { setSaving(false); }
  };

  const del = async (id: number) => { try { await PRsAPI.remove(id); load(); } catch {} };
  const best = data?.best || [];
  const records = data?.records || [];

  return (
    <KeyboardScroll style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Personal Records 💪</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Log your big lifts and watch your numbers climb.</Txt>

      {best.length > 0 && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="800" style={{ marginBottom: spacing(1) }}>🏆 Your bests</Txt>
          {best.map((b: any) => (
            <View key={b.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Txt weight="700">{b.lift}</Txt>
              <Txt weight="900" style={{ color: colors.primary }}>{b.weight_kg} kg × {b.reps}</Txt>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Txt weight="800" style={{ marginBottom: spacing(1) }}>Log a lift</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
          {LIFTS.map((l) => <Pill key={l} label={l} active={lift === l} onPress={() => setLift(l)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing(1) }}>
          <View style={{ flex: 1 }}><Field label="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} placeholder="60" /></View>
          <View style={{ flex: 1 }}><Field label="Reps" keyboardType="numeric" value={reps} onChangeText={setReps} placeholder="1" /></View>
        </View>
        <Button title="＋ Save PR" loading={saving} onPress={add} />
      </Card>

      {records.length > 0 && (
        <Card>
          <Txt weight="800" style={{ marginBottom: spacing(1) }}>History</Txt>
          {records.slice(0, 20).map((r: any) => (
            <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Txt weight="700">{r.lift}</Txt>
                <Txt dim size={font.tiny}>{String(r.logged_at).slice(0, 10)}</Txt>
              </View>
              <Txt weight="800" style={{ marginRight: 10 }}>{r.weight_kg}kg × {r.reps}</Txt>
              <TouchableOpacity onPress={() => del(r.id)} style={{ padding: 6 }}><Txt size={14} style={{ color: colors.danger }}>🗑</Txt></TouchableOpacity>
            </View>
          ))}
        </Card>
      )}

      <View style={{ height: spacing(4) }} />
      <Celebration visible={celebrate} emoji="🏆" title="New PR! 🎉" message={`${lift} — that's a new personal best 💪`} onClose={() => setCelebrate(false)} />
    </KeyboardScroll>
  );
}
