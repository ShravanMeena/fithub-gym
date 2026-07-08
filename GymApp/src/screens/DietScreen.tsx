// Diet — the single NUTRITION place. Top: today's calories + what you ate (the
// diary, browse any day) + water. Below: your meal plan (view / build / edit),
// collapsible so logging stays the focus.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Image, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button } from '../components/UI';
import { DateNav, todayStr } from '../components/DateNav';
import { WaterCard } from '../components/WaterCard';
import { Skeleton } from '../components/Skeleton';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { DietAPI, ProfileAPI, ReminderAPI, FoodAPI, mealPhotoSource, apiError } from '../api/client';
import { scheduleReminder, ensureNotifPermission } from '../notifications';
import { useBilling } from '../context/BillingContext';
import { colors, font, radius, spacing } from '../theme';

function toPlans(plan: any): any[] {
  if (!plan) return [];
  if (Array.isArray(plan.plans)) return plan.plans;
  return [plan];
}

export default function DietScreen({ navigation }: any) {
  const { aiActive, showPaywall } = useBilling();

  // ---- food diary (any day) ----
  const [date, setDate] = useState(todayStr());
  const [logs, setLogs] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [foodLoading, setFoodLoading] = useState(true);
  const isToday = date === todayStr();

  // ---- plan ----
  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState<number | null>(null);
  const [selected, setSelected] = useState(0);
  const [targets, setTargets] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadFood = useCallback(async () => {
    setFoodLoading(true);
    const d = await FoodAPI.day(isToday ? undefined : date).catch(() => ({ logs: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } }));
    setLogs(d.logs || []);
    setTotals(d.totals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    setFoodLoading(false);
  }, [date, isToday]);

  const loadPlan = useCallback(async () => {
    try {
      const [cur, prof] = await Promise.all([DietAPI.current(), ProfileAPI.get()]);
      setPlans(toPlans(cur.plan));
      setPlanId(cur.id ?? null);
      setTargets(prof?.targets || null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadFood(); }, [loadFood]); // reload food when the day changes
  useFocusEffect(useCallback(() => { loadPlan(); loadFood(); }, [loadPlan, loadFood]));

  const deleteFood = (item: any) => {
    setLogs((prev) => prev.filter((x) => x.id !== item.id));
    setTotals((t: any) => ({
      calories: Math.max(0, t.calories - (item.calories || 0)),
      protein_g: Math.max(0, t.protein_g - (item.protein_g || 0)),
      carbs_g: Math.max(0, t.carbs_g - (item.carbs_g || 0)),
      fat_g: Math.max(0, t.fat_g - (item.fat_g || 0)),
    }));
    FoodAPI.remove(item.id).catch(() => {});
  };

  const generateAI = async () => {
    if (!aiActive) { showPaywall('AI Diet Plan'); return; }
    setLoading(true);
    try { const { plan } = await DietAPI.generate(); setPlans(toPlans(plan)); setSelected(0); }
    catch (e: any) { if (e?.response?.status === 402) showPaywall('AI Diet Plan'); else Alert.alert('Could not generate', apiError(e)); }
    finally { setLoading(false); }
  };

  const generateNormal = async () => {
    setLoading(true);
    try { const { plan } = await DietAPI.normal(); setPlans(toPlans(plan)); setSelected(0); }
    catch (e) { Alert.alert('Could not load plan', apiError(e)); }
    finally { setLoading(false); }
  };

  const choosePlan = () => {
    Alert.alert('Choose your plan', 'Build your own, use a free ready-made plan, or get an AI plan personalised to your goal.', [
      { text: '✏️ Build my own', onPress: () => navigation.navigate('DietBuilder') },
      { text: '✨ AI personalised (premium)', onPress: generateAI },
      { text: 'Free ready-made plan', onPress: generateNormal },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addRemindersForPlan = async (plan: any) => {
    const planMeals = (plan.meals || []).filter((m: any) => /^\d{1,2}:\d{2}$/.test(m.time || ''));
    if (planMeals.length === 0) return Alert.alert('No meal times', 'This plan has no usable meal times.');
    await ensureNotifPermission();
    let count = 0;
    for (const m of planMeals) {
      const [h, min] = m.time.split(':').map(Number);
      try { const { reminder } = await ReminderAPI.create({ title: m.name, body: `Time for ${m.name} 🍽️ (${plan.title})`, hour: h, minute: min, enabled: true }); await scheduleReminder(reminder); count++; } catch { /* skip */ }
    }
    Alert.alert('Reminders added ✅', `${count} meal reminders set. Manage them under Reminders.`, [
      { text: 'View Reminders', onPress: () => navigation.navigate('Reminders') }, { text: 'OK' },
    ]);
  };

  const useThisPlan = (plan: any) => {
    Alert.alert(`Use "${plan.title}"?`, `Add ${(plan.meals || []).length} meal reminders at this plan's times?`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Add reminders', onPress: () => addRemindersForPlan(plan) },
    ]);
  };

  const plan = plans[selected];
  const kcalLeft = targets ? Math.max(0, Math.round((targets.calories || 0) - totals.calories)) : 0;

  return (
    <KeyboardScroll
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([loadPlan(), loadFood()]); setRefreshing(false); }} tintColor={colors.primary} />}>

      {/* ---- Day switcher + today's intake ---- */}
      <DateNav date={date} onChange={setDate} />

      <Card style={{ borderColor: colors.primary }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt dim size={font.small} weight="800" style={{ letterSpacing: 1 }}>INTAKE</Txt>
          {targets ? <Txt size={font.small} weight="800" style={{ color: kcalLeft <= 0 ? colors.accent : colors.primary }}>{kcalLeft <= 0 ? '🎯 Target hit' : `${kcalLeft} kcal ${isToday ? 'left' : 'under'}`}</Txt> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
          <Txt size={font.h1} weight="900">{Math.round(totals.calories)}</Txt>
          <Txt dim weight="700"> / {targets?.calories ?? '—'} kcal</Txt>
        </View>
        <Bar value={totals.calories} max={targets?.calories} color={colors.primary} />
        <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
          <MiniMacro label="Protein" v={totals.protein_g} t={targets?.protein_g} color={colors.protein} />
          <MiniMacro label="Carbs" v={totals.carbs_g} t={targets?.carbs_g} color={colors.carbs} />
          <MiniMacro label="Fat" v={totals.fat_g} t={targets?.fat_g} color={colors.fat} />
        </View>
        {isToday ? <Button title="📷 Log food" onPress={() => navigation.navigate('Scan')} style={{ marginTop: spacing(1.5) }} /> : null}
      </Card>

      {/* Water (today only) */}
      {isToday ? <WaterCard /> : null}

      {/* Logged food */}
      <Txt size={font.h3} weight="800" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>{isToday ? "Today's food" : 'Food logged'}</Txt>
      {foodLoading ? (
        <><Skeleton style={{ height: 60, marginBottom: spacing(1) }} /><Skeleton style={{ height: 60, marginBottom: spacing(1) }} /></>
      ) : logs.length === 0 ? (
        <Card><Txt dim size={font.small}>{isToday ? 'Nothing logged yet. Tap “Log food” to scan or add a meal.' : 'No food logged this day.'}</Txt></Card>
      ) : logs.map((l) => (
        <Card key={l.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {l.photo_url ? <MealThumb url={l.photo_url} /> : null}
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Txt weight="700">{l.name}</Txt>
            <Txt dim size={font.tiny}>P {Math.round(l.protein_g)}g · C {Math.round(l.carbs_g)}g · F {Math.round(l.fat_g)}g</Txt>
          </View>
          <Txt weight="800" style={{ color: colors.primary, marginRight: 6 }}>{Math.round(l.calories)}</Txt>
          {isToday ? <TouchableOpacity onPress={() => deleteFood(l)} style={{ padding: 8 }}><Txt size={15} style={{ color: colors.danger }}>🗑</Txt></TouchableOpacity> : null}
        </Card>
      ))}

      {/* ---- My diet plan (shown directly) ---- */}
      <Txt size={font.h3} weight="800" style={{ marginTop: spacing(2.5), marginBottom: spacing(1) }}>🥗 My diet plan</Txt>

      {plans.length > 0 ? (
        <>
          {plans.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(1) }}>
              {plans.map((pl, i) => (
                <TouchableOpacity key={i} onPress={() => setSelected(i)}
                  style={{ paddingHorizontal: spacing(2), paddingVertical: 10, borderRadius: radius.pill, marginRight: 8, backgroundColor: i === selected ? colors.primary : colors.card, borderWidth: 1, borderColor: i === selected ? colors.primary : colors.border }}>
                  <Txt weight="700" size={font.small} style={{ color: i === selected ? '#fff' : colors.textDim }}>{pl.title || `Plan ${i + 1}`}</Txt>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Card style={{ borderColor: colors.primary }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt weight="800" size={font.h3} style={{ flex: 1 }}>{plan.title || 'Diet Plan'}</Txt>
              {plan.estimated_cost ? (
                <View style={{ backgroundColor: colors.accent + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
                  <Txt size={font.small} weight="700" style={{ color: colors.accent }}>{plan.estimated_cost}</Txt>
                </View>
              ) : null}
            </View>
            {plan.summary ? <Txt dim size={font.small} style={{ marginTop: 4 }}>{plan.summary}</Txt> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1.5) }}>
              <Macro label="kcal" value={plan.daily_calories} color={colors.primary} />
              <Macro label="Protein" value={`${plan.protein_g}g`} color={colors.protein} />
              <Macro label="Carbs" value={`${plan.carbs_g}g`} color={colors.carbs} />
              <Macro label="Fat" value={`${plan.fat_g}g`} color={colors.fat} />
            </View>
          </Card>

          {plan.meals?.map((meal: any, i: number) => (
            <Card key={i}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt weight="700">{meal.name}{meal.time ? ` · ${meal.time}` : ''}</Txt>
                <Txt weight="700" style={{ color: colors.primary }}>{meal.calories} kcal</Txt>
              </View>
              {meal.items?.map((it: string, j: number) => (<Txt key={j} dim size={font.small} style={{ marginTop: 4 }}>• {it}</Txt>))}
            </Card>
          ))}

          {plan.tips?.length ? (
            <Card>
              <Txt weight="700" style={{ marginBottom: 6 }}>Coach tips</Txt>
              {plan.tips.map((t: string, i: number) => (<Txt key={i} dim size={font.small} style={{ marginTop: 4 }}>✓ {t}</Txt>))}
            </Card>
          ) : null}

          {/* Create / edit */}
          <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1) }}>
            <Button title="✏️ Edit plan" variant="ghost" onPress={() => navigation.navigate('DietBuilder', { id: planId, plan })} style={{ flex: 1 }} />
            <Button title="🔄 New plan" loading={loading} onPress={choosePlan} style={{ flex: 1 }} />
          </View>
          <Button title="🔔 Set meal reminders" variant="ghost" onPress={() => useThisPlan(plan)} style={{ marginTop: spacing(1) }} />
        </>
      ) : (
        <Card style={{ alignItems: 'center', paddingVertical: spacing(2.5) }}>
          <Txt size={30}>🍽️</Txt>
          <Txt weight="800" size={font.h3} style={{ marginTop: spacing(1) }}>No diet plan yet</Txt>
          <Txt dim size={font.small} style={{ marginTop: 6, textAlign: 'center', maxWidth: 260 }}>Create a meal plan built for your goal — AI-personalised, a free ready-made one, or build your own.</Txt>
          <Button title="✨ Create my plan" loading={loading} onPress={choosePlan} style={{ marginTop: spacing(2), alignSelf: 'stretch' }} />
        </Card>
      )}

      <View style={{ height: spacing(4) }} />
    </KeyboardScroll>
  );
}

function Macro({ label, value, color }: any) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt weight="800" size={font.h3} style={{ color }}>{value}</Txt>
      <Txt dim size={font.tiny}>{label}</Txt>
    </View>
  );
}

function Bar({ value, max, color }: { value: number; max?: number; color: string }) {
  const pct = max ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.cardAlt, marginTop: spacing(1), overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

function MiniMacro({ label, v, t, color }: { label: string; v: number; t?: number; color: string }) {
  const pct = t ? Math.max(0, Math.min(1, v / t)) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt size={font.tiny} weight="700" dim>{label}</Txt>
        <Txt size={font.tiny} weight="800">{Math.round(v)}{t ? `/${t}` : ''}g</Txt>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: color }} />
      </View>
    </View>
  );
}

function MealThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<any>(null);
  useEffect(() => { mealPhotoSource(url).then(setSrc).catch(() => {}); }, [url]);
  if (!src) return <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.cardAlt, marginRight: 10 }} />;
  return <Image source={src} style={{ width: 44, height: 44, borderRadius: 8, marginRight: 10, backgroundColor: colors.cardAlt }} />;
}
