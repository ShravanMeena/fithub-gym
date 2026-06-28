// First-launch guided setup. Turns a blank app into a personal one: pick a
// goal, enter basic stats, and we compute daily targets + unlock the plan.
import React, { useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { Card, Txt, Field, Button, Pill } from '../components/UI';
import { ProfileAPI, apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, font, radius, spacing } from '../theme';

const GOALS: [string, string, string][] = [
  ['lose_fat', '🔥 Lose fat', 'Lean out, drop weight'],
  ['build_muscle', '💪 Build muscle', 'Get stronger & bigger'],
  ['gain_weight', '⚖️ Gain weight', 'Add size on a budget'],
  ['maintain', '🧘 Stay fit', 'Maintain & stay healthy'],
];
const GENDER = [['male', 'Male'], ['female', 'Female'], ['other', 'Other']];
const ACTIVITY = [
  ['sedentary', 'Mostly sitting'],
  ['light', 'Lightly active'],
  ['moderate', 'Moderately active'],
  ['active', 'Very active'],
];
const DIET = [['veg', 'Veg'], ['nonveg', 'Non-veg'], ['eggetarian', 'Egg'], ['vegan', 'Vegan']];

const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * 2.54);

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState<any>({ activity_level: 'moderate', diet_pref: 'veg', gender: 'male' });
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));

  const steps = ['Goal', 'About you', 'Lifestyle'];

  const canNext = () => {
    if (step === 0) return !!p.goal;
    if (step === 1) return p.age && (p.height_cm || (ft && unit === 'ft')) && p.weight_kg;
    return true;
  };

  const finish = async () => {
    setSaving(true);
    try {
      const height_cm = unit === 'ft' ? ftInToCm(Number(ft) || 0, Number(inch) || 0) : Number(p.height_cm) || undefined;
      await ProfileAPI.update({
        gender: p.gender, goal: p.goal, activity_level: p.activity_level, diet_pref: p.diet_pref,
        age: Number(p.age) || undefined, height_cm, weight_kg: Number(p.weight_kg) || undefined,
        target_weight_kg: p.target_weight_kg ? Number(p.target_weight_kg) : undefined,
      });
      onDone();
    } catch (e) {
      Alert.alert('Could not save', apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5), paddingTop: spacing(6) }}>
      {/* progress dots */}
      <View style={{ flexDirection: 'row', marginBottom: spacing(2) }}>
        {steps.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, marginRight: i < steps.length - 1 ? 6 : 0, backgroundColor: i <= step ? colors.primary : colors.cardAlt }} />
        ))}
      </View>

      {step === 0 && (
        <>
          <Txt size={font.h1} weight="900">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋</Txt>
          <Txt dim style={{ marginTop: 4, marginBottom: spacing(2) }}>What's your main goal? We'll tailor everything to it.</Txt>
          {GOALS.map(([val, label, sub]) => (
            <Card
              key={val}
              onPress={() => set('goal', val)}
              style={{ borderColor: p.goal === val ? colors.primary : colors.border, borderWidth: p.goal === val ? 2 : 1, marginBottom: spacing(1.5) }}>
              <Txt size={font.h3} weight="800">{label}</Txt>
              <Txt dim size={font.small}>{sub}</Txt>
            </Card>
          ))}
        </>
      )}

      {step === 1 && (
        <>
          <Txt size={font.h1} weight="900">A bit about you</Txt>
          <Txt dim style={{ marginTop: 4, marginBottom: spacing(2) }}>So we can calculate your calories & macros.</Txt>

          <Txt weight="700" style={{ marginBottom: 6 }}>Gender</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1.5) }}>
            {GENDER.map(([v, l]) => <Pill key={v} label={l} active={p.gender === v} onPress={() => set('gender', v)} />)}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
            <View style={{ flex: 1 }}><Field label="Age" keyboardType="numeric" value={p.age ? String(p.age) : ''} onChangeText={(v) => set('age', v)} placeholder="28" /></View>
            <View style={{ flex: 1 }}><Field label="Weight (kg)" keyboardType="numeric" value={p.weight_kg ? String(p.weight_kg) : ''} onChangeText={(v) => set('weight_kg', v)} placeholder="80" /></View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Txt dim size={font.small}>Height</Txt>
            <View style={{ flexDirection: 'row' }}>
              <Pill label="cm" active={unit === 'cm'} onPress={() => setUnit('cm')} />
              <Pill label="ft / in" active={unit === 'ft'} onPress={() => setUnit('ft')} />
            </View>
          </View>
          {unit === 'cm' ? (
            <Field keyboardType="numeric" value={p.height_cm ? String(p.height_cm) : ''} onChangeText={(v) => set('height_cm', v)} placeholder="178 cm" />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
              <View style={{ flex: 1 }}><Field keyboardType="numeric" value={ft} onChangeText={setFt} placeholder="5 ft" /></View>
              <View style={{ flex: 1 }}><Field keyboardType="numeric" value={inch} onChangeText={setInch} placeholder="10 in" /></View>
            </View>
          )}
          <Field label="Target weight (kg) — optional" keyboardType="numeric" value={p.target_weight_kg ? String(p.target_weight_kg) : ''} onChangeText={(v) => set('target_weight_kg', v)} placeholder="75" />
        </>
      )}

      {step === 2 && (
        <>
          <Txt size={font.h1} weight="900">Your lifestyle</Txt>
          <Txt dim style={{ marginTop: 4, marginBottom: spacing(2) }}>Last step — then your plan is ready.</Txt>

          <Txt weight="700" style={{ marginBottom: 6 }}>How active are you?</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1.5) }}>
            {ACTIVITY.map(([v, l]) => <Pill key={v} label={l} active={p.activity_level === v} onPress={() => set('activity_level', v)} />)}
          </View>

          <Txt weight="700" style={{ marginBottom: 6 }}>Diet preference</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1.5) }}>
            {DIET.map(([v, l]) => <Pill key={v} label={l} active={p.diet_pref === v} onPress={() => set('diet_pref', v)} />)}
          </View>

          <Card style={{ backgroundColor: colors.cardAlt, marginTop: spacing(1) }}>
            <Txt weight="700">You're all set 🎉</Txt>
            <Txt dim size={font.small} style={{ marginTop: 4 }}>We'll calculate your daily calories & macros and build your Today plan.</Txt>
          </Card>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(2.5) }}>
        {step > 0 && <Button title="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
        {step < 2 ? (
          <Button title="Continue" onPress={() => canNext() ? setStep((s) => s + 1) : Alert.alert('Fill the details', 'Please complete this step to continue.')} style={{ flex: 2 }} />
        ) : (
          <Button title="🚀 Finish & see my plan" loading={saving} onPress={finish} style={{ flex: 2 }} />
        )}
      </View>
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
