import React, { useCallback, useState } from 'react';
import { ScrollView, View, Alert, Image, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Field, Button, Pill } from '../components/UI';
import { LineChart } from '../components/Charts';
import { ProgressAPI, PhotoAPI, ProfileAPI, WorkoutAPI, authedImageSource, apiError } from '../api/client';
import { scanOrUpload } from '../utils/imagePicker';
import { useBilling } from '../context/BillingContext';
import { colors, font, radius, spacing } from '../theme';

export default function ProgressScreen() {
  const { aiActive, showPaywall } = useBilling();
  const [entries, setEntries] = useState<any[]>([]);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [strength, setStrength] = useState<any[]>([]);
  const [exercise, setExercise] = useState<string | null>(null);

  // Progress photos
  const [photos, setPhotos] = useState<any[]>([]);
  const [sources, setSources] = useState<Record<number, any>>({});
  const [uploadPublic, setUploadPublic] = useState(false); // default private
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const loadPhotos = useCallback(async () => {
    try {
      const { photos } = await PhotoAPI.list();
      setPhotos(photos);
      // resolve authed image sources for each
      const srcMap: Record<number, any> = {};
      await Promise.all(
        photos.map(async (p: any) => { srcMap[p.id] = await authedImageSource(p.url); })
      );
      setSources(srcMap);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const [{ entries }, prof, str] = await Promise.all([
        ProgressAPI.list(),
        ProfileAPI.get().catch(() => null),
        WorkoutAPI.strength().catch(() => ({ series: [] })),
      ]);
      setEntries(entries);
      setTargetWeight(prof?.profile?.target_weight_kg ?? null);
      const series = (str?.series || []).filter((s: any) => s.points.length >= 2);
      setStrength(series);
      setExercise((cur) => cur && series.some((s: any) => s.exercise === cur) ? cur : series[0]?.exercise ?? null);
      await loadPhotos();
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  }, [loadPhotos]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addProgressPhoto = () => {
    scanOrUpload(async (a) => {
      setUploading(true);
      try {
        await PhotoAPI.upload(a.base64!, uploadPublic ? 'public' : 'private', a.type || 'image/jpeg', weight ? Number(weight) : undefined);
        await loadPhotos();
      } catch (e) {
        Alert.alert('Upload failed', apiError(e));
      } finally {
        setUploading(false);
      }
    });
  };

  const toggleVisibility = async (p: any) => {
    try {
      await PhotoAPI.setVisibility(p.id, p.visibility === 'public' ? 'private' : 'public');
      await loadPhotos();
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  };

  const deletePhoto = async (p: any) => {
    try { await PhotoAPI.remove(p.id); await loadPhotos(); } catch (e) { Alert.alert('Error', apiError(e)); }
  };

  const analyze = async () => {
    if (!aiActive) { showPaywall('AI Progress Analysis'); return; }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const { analysis } = await PhotoAPI.analyze();
      setAnalysis(analysis);
    } catch (e: any) {
      if (e?.response?.status === 402) showPaywall('AI Progress Analysis');
      else Alert.alert('Analyze failed', apiError(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const add = async () => {
    if (!weight && !bodyFat) return Alert.alert('Nothing to log', 'Enter weight or body fat.');
    setSaving(true);
    try {
      await ProgressAPI.add({
        weight_kg: weight ? Number(weight) : undefined,
        body_fat: bodyFat ? Number(bodyFat) : undefined,
        note: note || undefined,
      });
      setWeight(''); setBodyFat(''); setNote('');
      await load();
    } catch (e) {
      Alert.alert('Error', apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const weights = entries.filter((e) => e.weight_kg != null);
  const first = weights[0];
  const last = weights[weights.length - 1];
  const delta = first && last ? (last.weight_kg - first.weight_kg) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Progress</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Log your weight & body fat over time.</Txt>

      <Card>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Field label="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} placeholder="80" /></View>
          <View style={{ flex: 1 }}><Field label="Body fat (%)" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} placeholder="18" /></View>
        </View>
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Felt strong today" />
        <Button title="＋ Add entry" loading={saving} onPress={add} />
      </Card>

      {delta !== null && (
        <Card style={{ borderColor: delta <= 0 ? colors.accent : colors.carbs }}>
          <Txt dim size={font.small}>Total change</Txt>
          <Txt size={font.h2} weight="800" style={{ color: delta <= 0 ? colors.accent : colors.carbs }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
          </Txt>
          <Txt dim size={font.small}>from {first.weight_kg}kg → {last.weight_kg}kg over {weights.length} entries</Txt>
        </Card>
      )}

      {/* Weight trend line chart with goal line */}
      {weights.length > 1 && (
        <Card>
          <Txt weight="700" style={{ marginBottom: spacing(1) }}>Weight trend</Txt>
          <LineChart values={weights.slice(-30).map((w) => w.weight_kg)} goal={targetWeight} unit="kg" />
          {targetWeight != null && last && (
            <Txt dim size={font.tiny} style={{ marginTop: 6 }}>
              {Math.abs(last.weight_kg - targetWeight) < 0.5
                ? '🎯 At your goal weight!'
                : `${Math.abs(last.weight_kg - targetWeight).toFixed(1)}kg ${last.weight_kg > targetWeight ? 'to lose' : 'to gain'} to reach your ${targetWeight}kg goal`}
            </Txt>
          )}
        </Card>
      )}

      {/* Strength progression per exercise (estimated 1RM) */}
      {strength.length > 0 && (
        <Card>
          <Txt weight="700" style={{ marginBottom: spacing(1) }}>Strength progress 💪</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(1) }}>
            {strength.slice(0, 6).map((s) => (
              <Pill key={s.exercise} label={s.exercise} active={exercise === s.exercise} onPress={() => setExercise(s.exercise)} />
            ))}
          </View>
          {(() => {
            const sel = strength.find((s) => s.exercise === exercise);
            if (!sel) return null;
            const first1rm = sel.points[0].est1rm;
            const last1rm = sel.points[sel.points.length - 1].est1rm;
            const gain = last1rm - first1rm;
            return (
              <>
                <LineChart values={sel.points.map((p: any) => p.est1rm)} unit="kg" />
                <Txt dim size={font.tiny} style={{ marginTop: 6 }}>
                  Est. 1-rep max · {gain >= 0 ? '▲' : '▼'} {gain >= 0 ? '+' : ''}{gain}kg over {sel.points.length} sessions
                </Txt>
              </>
            );
          })()}
        </Card>
      )}

      {/* ---- Progress Photos ---- */}
      <Txt size={font.h3} weight="700" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>Progress Photos 📸</Txt>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(1) }}>
          <Txt dim size={font.small}>New upload is:</Txt>
          <View style={{ flexDirection: 'row' }}>
            <Pill label="🔒 Private" active={!uploadPublic} onPress={() => setUploadPublic(false)} />
            <Pill label="🌍 Public" active={uploadPublic} onPress={() => setUploadPublic(true)} />
          </View>
        </View>
        <Button title="📸 Scan or Upload Photo" loading={uploading} onPress={addProgressPhoto} />

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing(1.5) }}>
            {photos.map((p) => (
              <View key={p.id} style={{ marginRight: 10 }}>
                {sources[p.id] ? (
                  <Image source={sources[p.id]} style={{ width: 110, height: 150, borderRadius: radius.sm, backgroundColor: colors.cardAlt }} />
                ) : (
                  <View style={{ width: 110, height: 150, borderRadius: radius.sm, backgroundColor: colors.cardAlt }} />
                )}
                <Txt dim size={font.tiny} style={{ marginTop: 4 }}>{p.taken_at?.slice(0, 10)}</Txt>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <TouchableOpacity onPress={() => toggleVisibility(p)}>
                    <Txt size={font.tiny} style={{ color: p.visibility === 'public' ? colors.accent : colors.textDim }}>
                      {p.visibility === 'public' ? '🌍 Public' : '🔒 Private'}
                    </Txt>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deletePhoto(p)}>
                    <Txt size={font.tiny} style={{ color: colors.danger }}>Delete</Txt>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        <Button
          title={analyzing ? 'Analyzing…' : '🤖 Analyze My Progress'}
          loading={analyzing}
          onPress={analyze}
          style={{ marginTop: spacing(1.5) }}
          disabled={photos.length === 0}
        />
        {photos.length === 0 ? (
          <Txt dim size={font.tiny} style={{ marginTop: 6, textAlign: 'center' }}>Upload a photo to enable AI analysis</Txt>
        ) : null}
      </Card>

      {analysis && (
        <Card style={{ borderColor: colors.primary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Txt weight="800">AI Verdict: </Txt>
            <Txt weight="800" style={{
              color: analysis.verdict === 'needs_adjustment' ? colors.carbs : colors.accent,
              textTransform: 'capitalize',
            }}>{String(analysis.verdict || '').replace('_', ' ')}</Txt>
          </View>
          <Txt style={{ lineHeight: 22 }}>{analysis.message}</Txt>
          {analysis.observations?.length ? (
            <View style={{ marginTop: spacing(1) }}>
              <Txt weight="700" size={font.small}>What I see</Txt>
              {analysis.observations.map((o: string, i: number) => (
                <Txt key={i} dim size={font.small} style={{ marginTop: 3 }}>• {o}</Txt>
              ))}
            </View>
          ) : null}
          {analysis.action_items?.length ? (
            <View style={{ marginTop: spacing(1) }}>
              <Txt weight="700" size={font.small}>Do this next</Txt>
              {analysis.action_items.map((a: string, i: number) => (
                <Txt key={i} size={font.small} style={{ marginTop: 3, color: colors.accent }}>→ {a}</Txt>
              ))}
            </View>
          ) : null}
        </Card>
      )}

      <Txt size={font.h3} weight="700" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>History</Txt>
      {entries.length === 0 ? (
        <Card><Txt dim>No entries yet.</Txt></Card>
      ) : (
        [...entries].reverse().map((e) => (
          <Card key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Txt weight="600">{e.weight_kg != null ? `${e.weight_kg} kg` : ''}{e.body_fat != null ? `  ·  ${e.body_fat}% bf` : ''}</Txt>
              {e.note ? <Txt dim size={font.small}>{e.note}</Txt> : null}
            </View>
            <Txt dim size={font.tiny}>{e.logged_at?.slice(0, 10)}</Txt>
          </Card>
        ))
      )}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
