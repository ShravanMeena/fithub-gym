import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, View, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Field, Button, Pill } from '../components/UI';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { RestTimer, RestTimerHandle } from '../components/RestTimer';
import { ExerciseLibrary } from '../components/ExerciseLibrary';
import { TEMPLATES } from '../data/templates';
import { WorkoutAPI, apiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

const LIBRARY = [
  'Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row',
  'Pull-up', 'Lat Pulldown', 'Bicep Curl', 'Tricep Pushdown', 'Leg Press',
  'Lunges', 'Shoulder Press', 'Incline Bench', 'Romanian Deadlift', 'Plank',
];

type SetRow = { exercise: string; weight_kg: string; reps: string };

export default function WorkoutScreen() {
  const [title, setTitle] = useState('Workout');
  const [rows, setRows] = useState<SetRow[]>([{ exercise: '', weight_kg: '', reps: '' }]);
  const [saving, setSaving] = useState(false);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [prs, setPrs] = useState<any[]>([]);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const timerRef = useRef<RestTimerHandle>(null);

  const loadTemplate = (t: (typeof TEMPLATES)[number]) => {
    setTitle(t.name);
    // Expand each template entry into its number of sets.
    const expanded: SetRow[] = [];
    t.sets.forEach((s) => {
      for (let i = 0; i < s.sets; i++) {
        const reps = /^\d+$/.test(s.reps) ? s.reps : '';
        expanded.push({ exercise: s.exercise, weight_kg: '', reps });
      }
    });
    setRows(expanded.length ? expanded : [{ exercise: '', weight_kg: '', reps: '' }]);
  };

  const load = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([WorkoutAPI.list(), WorkoutAPI.prs()]);
      setWorkouts(w.workouts);
      setPrs(p.prs);
      setTotalWorkouts(p.totalWorkouts);
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const updateRow = (i: number, key: keyof SetRow, val: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const addRow = (exercise?: string) => {
    setRows((prev) => [...prev, { exercise: exercise || '', weight_kg: '', reps: '' }]);
    // "Add set" (no preset exercise) = finished a set → auto-start the rest timer.
    if (!exercise) timerRef.current?.start();
  };

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    const sets = rows
      .filter((r) => r.exercise.trim() && r.reps)
      .map((r) => ({ exercise: r.exercise.trim(), weight_kg: Number(r.weight_kg) || 0, reps: Number(r.reps) || 0 }));
    if (sets.length === 0) return Alert.alert('Add a set', 'Enter at least one exercise with reps.');
    setSaving(true);
    try {
      const res = await WorkoutAPI.create({ title: title.trim() || 'Workout', sets });
      setRows([{ exercise: '', weight_kg: '', reps: '' }]);
      setTitle('Workout');
      await load();
      if (res.prs?.length) {
        const lines = res.prs
          .map((p: any) => `🏆 ${p.exercise}: ${p.weight}kg${p.prev > 0 ? ` (was ${p.prev}kg)` : ''}`)
          .join('\n');
        Alert.alert('🎉 New Personal Record!', `${lines}\n\nKeep crushing it 💪`);
      } else {
        Alert.alert('Saved 💪', 'Workout logged.');
      }
    } catch (e) {
      Alert.alert('Error', apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const del = (w: any) => {
    Alert.alert('Delete workout?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await WorkoutAPI.remove(w.id); load(); } },
    ]);
  };

  return (
    <KeyboardScroll
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>

      <Txt size={font.h2} weight="800">Log Workout 🏋️</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Track exercises, sets, reps & weight.</Txt>

      {/* PR summary */}
      {prs.length > 0 && (
        <Card style={{ borderColor: colors.primary }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
            <Txt weight="700">🏆 Personal Records</Txt>
            <Txt dim size={font.small}>{totalWorkouts} workouts</Txt>
          </View>
          {prs.slice(0, 5).map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Txt size={font.small}>{p.exercise}</Txt>
              <Txt size={font.small} weight="700" style={{ color: colors.primary }}>
                {p.best_weight}kg × {p.reps}  ·  1RM ~{p.est_1rm}kg
              </Txt>
            </View>
          ))}
        </Card>
      )}

      {/* Routine templates */}
      <Txt dim size={font.small} weight="700" style={{ marginBottom: 6 }}>LOAD A ROUTINE</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(2) }}>
        {TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.name}
            onPress={() => loadTemplate(t)}
            style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing(1.5), marginRight: 10, width: 150 }}>
            <Txt size={20}>{t.emoji}</Txt>
            <Txt weight="800" style={{ marginTop: 4 }}>{t.name}</Txt>
            <Txt dim size={font.tiny} style={{ marginTop: 2 }}>{t.focus}</Txt>
            <Txt size={font.tiny} style={{ marginTop: 6, color: colors.primary }}>{t.sets.length} exercises →</Txt>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Rest timer */}
      <RestTimer ref={timerRef} />

      {/* Composer */}
      <Card>
        <Field label="Workout name" value={title} onChangeText={setTitle} placeholder="Push Day" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Txt dim size={font.small}>Quick add exercise</Txt>
          <TouchableOpacity onPress={() => setLibOpen(true)}><Txt size={font.small} weight="700" style={{ color: colors.accent }}>📖 Library</Txt></TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
          {LIBRARY.slice(0, 8).map((ex) => (
            <Pill key={ex} label={ex} onPress={() => addRow(ex)} />
          ))}
        </View>

        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
            <View style={{ flex: 2.2 }}><Field value={r.exercise} onChangeText={(v) => updateRow(i, 'exercise', v)} placeholder="Exercise" style={{ height: 44 }} /></View>
            <View style={{ flex: 1 }}><Field value={r.weight_kg} onChangeText={(v) => updateRow(i, 'weight_kg', v)} placeholder="kg" keyboardType="numeric" style={{ height: 44 }} /></View>
            <View style={{ flex: 1 }}><Field value={r.reps} onChangeText={(v) => updateRow(i, 'reps', v)} placeholder="reps" keyboardType="numeric" style={{ height: 44 }} /></View>
            <TouchableOpacity onPress={() => removeRow(i)} style={{ paddingBottom: 12 }}><Txt style={{ color: colors.danger }}>✕</Txt></TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity onPress={() => addRow()} style={{ paddingVertical: 8 }}>
          <Txt style={{ color: colors.accent }}>＋ Add set</Txt>
        </TouchableOpacity>
        <Button title="💾 Save Workout" loading={saving} onPress={save} style={{ marginTop: spacing(1) }} />
      </Card>

      <Txt size={font.h3} weight="700" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>History</Txt>
      {workouts.length === 0 ? (
        <Card><Txt dim>No workouts yet. Log your first session above.</Txt></Card>
      ) : (
        workouts.map((w) => (
          <Card key={w.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt weight="700">{w.title}</Txt>
              <TouchableOpacity onPress={() => del(w)}><Txt size={font.small} style={{ color: colors.danger }}>✕</Txt></TouchableOpacity>
            </View>
            <Txt dim size={font.tiny} style={{ marginBottom: 6 }}>
              {w.created_at?.slice(0, 16).replace('T', ' ')} · {w.volume}kg volume
            </Txt>
            {w.sets.map((s: any, j: number) => (
              <View key={j} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <Txt dim size={font.small}>{s.exercise}</Txt>
                <Txt size={font.small}>{s.weight_kg ? `${s.weight_kg}kg × ` : ''}{s.reps} reps</Txt>
              </View>
            ))}
          </Card>
        ))
      )}
      <View style={{ height: spacing(4) }} />

      <ExerciseLibrary visible={libOpen} onClose={() => setLibOpen(false)} onPick={(name) => addRow(name)} />
    </KeyboardScroll>
  );
}
