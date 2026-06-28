import React, { useCallback, useState } from 'react';
import { ScrollView, View, Image, Alert, TouchableOpacity, ToastAndroid, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Asset } from 'react-native-image-picker';
import { Card, Txt, Button, Field } from '../components/UI';
import { FoodAPI, apiError } from '../api/client';
import { scanOrUpload } from '../utils/imagePicker';
import { useBilling } from '../context/BillingContext';
import { FOODS, Food } from '../data/foods';
import { colors, font, radius, spacing } from '../theme';

const toast = (msg: string) =>
  Platform.OS === 'android' ? ToastAndroid.show(msg, ToastAndroid.SHORT) : Alert.alert('', msg);

export default function FoodScanScreen({ navigation }: any) {
  const { aiActive, showPaywall } = useBilling();
  const [mode, setMode] = useState<'quick' | 'ai'>('quick');

  // Quick-add (free)
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<any[]>([]);

  // AI scan
  const [asset, setAsset] = useState<Asset | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [desc, setDesc] = useState('');
  const [source, setSource] = useState<'photo' | 'manual'>('photo');

  const loadRecent = useCallback(() => { FoodAPI.recent().then((r) => setRecent(r.recent || [])).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { loadRecent(); }, [loadRecent]));

  // ---- Quick add (free) ----
  const quickLog = async (f: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }) => {
    try {
      await FoodAPI.log({ name: f.name, calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, source: 'manual' });
      toast(`✅ ${f.name} logged`);
      loadRecent();
    } catch (e) { Alert.alert('Error', apiError(e)); }
  };

  const filtered: Food[] = search.trim()
    ? FOODS.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : FOODS;

  // ---- AI scan ----
  const addPhoto = () => {
    if (!aiActive) { showPaywall('AI food scanning'); return; }
    scanOrUpload((a) => { setAsset(a); setEstimate(null); setSource('photo'); analyze(a); });
  };
  const analyze = async (a: Asset) => {
    setAnalyzing(true);
    try { setEstimate((await FoodAPI.estimate(a.base64!, a.type || 'image/jpeg')).estimate); }
    catch (e) { Alert.alert('Analysis failed', apiError(e)); }
    finally { setAnalyzing(false); }
  };
  const analyzeText = async () => {
    if (!aiActive) { showPaywall('AI food scanning'); return; }
    if (desc.trim().length < 2) return Alert.alert('Describe your meal', 'e.g. 2 eggs and butter roti');
    setAnalyzing(true); setAsset(null); setEstimate(null); setSource('manual');
    try { setEstimate((await FoodAPI.estimateText(desc.trim())).estimate); }
    catch (e) { Alert.alert('Analysis failed', apiError(e)); }
    finally { setAnalyzing(false); }
  };
  const logMeal = async () => {
    if (!estimate) return;
    setLogging(true);
    try {
      await FoodAPI.log({ name: estimate.name, calories: estimate.calories, protein_g: estimate.protein_g, carbs_g: estimate.carbs_g, fat_g: estimate.fat_g, items: estimate.items, source });
      Alert.alert('Logged!', `${estimate.name} added to today.`, [{ text: 'OK', onPress: () => navigation.navigate('Today') }]);
      setAsset(null); setEstimate(null); setDesc('');
    } catch (e) { Alert.alert('Error', apiError(e)); }
    finally { setLogging(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }} keyboardShouldPersistTaps="handled">
      <Txt size={font.h2} weight="800">Log a Meal</Txt>
      <Txt dim style={{ marginBottom: spacing(1.5) }}>Quick-add from the list, or scan a photo with AI.</Txt>

      {/* Mode switch */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing(2) }}>
        {([['quick', '🔍 Quick add'], ['ai', '📷 Scan (AI)']] as const).map(([m, label]) => (
          <TouchableOpacity key={m} onPress={() => setMode(m)} style={{ flex: 1, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: mode === m ? colors.primary : 'transparent', alignItems: 'center' }}>
            <Txt weight="800" size={font.small} style={{ color: mode === m ? '#fff' : colors.textDim }}>{label}{m === 'quick' ? '  ·  Free' : ''}</Txt>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'quick' ? (
        <>
          <Field value={search} onChangeText={setSearch} placeholder="🔍 Search foods (roti, rice, egg…)" />

          {recent.length > 0 && !search.trim() && (
            <>
              <Txt dim size={font.small} weight="800" style={{ marginBottom: 8 }}>RECENT — tap to re-log</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing(2) }}>
                {recent.map((f, i) => (
                  <TouchableOpacity key={i} onPress={() => quickLog(f)} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}>
                    <Txt size={font.small} weight="700">{f.name} <Txt dim size={font.tiny}>{Math.round(f.calories)}</Txt></Txt>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Txt dim size={font.small} weight="800" style={{ marginBottom: 8 }}>{search.trim() ? 'RESULTS' : 'COMMON FOODS'}</Txt>
          {filtered.map((f) => (
            <Card key={f.name} onPress={() => quickLog(f)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1.5) }}>
              <View style={{ flex: 1 }}>
                <Txt weight="700">{f.name}</Txt>
                <Txt dim size={font.tiny}>{f.serving} · P{f.protein_g} C{f.carbs_g} F{f.fat_g}</Txt>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Txt weight="800" style={{ color: colors.primary, marginRight: 10 }}>{f.calories}</Txt>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt weight="900" style={{ color: '#fff' }}>＋</Txt>
                </View>
              </View>
            </Card>
          ))}
          {filtered.length === 0 && <Txt dim>No match. Try the AI scan for anything 👆</Txt>}
        </>
      ) : (
        <>
          {!aiActive && (
            <Card style={{ borderColor: colors.primary, backgroundColor: colors.primary + '12' }}>
              <Txt weight="800">✨ AI Scan is a premium feature</Txt>
              <Txt dim size={font.small} style={{ marginTop: 2 }}>Snap any meal and get instant calories & macros. Quick add stays free.</Txt>
            </Card>
          )}
          <Button title="📷 Scan or Upload Meal" onPress={addPhoto} />
          <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: 6 }}>Take a photo or pick from your gallery</Txt>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing(2) }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Txt dim size={font.small} style={{ marginHorizontal: spacing(1.5) }}>OR type it</Txt>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          <Card>
            <Txt weight="700" style={{ marginBottom: 8 }}>Describe your meal ✍️</Txt>
            <Field value={desc} onChangeText={setDesc} placeholder="e.g. 2 eggs and butter roti with milk" multiline style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }} />
            <Button title="✨ Estimate from Text" loading={analyzing && source === 'manual'} onPress={analyzeText} />
          </Card>

          {asset?.uri && <Image source={{ uri: asset.uri }} style={{ width: '100%', height: 240, borderRadius: radius.md, marginTop: spacing(2) }} />}

          {analyzing && (
            <Card style={{ marginTop: spacing(2), alignItems: 'center' }}>
              <Txt weight="700" style={{ color: colors.primary }}>Analyzing your meal…</Txt>
              <Txt dim size={font.small} style={{ marginTop: 4 }}>Identifying foods and portions</Txt>
            </Card>
          )}

          {estimate && (
            <>
              <Card style={{ marginTop: spacing(2), borderColor: colors.primary }}>
                <Txt weight="800" size={font.h3}>{estimate.name}</Txt>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1.5) }}>
                  <Macro label="kcal" value={Math.round(estimate.calories)} color={colors.primary} />
                  <Macro label="Protein" value={`${Math.round(estimate.protein_g)}g`} color={colors.protein} />
                  <Macro label="Carbs" value={`${Math.round(estimate.carbs_g)}g`} color={colors.carbs} />
                  <Macro label="Fat" value={`${Math.round(estimate.fat_g)}g`} color={colors.fat} />
                  {estimate.sugar_g != null ? <Macro label="Sugar" value={`${Math.round(estimate.sugar_g)}g`} color={colors.danger} /> : null}
                </View>
              </Card>
              {estimate.warnings?.length ? (
                <Card style={{ borderColor: colors.carbs, backgroundColor: colors.carbs + '14' }}>
                  <Txt weight="800" style={{ color: colors.carbs, marginBottom: 4 }}>Heads up ⚠️</Txt>
                  {estimate.warnings.map((w: string, i: number) => <Txt key={i} size={font.small} style={{ marginTop: 4 }}>{w}</Txt>)}
                </Card>
              ) : null}
              <Button title="✅ Log this meal" loading={logging} onPress={logMeal} />
            </>
          )}
        </>
      )}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
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
