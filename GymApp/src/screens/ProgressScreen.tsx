import React, { useCallback, useState } from 'react';
import { ScrollView, View, Alert, Image, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Field, Button, Pill } from '../components/UI';
import { ProgressAPI, PhotoAPI, authedImageSource, apiError } from '../api/client';
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
      const { entries } = await ProgressAPI.list();
      setEntries(entries);
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

  const maxW = Math.max(...weights.map((w) => w.weight_kg), 1);
  const minW = Math.min(...weights.map((w) => w.weight_kg), maxW);
  const range = Math.max(1, maxW - minW);

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

      {/* Simple bar sparkline of weight history */}
      {weights.length > 1 && (
        <Card>
          <Txt weight="700" style={{ marginBottom: spacing(1) }}>Weight trend</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4 }}>
            {weights.slice(-20).map((w, i) => {
              const h = 20 + ((w.weight_kg - minW) / range) * 70;
              return <View key={i} style={{ flex: 1, height: h, backgroundColor: colors.primary, borderRadius: 3, opacity: 0.5 + (i / 40) }} />;
            })}
          </View>
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
