import React, { useState } from 'react';
import { ScrollView, View, Image, Alert } from 'react-native';
import { Asset } from 'react-native-image-picker';
import { Card, Txt, Button, Field } from '../components/UI';
import { FoodAPI, apiError } from '../api/client';
import { scanOrUpload } from '../utils/imagePicker';
import { useBilling } from '../context/BillingContext';
import { colors, font, radius, spacing } from '../theme';

export default function FoodScanScreen({ navigation }: any) {
  const { aiActive, showPaywall } = useBilling();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [desc, setDesc] = useState('');
  const [source, setSource] = useState<'photo' | 'manual'>('photo');

  const addPhoto = () => {
    if (!aiActive) { showPaywall('Food calorie scanning'); return; }
    scanOrUpload((a) => {
      setAsset(a);
      setEstimate(null);
      setSource('photo');
      analyze(a);
    });
  };

  const analyze = async (a: Asset) => {
    setAnalyzing(true);
    try {
      const { estimate } = await FoodAPI.estimate(a.base64!, a.type || 'image/jpeg');
      setEstimate(estimate);
    } catch (e) {
      Alert.alert('Analysis failed', apiError(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeText = async () => {
    if (!aiActive) { showPaywall('Food calorie scanning'); return; }
    if (desc.trim().length < 2) return Alert.alert('Describe your meal', 'e.g. 2 eggs and butter roti');
    setAnalyzing(true);
    setAsset(null);
    setEstimate(null);
    setSource('manual');
    try {
      const { estimate } = await FoodAPI.estimateText(desc.trim());
      setEstimate(estimate);
    } catch (e) {
      Alert.alert('Analysis failed', apiError(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const logMeal = async () => {
    if (!estimate) return;
    setLogging(true);
    try {
      await FoodAPI.log({
        name: estimate.name,
        calories: estimate.calories,
        protein_g: estimate.protein_g,
        carbs_g: estimate.carbs_g,
        fat_g: estimate.fat_g,
        items: estimate.items,
        source,
      });
      Alert.alert('Logged!', `${estimate.name} added to today.`, [
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ]);
      setAsset(null);
      setEstimate(null);
      setDesc('');
    } catch (e) {
      Alert.alert('Error', apiError(e));
    } finally {
      setLogging(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Scan Your Meal</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Snap a photo — AI estimates calories & macros.</Txt>

      <Button title="📷 Scan or Upload Meal" onPress={addPhoto} />
      <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: 6 }}>Take a photo or pick one from your gallery</Txt>

      {/* OR divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing(2) }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Txt dim size={font.small} style={{ marginHorizontal: spacing(1.5) }}>OR type it</Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <Card>
        <Txt weight="700" style={{ marginBottom: 8 }}>No photo? Just describe your meal ✍️</Txt>
        <Field
          value={desc}
          onChangeText={setDesc}
          placeholder="e.g. 2 eggs and butter roti with a glass of milk"
          multiline
          style={{ height: 80, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <Button title="✨ Estimate from Text" loading={analyzing && source === 'manual'} onPress={analyzeText} />
      </Card>

      {asset?.uri && (
        <Image source={{ uri: asset.uri }} style={{ width: '100%', height: 240, borderRadius: radius.md, marginTop: spacing(2) }} />
      )}

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
            {estimate.confidence ? <Txt dim size={font.tiny}>confidence: {estimate.confidence}</Txt> : null}
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
              {estimate.warnings.map((w: string, i: number) => (
                <Txt key={i} size={font.small} style={{ marginTop: 4 }}>{w}</Txt>
              ))}
              <Txt dim size={font.tiny} style={{ marginTop: 8 }}>You can still log it — just keep your daily totals in mind.</Txt>
            </Card>
          ) : null}

          {estimate.items?.length ? (
            <Card>
              <Txt weight="700" style={{ marginBottom: 6 }}>Detected items</Txt>
              {estimate.items.map((it: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Txt dim size={font.small} style={{ flex: 1 }}>{it.name}</Txt>
                  <Txt size={font.small}>{Math.round(it.calories)} kcal</Txt>
                </View>
              ))}
            </Card>
          ) : null}

          <Button title="✅ Log this meal" loading={logging} onPress={logMeal} />
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
