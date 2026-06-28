// "My Progress" — track your body transformation. Goal progress, weight,
// body measurements (the scale lies, inches don't), before/after photos, and an
// optional AI review. Clear and useful for everyone — exercises live in Train.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Alert, Image, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Field, Button, Pill } from '../components/UI';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { LineChart } from '../components/Charts';
import { ProgressAPI, PhotoAPI, ProfileAPI, authedImageSource, apiError } from '../api/client';
import { scanOrUpload } from '../utils/imagePicker';
import { useBilling } from '../context/BillingContext';
import { colors, font, radius, spacing } from '../theme';

const GOAL_LABEL: Record<string, string> = {
  lose_fat: 'Lose fat', lose_weight: 'Lose weight', build_muscle: 'Build muscle',
  gain_weight: 'Gain weight', recomp: 'Recomp', maintain: 'Stay fit',
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export default function ProgressScreen() {
  const { aiActive, showPaywall } = useBilling();
  const [entries, setEntries] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  // Log form
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [arms, setArms] = useState('');
  const [showMeasure, setShowMeasure] = useState(false);
  const [saving, setSaving] = useState(false);

  // Photos
  const [photos, setPhotos] = useState<any[]>([]);
  const [sources, setSources] = useState<Record<number, any>>({});
  const [uploadPublic, setUploadPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const loadPhotos = useCallback(async () => {
    try {
      const { photos } = await PhotoAPI.list();
      setPhotos(photos);
      const srcMap: Record<number, any> = {};
      await Promise.all(photos.map(async (p: any) => { srcMap[p.id] = await authedImageSource(p.url); }));
      setSources(srcMap);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const [{ entries }, prof] = await Promise.all([ProgressAPI.list(), ProfileAPI.get().catch(() => null)]);
      setEntries(entries);
      setProfile(prof?.profile || null);
      await loadPhotos();
    } catch (e) { Alert.alert('Error', apiError(e)); }
  }, [loadPhotos]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!weight && !bodyFat && !waist && !chest && !arms) return Alert.alert('Nothing to log', 'Enter at least your weight.');
    setSaving(true);
    try {
      await ProgressAPI.add({
        weight_kg: weight ? Number(weight) : undefined,
        body_fat: bodyFat ? Number(bodyFat) : undefined,
        waist_cm: waist ? Number(waist) : undefined,
        chest_cm: chest ? Number(chest) : undefined,
        arms_cm: arms ? Number(arms) : undefined,
      });
      setWeight(''); setBodyFat(''); setWaist(''); setChest(''); setArms('');
      await load();
      Alert.alert('Logged ✅', 'Your progress is saved. Keep it up!');
    } catch (e) { Alert.alert('Error', apiError(e)); }
    finally { setSaving(false); }
  };

  const addPhoto = () => {
    scanOrUpload(async (a) => {
      setUploading(true);
      try {
        await PhotoAPI.upload(a.base64!, uploadPublic ? 'public' : 'private', a.type || 'image/jpeg', weight ? Number(weight) : undefined);
        await loadPhotos();
      } catch (e) { Alert.alert('Upload failed', apiError(e)); }
      finally { setUploading(false); }
    });
  };
  const toggleVisibility = async (p: any) => { try { await PhotoAPI.setVisibility(p.id, p.visibility === 'public' ? 'private' : 'public'); await loadPhotos(); } catch {} };
  const deletePhoto = async (p: any) => { try { await PhotoAPI.remove(p.id); await loadPhotos(); } catch {} };

  const analyze = async () => {
    if (!aiActive) { showPaywall('AI Progress Review'); return; }
    setAnalyzing(true); setAnalysis(null);
    try { setAnalysis((await PhotoAPI.analyze()).analysis); }
    catch (e: any) { if (e?.response?.status === 402) showPaywall('AI Progress Review'); else Alert.alert('Analyze failed', apiError(e)); }
    finally { setAnalyzing(false); }
  };

  // ---- derived ----
  const weights = entries.filter((e) => e.weight_kg != null);
  const startW = weights[0]?.weight_kg;
  const nowW = weights[weights.length - 1]?.weight_kg;
  const goalW = profile?.target_weight_kg;
  const goalLabel = profile?.goal ? GOAL_LABEL[profile.goal] || 'Your goal' : null;
  const wChange = startW != null && nowW != null ? nowW - startW : null;

  let pct: number | null = null, remaining: number | null = null;
  if (startW != null && nowW != null && goalW != null && startW !== goalW) {
    pct = clamp((startW - nowW) / (startW - goalW));
    remaining = nowW - goalW;
  }

  const waists = entries.filter((e) => e.waist_cm != null);
  const startWaist = waists[0]?.waist_cm;
  const nowWaist = waists[waists.length - 1]?.waist_cm;
  const waistChange = startWaist != null && nowWaist != null ? nowWaist - startWaist : null;
  const latest = entries[entries.length - 1] || {};

  return (
    <KeyboardScroll style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">My Progress</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Track your transformation — weight, measurements & photos.</Txt>

      {/* Goal progress */}
      {goalW != null && nowW != null ? (
        <Card style={{ borderColor: colors.primary }}>
          <Txt size={font.small} dim weight="800" style={{ letterSpacing: 1 }}>YOUR GOAL{goalLabel ? ` · ${goalLabel.toUpperCase()}` : ''}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
            <Txt size={font.h1} weight="900">{nowW}</Txt>
            <Txt dim weight="700"> kg now · goal {goalW} kg</Txt>
          </View>
          {/* progress bar */}
          <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.cardAlt, marginTop: spacing(1.5), overflow: 'hidden' }}>
            <View style={{ width: `${Math.round((pct ?? 0) * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Txt dim size={font.tiny}>start {startW}kg</Txt>
            <Txt size={font.tiny} weight="800" style={{ color: colors.accent }}>
              {remaining != null && Math.abs(remaining) < 0.5 ? '🎯 Goal reached!' : `${Math.abs(remaining ?? 0).toFixed(1)}kg to ${(remaining ?? 0) > 0 ? 'lose' : 'gain'}`}
            </Txt>
          </View>
        </Card>
      ) : (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="800">Set a goal to track progress 🎯</Txt>
          <Txt dim size={font.small} style={{ marginTop: 4 }}>Add your target weight in Profile, then log your weight here to watch yourself get closer every week.</Txt>
        </Card>
      )}

      {/* At a glance */}
      {(wChange != null || waistChange != null) && (
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          {wChange != null && (
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Txt size={font.h2} weight="900" style={{ color: wChange <= 0 ? colors.accent : colors.carbs }}>{wChange > 0 ? '+' : ''}{wChange.toFixed(1)}</Txt>
              <Txt dim size={font.tiny}>kg change</Txt>
            </Card>
          )}
          {waistChange != null && (
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Txt size={font.h2} weight="900" style={{ color: waistChange <= 0 ? colors.accent : colors.carbs }}>{waistChange > 0 ? '+' : ''}{waistChange.toFixed(1)}</Txt>
              <Txt dim size={font.tiny}>cm waist</Txt>
            </Card>
          )}
        </View>
      )}

      {/* Log form */}
      <Card>
        <Txt weight="800" style={{ marginBottom: spacing(1) }}>📋 Log today's progress</Txt>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Field label="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} placeholder="78" /></View>
          <View style={{ flex: 1 }}><Field label="Body fat % (optional)" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} placeholder="18" /></View>
        </View>

        <TouchableOpacity onPress={() => setShowMeasure((v) => !v)} style={{ paddingVertical: 6 }}>
          <Txt size={font.small} weight="700" style={{ color: colors.accent }}>{showMeasure ? '− Hide body measurements' : '＋ Add body measurements (waist, chest, arms)'}</Txt>
        </TouchableOpacity>
        {showMeasure && (
          <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
            <View style={{ flex: 1 }}><Field label="Waist (cm)" keyboardType="numeric" value={waist} onChangeText={setWaist} placeholder="84" /></View>
            <View style={{ flex: 1 }}><Field label="Chest (cm)" keyboardType="numeric" value={chest} onChangeText={setChest} placeholder="100" /></View>
            <View style={{ flex: 1 }}><Field label="Arms (cm)" keyboardType="numeric" value={arms} onChangeText={setArms} placeholder="36" /></View>
          </View>
        )}
        <Button title="＋ Save entry" loading={saving} onPress={add} />
        <Txt dim size={font.tiny} style={{ marginTop: 8, textAlign: 'center' }}>Tip: log once a week, same time of day, for the clearest trend.</Txt>
      </Card>

      {/* Weight chart */}
      {weights.length > 1 && (
        <Card>
          <Txt weight="700" style={{ marginBottom: spacing(1) }}>⚖️ Weight over time</Txt>
          <LineChart values={weights.slice(-30).map((w) => w.weight_kg)} goal={goalW} unit="kg" />
        </Card>
      )}

      {/* Measurements */}
      {(waists.length > 0 || latest.waist_cm != null) && (
        <Card>
          <Txt weight="700" style={{ marginBottom: spacing(1) }}>📏 Body measurements</Txt>
          {waists.length > 1 ? (
            <LineChart values={waists.slice(-30).map((w) => w.waist_cm)} unit="cm" color={colors.accent} />
          ) : (
            <Txt dim size={font.small}>Log waist a few times to see the trend — the scale can stall while inches still drop.</Txt>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing(1.5) }}>
            <Stat label="Waist" value={latest.waist_cm} />
            <Stat label="Chest" value={latest.chest_cm} />
            <Stat label="Arms" value={latest.arms_cm} />
          </View>
        </Card>
      )}

      {/* Progress photos */}
      <Txt size={font.h3} weight="700" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>📸 Progress Photos</Txt>
      <Card>
        <Txt dim size={font.small} style={{ marginBottom: spacing(1.5) }}>Pictures show what the scale can't. Add a photo every few weeks and watch your transformation.</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(1) }}>
          <Txt dim size={font.small}>New photo is:</Txt>
          <View style={{ flexDirection: 'row' }}>
            <Pill label="🔒 Private" active={!uploadPublic} onPress={() => setUploadPublic(false)} />
            <Pill label="🌍 Public" active={uploadPublic} onPress={() => setUploadPublic(true)} />
          </View>
        </View>
        <Button title="📸 Add a Photo" loading={uploading} onPress={addPhoto} />

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing(1.5) }}>
            {photos.map((p) => (
              <View key={p.id} style={{ marginRight: 10 }}>
                {sources[p.id] ? (
                  <Image source={sources[p.id]} style={{ width: 110, height: 150, borderRadius: radius.sm, backgroundColor: colors.cardAlt }} />
                ) : <View style={{ width: 110, height: 150, borderRadius: radius.sm, backgroundColor: colors.cardAlt }} />}
                <Txt dim size={font.tiny} style={{ marginTop: 4 }}>{p.taken_at?.slice(0, 10)}</Txt>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <TouchableOpacity onPress={() => toggleVisibility(p)}><Txt size={font.tiny} style={{ color: p.visibility === 'public' ? colors.accent : colors.textDim }}>{p.visibility === 'public' ? '🌍' : '🔒'}</Txt></TouchableOpacity>
                  <TouchableOpacity onPress={() => deletePhoto(p)}><Txt size={font.tiny} style={{ color: colors.danger }}>Delete</Txt></TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </Card>

      {/* AI review */}
      <Card style={{ borderColor: colors.primary, backgroundColor: colors.primary + '0c' }}>
        <Txt weight="800">✨ AI Progress Review</Txt>
        <Txt dim size={font.small} style={{ marginTop: 2, marginBottom: spacing(1.5) }}>
          Get a personalised read on your progress photos & numbers — what's working and exactly what to do next.
        </Txt>
        <Button title={analyzing ? 'Analyzing…' : '🤖 Review my progress'} loading={analyzing} onPress={analyze} disabled={photos.length === 0} />
        {photos.length === 0 && <Txt dim size={font.tiny} style={{ marginTop: 6, textAlign: 'center' }}>Add a progress photo first</Txt>}
      </Card>

      {analysis && (
        <Card style={{ borderColor: colors.accent }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Txt weight="800">Verdict: </Txt>
            <Txt weight="800" style={{ color: analysis.verdict === 'needs_adjustment' ? colors.carbs : colors.accent, textTransform: 'capitalize' }}>
              {String(analysis.verdict || '').replace('_', ' ')}
            </Txt>
          </View>
          <Txt style={{ lineHeight: 22 }}>{analysis.message}</Txt>
          {analysis.action_items?.length ? (
            <View style={{ marginTop: spacing(1) }}>
              <Txt weight="700" size={font.small}>Do this next</Txt>
              {analysis.action_items.map((a: string, i: number) => <Txt key={i} size={font.small} style={{ marginTop: 3, color: colors.accent }}>→ {a}</Txt>)}
            </View>
          ) : null}
        </Card>
      )}

      <View style={{ height: spacing(4) }} />
    </KeyboardScroll>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt size={font.h3} weight="800">{value != null ? value : '—'}<Txt dim size={font.tiny}>{value != null ? ' cm' : ''}</Txt></Txt>
      <Txt dim size={font.tiny}>{label}</Txt>
    </View>
  );
}
