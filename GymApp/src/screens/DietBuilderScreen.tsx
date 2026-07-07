// Build or edit your own diet plan by hand — title, meals (name, time, calories,
// items) and optional macro targets. Saves via /diet/manual (create) or /diet/:id
// (edit) and becomes your current plan, shown on the Diet screen like any other.
import React, { useLayoutEffect, useState } from 'react';
import { View, Alert, TouchableOpacity } from 'react-native';
import { Card, Txt, Button, Field } from '../components/UI';
import { TimeField } from '../components/TimeField';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { DietAPI, apiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

type MealDraft = { name: string; time: string; calories: string; items: string };

const emptyMeal = (name = '', time = ''): MealDraft => ({ name, time, calories: '', items: '' });

export default function DietBuilderScreen({ navigation, route }: any) {
  const editing = route.params?.plan || null;
  const planId: number | undefined = route.params?.id;

  const [title, setTitle] = useState<string>(editing?.title || 'My plan');
  const [summary, setSummary] = useState<string>(editing?.summary || '');
  const [protein, setProtein] = useState<string>(editing?.protein_g != null ? String(editing.protein_g) : '');
  const [carbs, setCarbs] = useState<string>(editing?.carbs_g != null ? String(editing.carbs_g) : '');
  const [fat, setFat] = useState<string>(editing?.fat_g != null ? String(editing.fat_g) : '');
  const [tips, setTips] = useState<string>((editing?.tips || []).join('\n'));
  const [meals, setMeals] = useState<MealDraft[]>(
    editing?.meals?.length
      ? editing.meals.map((m: any) => ({ name: m.name || '', time: m.time || '', calories: m.calories != null ? String(m.calories) : '', items: (m.items || []).join('\n') }))
      : [emptyMeal('Breakfast', '08:00'), emptyMeal('Lunch', '13:00'), emptyMeal('Dinner', '20:00')]
  );
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => { navigation.setOptions({ title: editing ? 'Edit plan' : 'Build a plan' }); }, [navigation, editing]);

  const setMeal = (i: number, patch: Partial<MealDraft>) => setMeals((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addMeal = () => setMeals((m) => [...m, emptyMeal(`Meal ${m.length + 1}`)]);
  const removeMeal = (i: number) => setMeals((m) => (m.length > 1 ? m.filter((_, j) => j !== i) : m));

  const totalCalories = meals.reduce((s, m) => s + (parseInt(m.calories, 10) || 0), 0);

  const save = async () => {
    if (!title.trim()) return Alert.alert('Add a title', 'Give your plan a name.');
    const cleanMeals = meals
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        time: m.time.trim(),
        calories: parseInt(m.calories, 10) || 0,
        items: m.items.split('\n').map((s) => s.trim()).filter(Boolean),
      }));
    if (!cleanMeals.length) return Alert.alert('Add a meal', 'Add at least one meal with a name.');

    const num = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : undefined; };
    const plan: Record<string, any> = {
      title: title.trim(),
      summary: summary.trim(),
      daily_calories: totalCalories,
      meals: cleanMeals,
      tips: tips.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    const p = num(protein), c = num(carbs), f = num(fat);
    if (p != null) plan.protein_g = p;
    if (c != null) plan.carbs_g = c;
    if (f != null) plan.fat_g = f;

    setSaving(true);
    try {
      if (editing && planId) await DietAPI.update(planId, plan);
      else await DietAPI.manual(plan);
      Alert.alert('Saved ✅', 'Your plan is ready on the Diet screen.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { Alert.alert('Could not save', apiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardScroll style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">{editing ? 'Edit your plan' : 'Build your own plan'}</Txt>
      <Txt dim style={{ marginBottom: spacing(1.5) }}>Add your meals, times and what to eat. It becomes your plan on the Diet screen.</Txt>

      <Card>
        <Txt weight="700" style={{ marginBottom: 6 }}>Plan name</Txt>
        <Field value={title} onChangeText={setTitle} placeholder="e.g. My lean bulk" />
        <Txt weight="700" style={{ marginTop: spacing(1.5), marginBottom: 6 }}>Short summary (optional)</Txt>
        <Field value={summary} onChangeText={setSummary} placeholder="e.g. High protein, home food, 4 meals" />
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(2), marginBottom: spacing(1) }}>
        <Txt size={font.h3} weight="800">Meals</Txt>
        <Txt weight="800" style={{ color: colors.primary }}>{totalCalories} kcal/day</Txt>
      </View>

      {meals.map((m, i) => (
        <Card key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Txt dim size={font.small} weight="800">MEAL {i + 1}</Txt>
            {meals.length > 1 ? (
              <TouchableOpacity onPress={() => removeMeal(i)}><Txt size={font.small} style={{ color: colors.danger }}>✕ Remove</Txt></TouchableOpacity>
            ) : null}
          </View>
          <Field value={m.name} onChangeText={(v) => setMeal(i, { name: v })} placeholder="Meal name (e.g. Breakfast)" />
          <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1) }}>
            <View style={{ flex: 1 }}><TimeField label="Time" value={m.time || '08:00'} onChange={(v) => setMeal(i, { time: v })} /></View>
            <View style={{ flex: 1 }}>
              <Txt dim size={font.small} style={{ marginBottom: 6 }}>Calories</Txt>
              <Field value={m.calories} onChangeText={(v) => setMeal(i, { calories: v.replace(/[^0-9]/g, '') })} keyboardType="numeric" placeholder="e.g. 500" />
            </View>
          </View>
          <Txt dim size={font.small} style={{ marginTop: spacing(1), marginBottom: 6 }}>What to eat — one item per line</Txt>
          <Field value={m.items} onChangeText={(v) => setMeal(i, { items: v })} placeholder={'3 eggs\n2 rotis\n1 glass milk'} multiline style={{ height: 90, textAlignVertical: 'top', paddingTop: 12 }} />
        </Card>
      ))}

      <Button title="＋ Add another meal" variant="ghost" onPress={addMeal} style={{ marginTop: spacing(0.5) }} />

      <Card style={{ marginTop: spacing(2) }}>
        <Txt weight="700" style={{ marginBottom: 6 }}>Daily macro targets (optional)</Txt>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Txt dim size={font.tiny} style={{ marginBottom: 4 }}>Protein (g)</Txt><Field value={protein} onChangeText={(v) => setProtein(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="—" /></View>
          <View style={{ flex: 1 }}><Txt dim size={font.tiny} style={{ marginBottom: 4 }}>Carbs (g)</Txt><Field value={carbs} onChangeText={(v) => setCarbs(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="—" /></View>
          <View style={{ flex: 1 }}><Txt dim size={font.tiny} style={{ marginBottom: 4 }}>Fat (g)</Txt><Field value={fat} onChangeText={(v) => setFat(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="—" /></View>
        </View>
      </Card>

      <Card>
        <Txt weight="700" style={{ marginBottom: 6 }}>Coach tips (optional) — one per line</Txt>
        <Field value={tips} onChangeText={setTips} placeholder={'Drink 3L water\nProtein with every meal'} multiline style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }} />
      </Card>

      <Button title={saving ? 'Saving…' : editing ? '✅ Save changes' : '✅ Save my plan'} loading={saving} onPress={save} style={{ marginTop: spacing(1) }} />
      <View style={{ height: spacing(4) }} />
    </KeyboardScroll>
  );
}
