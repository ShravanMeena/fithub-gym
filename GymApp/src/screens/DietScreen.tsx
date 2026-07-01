import React, { useCallback, useState } from 'react';
import { ScrollView, View, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button, Field, Pill } from '../components/UI';
import { TimeField } from '../components/TimeField';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { DietAPI, ProfileAPI, ReminderAPI, apiError } from '../api/client';
import { scheduleReminder, ensureNotifPermission } from '../notifications';
import { useBilling } from '../context/BillingContext';
import { colors, font, radius, spacing } from '../theme';

function toPlans(plan: any): any[] {
  if (!plan) return [];
  if (Array.isArray(plan.plans)) return plan.plans;
  return [plan];
}

const GYM_SLOTS = [
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
  ['anytime', 'Anytime'],
];

export default function DietScreen({ navigation }: any) {
  const { aiActive, showPaywall } = useBilling();
  const [plans, setPlans] = useState<any[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // schedule preferences
  const [wake, setWake] = useState('07:00');
  const [sleep, setSleep] = useState('23:00');
  const [gym, setGym] = useState('evening');
  const [meals, setMeals] = useState(4);

  const load = useCallback(async () => {
    try {
      const [{ plan }, { profile }] = await Promise.all([DietAPI.current(), ProfileAPI.get()]);
      setPlans(toPlans(plan));
      setSelected(0);
      if (profile?.wake_time) setWake(profile.wake_time);
      if (profile?.sleep_time) setSleep(profile.sleep_time);
      if (profile?.gym_time) setGym(profile.gym_time);
      if (profile?.meals_per_day) setMeals(profile.meals_per_day);
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const savePrefs = () => ProfileAPI.update({ wake_time: wake, sleep_time: sleep, gym_time: gym, meals_per_day: meals });

  const generateAI = async () => {
    if (!aiActive) { showPaywall('AI Diet Plan'); return; }
    setLoading(true);
    try {
      await savePrefs();
      const { plan } = await DietAPI.generate();
      setPlans(toPlans(plan)); setSelected(0);
    } catch (e: any) {
      if (e?.response?.status === 402) showPaywall('AI Diet Plan');
      else Alert.alert('Could not generate', apiError(e));
    } finally {
      setLoading(false);
    }
  };

  const generateNormal = async () => {
    setLoading(true);
    try {
      await savePrefs();
      const { plan } = await DietAPI.normal();
      setPlans(toPlans(plan)); setSelected(0);
    } catch (e) {
      Alert.alert('Could not load plan', apiError(e));
    } finally {
      setLoading(false);
    }
  };

  const choosePlan = () => {
    Alert.alert(
      'Choose your plan',
      'Free ready-made plans, or an AI plan personalised to your schedule & goal.',
      [
        { text: '✨ AI personalised (premium)', onPress: generateAI },
        { text: 'Free ready-made plan', onPress: generateNormal },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Create a reminder for each meal in the chosen plan, at its time.
  const addRemindersForPlan = async (plan: any) => {
    const meals = (plan.meals || []).filter((m: any) => /^\d{1,2}:\d{2}$/.test(m.time || ''));
    if (meals.length === 0) return Alert.alert('No meal times', 'This plan has no usable meal times.');
    await ensureNotifPermission();
    let count = 0;
    for (const m of meals) {
      const [h, min] = m.time.split(':').map(Number);
      try {
        const { reminder } = await ReminderAPI.create({
          title: m.name,
          body: `Time for ${m.name} 🍽️ (${plan.title})`,
          hour: h,
          minute: min,
          enabled: true,
        });
        await scheduleReminder(reminder);
        count++;
      } catch { /* skip one */ }
    }
    Alert.alert('Reminders added ✅', `${count} meal reminders set. Manage them under ⏰ Reminders.`, [
      { text: 'View Reminders', onPress: () => navigation.navigate('Reminders') },
      { text: 'OK' },
    ]);
  };

  const useThisPlan = (plan: any) => {
    Alert.alert(
      `Use "${plan.title}"?`,
      `Add ${(plan.meals || []).length} meal reminders at this plan's times (${(plan.meals || [])
        .map((m: any) => m.time)
        .join(', ')})?`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Add reminders', onPress: () => addRemindersForPlan(plan) },
      ]
    );
  };

  const plan = plans[selected];

  return (
    <KeyboardScroll
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>

      <Txt size={font.h2} weight="800">Your Diet Plan</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>A full day of meals with calories & macros for your goal — fitted around your routine.</Txt>

      {/* Schedule questionnaire */}
      <Card>
        <Txt weight="700" style={{ marginBottom: spacing(1) }}>Your daily routine ⏰</Txt>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><TimeField label="Wake up" value={wake || '07:00'} onChange={setWake} /></View>
          <View style={{ flex: 1 }}><TimeField label="Sleep" value={sleep || '23:00'} onChange={setSleep} /></View>
        </View>

        <Txt dim size={font.small} style={{ marginBottom: 6 }}>Gym time</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
          {GYM_SLOTS.map(([val, label]) => (
            <Pill key={val} label={label} active={gym === val} onPress={() => setGym(val)} />
          ))}
        </View>

        <Txt dim size={font.small} style={{ marginBottom: 6 }}>Meals per day</Txt>
        <View style={{ flexDirection: 'row', marginBottom: spacing(1) }}>
          {[3, 4, 5].map((n) => (
            <Pill key={n} label={`${n} meals`} active={meals === n} onPress={() => setMeals(n)} />
          ))}
        </View>

        <Button title={plans.length ? '🔄 New Plan' : '✨ Get My Plan'} loading={loading} onPress={choosePlan} />
        <Button title="Edit full profile" variant="ghost" onPress={() => navigation.navigate('Profile')} style={{ marginTop: spacing(1) }} />
      </Card>

      {plans.length > 0 && (
        <>
          {/* Plan selector tabs */}
          {plans.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing(1) }}>
              {plans.map((pl, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setSelected(i)}
                  style={{
                    paddingHorizontal: spacing(2), paddingVertical: 10, borderRadius: radius.pill, marginRight: 8,
                    backgroundColor: i === selected ? colors.primary : colors.card,
                    borderWidth: 1, borderColor: i === selected ? colors.primary : colors.border,
                  }}>
                  <Txt weight="700" size={font.small} style={{ color: i === selected ? '#fff' : colors.textDim }}>
                    {pl.title || `Plan ${i + 1}`}
                  </Txt>
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
              {meal.items?.map((it: string, j: number) => (
                <Txt key={j} dim size={font.small} style={{ marginTop: 4 }}>• {it}</Txt>
              ))}
            </Card>
          ))}

          {plan.tips?.length ? (
            <Card>
              <Txt weight="700" style={{ marginBottom: 6 }}>Coach tips</Txt>
              {plan.tips.map((t: string, i: number) => (
                <Txt key={i} dim size={font.small} style={{ marginTop: 4 }}>✓ {t}</Txt>
              ))}
            </Card>
          ) : null}

          {/* Select + set reminders */}
          <Button title={`✅ Use "${plan.title}" & set reminders`} onPress={() => useThisPlan(plan)} style={{ marginTop: spacing(1) }} />
        </>
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
