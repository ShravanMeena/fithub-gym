import React, { useEffect, useState } from 'react';
import { View, Alert, TouchableOpacity } from 'react-native';
import { Card, Txt, Field, Button, Pill } from '../components/UI';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { Avatar } from '../components/Avatar';
import { ProfileAPI, apiError } from '../api/client';
import { scanOrUpload } from '../utils/imagePicker';
import { useAuth } from '../context/AuthContext';
import { colors, font, spacing } from '../theme';

const GOALS = [
  ['lose_fat', 'Lose Fat'],
  ['build_muscle', 'Build Muscle'],
  ['gain_weight', 'Weight Gain'],
  ['recomp', 'Recomp'],
  ['maintain', 'Maintain'],
];
const ACTIVITY = [
  ['sedentary', 'Sedentary'],
  ['light', 'Light'],
  ['moderate', 'Moderate'],
  ['active', 'Active'],
  ['very_active', 'Very Active'],
];
const GENDER = [['male', 'Male'], ['female', 'Female'], ['other', 'Other']];
const DIET = [['nonveg', 'Non-veg'], ['veg', 'Veg'], ['vegan', 'Vegan'], ['eggetarian', 'Eggetarian']];

// Height unit helpers (backend always stores cm).
const cmToFtIn = (cm: number) => {
  const totalIn = cm / 2.54;
  return { ft: Math.floor(totalIn / 12), inch: Math.round(totalIn % 12) };
};
const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * 2.54);

export default function ProfileScreen() {
  const { user } = useAuth();
  const [p, setP] = useState<any>({});
  const [targets, setTargets] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [hasAvatar, setHasAvatar] = useState(false);
  const [avatarV, setAvatarV] = useState(0); // bump to force avatar reload after upload

  useEffect(() => {
    ProfileAPI.get().then(({ profile, targets, avatar }) => {
      setP(profile || {});
      setTargets(targets);
      setHasAvatar(!!avatar);
      if (profile?.height_cm) {
        const c = cmToFtIn(profile.height_cm);
        setFt(String(c.ft)); setInch(String(c.inch));
      }
    }).catch(() => {});
  }, []);

  const changePhoto = () => {
    scanOrUpload(async (a) => {
      try {
        await ProfileAPI.uploadAvatar(a.base64!, a.type || 'image/jpeg');
        setHasAvatar(true); setAvatarV((v) => v + 1);
      } catch (e) { Alert.alert('Upload failed', apiError(e)); }
    });
  };

  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));

  // Keep height_cm in sync when entering feet/inches.
  const onFtIn = (f: string, i: string) => {
    setFt(f); setInch(i);
    const fn = Number(f) || 0, inn = Number(i) || 0;
    if (fn || inn) set('height_cm', ftInToCm(fn, inn));
  };

  const save = async () => {
    setLoading(true);
    try {
      const patch: any = {
        gender: p.gender, goal: p.goal, activity_level: p.activity_level, diet_pref: p.diet_pref,
        allergies: p.allergies || undefined,
        phone: p.phone || undefined,
        age: p.age ? Number(p.age) : undefined,
        height_cm: p.height_cm ? Number(p.height_cm) : undefined,
        weight_kg: p.weight_kg ? Number(p.weight_kg) : undefined,
        target_weight_kg: p.target_weight_kg ? Number(p.target_weight_kg) : undefined,
      };
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
      const res = await ProfileAPI.update(patch);
      setTargets(res.targets);
      Alert.alert('Saved', 'Your profile and targets are updated.');
    } catch (e) {
      Alert.alert('Error', apiError(e));
    } finally {
      setLoading(false);
    }
  };

  const PillRow = ({ options, value, onSelect }: any) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
      {options.map(([val, label]: any) => (
        <Pill key={val} label={label} active={value === val} onPress={() => onSelect(val)} />
      ))}
    </View>
  );

  return (
    <KeyboardScroll
      style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      {/* Profile photo */}
      <View style={{ alignItems: 'center', marginBottom: spacing(2) }}>
        <TouchableOpacity onPress={changePhoto}>
          <Avatar key={avatarV} version={avatarV} userId={user?.id} name={user?.name} hasAvatar={hasAvatar} size={92} />
          <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primary, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg }}>
            <Txt size={15}>📷</Txt>
          </View>
        </TouchableOpacity>
        <Txt weight="800" size={font.h3} style={{ marginTop: spacing(1) }}>{user?.name}</Txt>
        <TouchableOpacity onPress={changePhoto}><Txt size={font.small} weight="700" style={{ color: colors.primary }}>Change photo</Txt></TouchableOpacity>
      </View>

      {targets && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt dim size={font.small} weight="700" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Your daily targets</Txt>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1) }}>
            <Stat label="Calories" value={`${targets.calories}`} color={colors.primary} />
            <Stat label="Protein" value={`${targets.protein_g}g`} color={colors.protein} />
            <Stat label="Carbs" value={`${targets.carbs_g}g`} color={colors.carbs} />
            <Stat label="Fat" value={`${targets.fat_g}g`} color={colors.fat} />
          </View>
        </Card>
      )}

      <Field label="Phone number" keyboardType="phone-pad" value={p.phone || ''} onChangeText={(v) => set('phone', v)} placeholder="9876543210" />

      <Txt weight="700" style={{ marginBottom: 6 }}>Gender</Txt>
      <PillRow options={GENDER} value={p.gender} onSelect={(v: string) => set('gender', v)} />

      <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
        <View style={{ flex: 1 }}><Field label="Age" keyboardType="numeric" value={p.age ? String(p.age) : ''} onChangeText={(v) => set('age', v)} placeholder="28" /></View>
        <View style={{ flex: 1 }} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Txt dim size={font.small}>Height</Txt>
        <View style={{ flexDirection: 'row' }}>
          <Pill label="cm" active={heightUnit === 'cm'} onPress={() => setHeightUnit('cm')} />
          <Pill label="ft / in" active={heightUnit === 'ft'} onPress={() => setHeightUnit('ft')} />
        </View>
      </View>
      {heightUnit === 'cm' ? (
        <Field keyboardType="numeric" value={p.height_cm ? String(p.height_cm) : ''} onChangeText={(v) => set('height_cm', v)} placeholder="178 cm" />
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Field keyboardType="numeric" value={ft} onChangeText={(v) => onFtIn(v, inch)} placeholder="5 ft" /></View>
          <View style={{ flex: 1 }}><Field keyboardType="numeric" value={inch} onChangeText={(v) => onFtIn(ft, v)} placeholder="10 in" /></View>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
        <View style={{ flex: 1 }}><Field label="Weight (kg)" keyboardType="numeric" value={p.weight_kg ? String(p.weight_kg) : ''} onChangeText={(v) => set('weight_kg', v)} placeholder="80" /></View>
        <View style={{ flex: 1 }}><Field label="Target weight (kg)" keyboardType="numeric" value={p.target_weight_kg ? String(p.target_weight_kg) : ''} onChangeText={(v) => set('target_weight_kg', v)} placeholder="75" /></View>
      </View>

      <Txt weight="700" style={{ marginBottom: 6 }}>Goal</Txt>
      <PillRow options={GOALS} value={p.goal} onSelect={(v: string) => set('goal', v)} />

      <Txt weight="700" style={{ marginBottom: 6 }}>Activity level</Txt>
      <PillRow options={ACTIVITY} value={p.activity_level} onSelect={(v: string) => set('activity_level', v)} />

      <Txt weight="700" style={{ marginBottom: 6 }}>Diet preference</Txt>
      <PillRow options={DIET} value={p.diet_pref} onSelect={(v: string) => set('diet_pref', v)} />

      <Field label="Allergies / dislikes" value={p.allergies || ''} onChangeText={(v) => set('allergies', v)} placeholder="e.g. lactose, peanuts" />

      <Button title="Save Profile" loading={loading} onPress={save} style={{ marginTop: spacing(1) }} />
      <View style={{ height: spacing(4) }} />
    </KeyboardScroll>
  );
}

function Stat({ label, value, color }: any) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt weight="800" size={font.h3} style={{ color }}>{value}</Txt>
      <Txt dim size={font.tiny}>{label}</Txt>
    </View>
  );
}
