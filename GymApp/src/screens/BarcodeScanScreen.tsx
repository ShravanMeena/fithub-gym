import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, TouchableWithoutFeedback, Keyboard, ActivityIndicator, Linking } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { Card, Txt, Button, Field } from '../components/UI';
import { FoodAPI, apiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

type Found = {
  name: string;
  per100g: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  serving: null | { size: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };
};

export default function BarcodeScanScreen({ navigation }: any) {
  const isFocused = useIsFocused();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [scanning, setScanning] = useState(true);
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<'serving' | 'grams'>('serving');
  const [qty, setQty] = useState('1');
  const [grams, setGrams] = useState('100');
  const [logging, setLogging] = useState(false);
  const lastCode = useRef<string>('');
  const busy = useRef(false);

  // Ask for camera permission once when the screen opens.
  useEffect(() => { if (!hasPermission) requestPermission(); }, [hasPermission, requestPermission]);

  const lookup = useCallback(async (code: string) => {
    if (busy.current || !code || code === lastCode.current) return;
    busy.current = true;
    lastCode.current = code;
    setScanning(false);
    setLooking(true);
    setNotFound(false);
    try {
      const r = await FoodAPI.barcode(code);
      if (!r.found) setNotFound(true);
      else { setFound(r); setMode(r.serving ? 'serving' : 'grams'); }
    } catch (e) {
      Alert.alert('Lookup failed', apiError(e));
      setNotFound(true);
    } finally { setLooking(false); busy.current = false; }
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-e', 'code-128'],
    onCodeScanned: (codes) => {
      const v = codes[0]?.value;
      if (v) lookup(v.replace(/[^0-9]/g, ''));
    },
  });

  const rescan = () => {
    setFound(null); setNotFound(false); lastCode.current = ''; setQty('1'); setGrams('100'); setScanning(true);
  };

  const computed = (() => {
    if (!found) return null;
    if (mode === 'serving' && found.serving) {
      const n = Math.max(0.25, parseFloat(qty) || 1);
      const s = found.serving;
      return { calories: s.calories * n, protein_g: s.protein_g * n, carbs_g: s.carbs_g * n, fat_g: s.fat_g * n, label: `${n} × ${s.size}` };
    }
    const g = Math.max(1, parseFloat(grams) || 100);
    const p = found.per100g;
    const f = g / 100;
    return { calories: p.calories * f, protein_g: p.protein_g * f, carbs_g: p.carbs_g * f, fat_g: p.fat_g * f, label: `${g} g` };
  })();

  const log = async () => {
    if (!found || !computed) return;
    setLogging(true);
    try {
      await FoodAPI.log({
        name: `${found.name} (${computed.label})`,
        calories: Math.round(computed.calories),
        protein_g: Math.round(computed.protein_g),
        carbs_g: Math.round(computed.carbs_g),
        fat_g: Math.round(computed.fat_g),
        source: 'barcode',
      });
      Alert.alert('Logged!', `${found.name} added to today.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) { Alert.alert('Error', apiError(e)); }
    finally { setLogging(false); }
  };

  // ---- Result sheet ----
  if (found && computed) {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2), justifyContent: 'center' }}>
        <Card style={{ borderColor: colors.primary }}>
          <Txt dim size={font.tiny} weight="800" style={{ letterSpacing: 1 }}>📷 SCANNED</Txt>
          <Txt weight="800" size={font.h3} style={{ marginTop: 4 }}>{found.name}</Txt>

          <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 4, marginTop: spacing(1.5) }}>
            {found.serving ? <Toggle label="Servings" active={mode === 'serving'} onPress={() => setMode('serving')} /> : null}
            <Toggle label="Grams" active={mode === 'grams'} onPress={() => setMode('grams')} />
          </View>

          <View style={{ marginTop: spacing(1.5) }}>
            {mode === 'serving' && found.serving ? (
              <>
                <Txt dim size={font.small} style={{ marginBottom: 6 }}>How many servings? ({found.serving.size})</Txt>
                <Field value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="1" />
              </>
            ) : (
              <>
                <Txt dim size={font.small} style={{ marginBottom: 6 }}>How many grams?</Txt>
                <Field value={grams} onChangeText={setGrams} keyboardType="numeric" placeholder="100" />
              </>
            )}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(2) }}>
            <Macro label="kcal" value={Math.round(computed.calories)} color={colors.primary} />
            <Macro label="Protein" value={`${Math.round(computed.protein_g)}g`} color={colors.protein} />
            <Macro label="Carbs" value={`${Math.round(computed.carbs_g)}g`} color={colors.carbs} />
            <Macro label="Fat" value={`${Math.round(computed.fat_g)}g`} color={colors.fat} />
          </View>
        </Card>

        <Button title="✅ Log this" loading={logging} onPress={log} style={{ marginTop: spacing(1) }} />
        <Button title="📷 Scan another" variant="ghost" onPress={rescan} style={{ marginTop: spacing(1) }} />
      </View>
      </TouchableWithoutFeedback>
    );
  }

  // ---- Not found ----
  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2), justifyContent: 'center' }}>
        <Card>
          <Txt weight="800" size={font.h3}>Not in the database 🤔</Txt>
          <Txt dim style={{ marginTop: 6 }}>This barcode isn’t in Open Food Facts yet. Try scanning again, or add it with the AI photo scan or Quick add.</Txt>
        </Card>
        <Button title="📷 Try again" onPress={rescan} style={{ marginTop: spacing(1) }} />
        <Button title="✍️ Log it another way" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: spacing(1) }} />
      </View>
    );
  }

  // ---- No camera hardware / module not in this build ----
  if (!device) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2), justifyContent: 'center' }}>
        <Card>
          <Txt weight="800" size={font.h3}>Camera unavailable</Txt>
          <Txt dim style={{ marginTop: 6 }}>No camera was found on this device (or the app needs the latest build). Log this food with the AI photo scan or Quick add instead.</Txt>
        </Card>
        <Button title="✍️ Log it another way" onPress={() => navigation.goBack()} style={{ marginTop: spacing(1) }} />
      </View>
    );
  }

  // ---- Needs camera permission ----
  if (!hasPermission) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2), justifyContent: 'center' }}>
        <Card>
          <Txt weight="800" size={font.h3}>Allow camera access 📷</Txt>
          <Txt dim style={{ marginTop: 6 }}>FitHub needs your camera to scan barcodes.</Txt>
        </Card>
        <Button title="Allow camera" onPress={requestPermission} style={{ marginTop: spacing(1) }} />
        <Button title="Open Settings" variant="ghost" onPress={() => Linking.openSettings()} style={{ marginTop: spacing(1) }} />
      </View>
    );
  }

  // ---- Live scanner ----
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={scanning && isFocused && !found && !notFound}
        codeScanner={codeScanner}
      />

      {/* framing box */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '72%', height: 150, borderWidth: 3, borderColor: colors.primary, borderRadius: 16, backgroundColor: '#0000' }} />
      </View>

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: spacing(2), paddingTop: spacing(4) }}>
        <Txt weight="800" size={font.h3} style={{ color: '#fff', textAlign: 'center' }}>Scan a barcode</Txt>
        <Txt style={{ color: '#fff9', textAlign: 'center', marginTop: 4 }}>Line up a packaged food’s barcode</Txt>
      </View>

      {looking && (
        <View style={{ position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#000a', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill }}>
            <ActivityIndicator color="#fff" />
            <Txt style={{ color: '#fff', marginLeft: 8 }} weight="700">Looking it up…</Txt>
          </View>
        </View>
      )}
    </View>
  );
}

function Toggle({ label, active, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flex: 1, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: active ? colors.primary : 'transparent', alignItems: 'center' }}>
      <Txt weight="800" size={font.small} style={{ color: active ? '#fff' : colors.textDim }}>{label}</Txt>
    </TouchableOpacity>
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
