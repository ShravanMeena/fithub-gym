// "My Progress" — built for a gym-goer: one clear headline of how much you've
// changed, a big BEFORE / NOW photo comparison, an easy weight log, and the trend.
import React, { useCallback, useRef, useState } from 'react';
import { View, Alert, Image, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { captureRef } from 'react-native-view-shot';
import Share from 'react-native-share';
import { Card, Txt, Field, Button } from '../components/UI';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { LineChart } from '../components/Charts';
import { ShareCard } from '../components/ShareCard';
import { ProgressAPI, PhotoAPI, ProfileAPI, AttendanceAPI, authedImageSource, apiError } from '../api/client';
import { scanOrUpload } from '../utils/imagePicker';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useBilling } from '../context/BillingContext';
import { colors, font, radius, spacing } from '../theme';

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export default function ProgressScreen() {
  const { user } = useAuth();
  const { org } = useOrg();
  const navigation = useNavigation<any>();
  const { aiActive, showPaywall } = useBilling();
  const [entries, setEntries] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [arms, setArms] = useState('');
  const [showMeasure, setShowMeasure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // id of the weigh-in being edited

  const [photos, setPhotos] = useState<any[]>([]);
  const [sources, setSources] = useState<Record<number, any>>({});
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const cardRef = useRef<View>(null);

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
      const [{ entries }, prof, st] = await Promise.all([
        ProgressAPI.list(),
        ProfileAPI.get().catch(() => null),
        AttendanceAPI.stats().catch(() => null),
      ]);
      setEntries(entries);
      setProfile(prof?.profile || null);
      setStats(st);
      await loadPhotos();
    } catch (e) { Alert.alert('Error', apiError(e)); }
  }, [loadPhotos]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const clearForm = () => { setWeight(''); setBodyFat(''); setWaist(''); setChest(''); setArms(''); setEditingId(null); };

  const add = async () => {
    if (!weight && !bodyFat && !waist && !chest && !arms) return Alert.alert('Add your weight', 'Enter at least your weight.');
    setSaving(true);
    try {
      const entry = {
        weight_kg: weight ? Number(weight) : undefined,
        body_fat: bodyFat ? Number(bodyFat) : undefined,
        waist_cm: waist ? Number(waist) : undefined,
        chest_cm: chest ? Number(chest) : undefined,
        arms_cm: arms ? Number(arms) : undefined,
      };
      if (editingId) await ProgressAPI.update(editingId, entry);
      else await ProgressAPI.add(entry);
      clearForm();
      await load();
    } catch (e) { Alert.alert('Error', apiError(e)); }
    finally { setSaving(false); }
  };

  // Load an existing entry into the form to fix it.
  const startEdit = (e: any) => {
    setEditingId(e.id);
    setWeight(e.weight_kg != null ? String(e.weight_kg) : '');
    setBodyFat(e.body_fat != null ? String(e.body_fat) : '');
    setWaist(e.waist_cm != null ? String(e.waist_cm) : '');
    setChest(e.chest_cm != null ? String(e.chest_cm) : '');
    setArms(e.arms_cm != null ? String(e.arms_cm) : '');
    if (e.waist_cm != null || e.chest_cm != null || e.arms_cm != null || e.body_fat != null) setShowMeasure(true);
  };

  const del = (e: any) => {
    Alert.alert('Delete this entry?', 'Remove this weigh-in permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setEntries((prev) => prev.filter((x) => x.id !== e.id)); // instant
          try { await ProgressAPI.remove(e.id); } catch {}
          if (editingId === e.id) clearForm();
          load();
        },
      },
    ]);
  };

  const addPhoto = () => {
    scanOrUpload(async (a) => {
      setUploading(true);
      try {
        await PhotoAPI.upload(a.base64!, 'private', a.type || 'image/jpeg', weight ? Number(weight) : undefined);
        await loadPhotos();
      } catch (e) { Alert.alert('Upload failed', apiError(e)); }
      finally { setUploading(false); }
    });
  };
  const deletePhoto = (p: any) => {
    Alert.alert('Delete photo?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await PhotoAPI.remove(p.id); await loadPhotos(); } catch {} } },
    ]);
  };

  const analyze = async () => {
    if (!aiActive) { showPaywall('AI Progress Review'); return; }
    setAnalyzing(true); setAnalysis(null);
    try { setAnalysis((await PhotoAPI.analyze()).analysis); }
    catch (e: any) { if (e?.response?.status === 402) showPaywall('AI Progress Review'); else Alert.alert('Analyze failed', apiError(e)); }
    finally { setAnalyzing(false); }
  };

  const onShare = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Share.open({ url: uri.startsWith('file://') ? uri : `file://${uri}`, type: 'image/png', failOnCancel: false, message: `My fitness progress on FitHub 💪${org?.name ? ` · ${org.name}` : ''}` });
    } catch {}
  };

  // ---- derived ----
  const weights = entries.filter((e) => e.weight_kg != null);
  const startW = weights[0]?.weight_kg;
  const nowW = weights[weights.length - 1]?.weight_kg;
  const goalW = profile?.target_weight_kg;
  const wChange = startW != null && nowW != null ? nowW - startW : null;

  const wantLose = profile?.goal === 'lose_fat' || profile?.goal === 'lose_weight';
  const wantGain = profile?.goal === 'build_muscle' || profile?.goal === 'gain_weight';
  const down = wChange != null && wChange < -0.05;
  const up = wChange != null && wChange > 0.05;
  const good = (down && wantLose) || (up && wantGain) || (wChange != null && !wantLose && !wantGain);

  let headline = 'Start tracking', sub = 'Log your weight below to see your change over time';
  if (wChange != null && Math.abs(wChange) < 0.05) { headline = 'Holding steady'; sub = `You're at ${nowW} kg`; }
  else if (wChange != null) { headline = `${down ? '▼' : '▲'} ${Math.abs(wChange).toFixed(1)} kg`; sub = `${startW} kg → ${nowW} kg since you started`; }

  let pct: number | null = null, remaining: number | null = null;
  if (startW != null && nowW != null && goalW != null && startW !== goalW) {
    pct = clamp((startW - nowW) / (startW - goalW));
    remaining = nowW - goalW;
  }

  const sortedPhotos = [...photos].sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)));
  const before = sortedPhotos[0];
  const after = sortedPhotos[sortedPhotos.length - 1];
  const daysSincePhoto = after?.taken_at ? Math.floor((Date.now() - new Date(after.taken_at).getTime()) / 86400000) : null;
  const photoNudge = photos.length === 0 || (daysSincePhoto != null && daysSincePhoto >= 14);
  const waists = entries.filter((e) => e.waist_cm != null);
  const latest = entries[entries.length - 1] || {};
  const streak = stats?.streak || 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardScroll style={{ flex: 1 }} contentContainerStyle={{ padding: spacing(2) }}>
        {/* 1) Transformation headline */}
        <Card style={{ backgroundColor: '#0E1016', borderColor: colors.primary, alignItems: 'center' }}>
          <Txt size={font.tiny} weight="800" style={{ color: colors.textDim, letterSpacing: 1 }}>YOUR TRANSFORMATION</Txt>
          <Txt size={44} weight="900" style={{ color: wChange == null ? '#fff' : good ? colors.accent : colors.primary, marginTop: 6 }}>{headline}</Txt>
          <Txt dim size={font.small} style={{ textAlign: 'center', marginTop: 2 }}>{sub}</Txt>
          {goalW != null && nowW != null && (
            <View style={{ width: '100%', marginTop: spacing(2) }}>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: '#22252E', overflow: 'hidden' }}>
                <View style={{ width: `${Math.round((pct ?? 0) * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Txt size={font.tiny} style={{ color: colors.textDim }}>now {nowW}kg</Txt>
                <Txt size={font.tiny} weight="800" style={{ color: colors.accent }}>
                  {remaining != null && Math.abs(remaining) < 0.5 ? '🎯 Goal reached!' : `${Math.abs(remaining ?? 0).toFixed(1)}kg to goal (${goalW})`}
                </Txt>
              </View>
            </View>
          )}
        </Card>

        {/* 2) Log weight — always easy (also edits when fixing an entry) */}
        <Card style={editingId ? { borderColor: colors.primary } : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
            <Txt weight="800">{editingId ? '✏️ Edit this weigh-in' : '⚖️ Log your weight'}</Txt>
            {editingId ? <TouchableOpacity onPress={clearForm}><Txt size={font.small} weight="700" style={{ color: colors.textDim }}>Cancel</Txt></TouchableOpacity> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing(1), alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} placeholder="78" /></View>
            <Button title={editingId ? 'Update' : 'Log'} loading={saving} onPress={add} style={{ paddingHorizontal: spacing(3), marginBottom: 2 }} />
          </View>
          <TouchableOpacity onPress={() => setShowMeasure((v) => !v)} style={{ paddingVertical: 4 }}>
            <Txt size={font.small} weight="700" style={{ color: colors.accent }}>{showMeasure ? '− Hide extras' : '＋ Body fat & measurements (waist, chest, arms)'}</Txt>
          </TouchableOpacity>
          {showMeasure && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
              <View style={{ flex: 1, minWidth: '45%' }}><Field label="Body fat %" keyboardType="numeric" value={bodyFat} onChangeText={setBodyFat} placeholder="18" /></View>
              <View style={{ flex: 1, minWidth: '45%' }}><Field label="Waist (cm)" keyboardType="numeric" value={waist} onChangeText={setWaist} placeholder="84" /></View>
              <View style={{ flex: 1, minWidth: '45%' }}><Field label="Chest (cm)" keyboardType="numeric" value={chest} onChangeText={setChest} placeholder="100" /></View>
              <View style={{ flex: 1, minWidth: '45%' }}><Field label="Arms (cm)" keyboardType="numeric" value={arms} onChangeText={setArms} placeholder="36" /></View>
            </View>
          )}
        </Card>

        {/* Your weigh-ins — tap ✏️ to fix a wrong entry, 🗑 to remove */}
        {entries.length > 0 && (
          <Card>
            <Txt weight="800" style={{ marginBottom: spacing(0.5) }}>📋 Your weigh-ins</Txt>
            {[...entries].reverse().slice(0, 12).map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">{e.weight_kg != null ? `${e.weight_kg} kg` : '—'}
                    {(e.waist_cm != null || e.chest_cm != null || e.arms_cm != null) ? (
                      <Txt dim size={font.tiny}>  ·  {[e.waist_cm && `W ${e.waist_cm}`, e.chest_cm && `C ${e.chest_cm}`, e.arms_cm && `A ${e.arms_cm}`].filter(Boolean).join(' · ')}</Txt>
                    ) : null}
                  </Txt>
                  <Txt dim size={font.tiny}>{String(e.logged_at || '').slice(0, 10)}</Txt>
                </View>
                <TouchableOpacity onPress={() => startEdit(e)} style={{ padding: 8 }}><Txt size={16}>✏️</Txt></TouchableOpacity>
                <TouchableOpacity onPress={() => del(e)} style={{ padding: 8 }}><Txt size={15} style={{ color: colors.danger }}>🗑</Txt></TouchableOpacity>
              </View>
            ))}
          </Card>
        )}

        {/* 3) Before / Now — the star */}
        <Txt size={font.h3} weight="800" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>📸 Before / Now</Txt>
        <Card>
          {photos.length >= 2 ? (
            <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
              <PhotoBox label="BEFORE" tint="#555" photo={before} src={sources[before?.id]} onDelete={() => deletePhoto(before)} />
              <PhotoBox label="NOW" tint={colors.primary} photo={after} src={sources[after?.id]} onDelete={() => deletePhoto(after)} />
            </View>
          ) : photos.length === 1 ? (
            <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
              <PhotoBox label="YOUR START" tint={colors.primary} photo={before} src={sources[before?.id]} onDelete={() => deletePhoto(before)} />
              <View style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: spacing(1) }}>
                <Txt size={26}>📅</Txt>
                <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: 6 }}>Add another in a few weeks to see the change</Txt>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: spacing(1.5) }}>
              <Txt size={32}>📸</Txt>
              <Txt weight="800" style={{ marginTop: 6 }}>Take your first photo today</Txt>
              <Txt dim size={font.small} style={{ textAlign: 'center', marginTop: 4 }}>Photos show what the scale can't. This one becomes your "before".</Txt>
            </View>
          )}
          <Button title={uploading ? 'Uploading…' : '📸 Add a photo'} loading={uploading} onPress={addPhoto} style={{ marginTop: spacing(1.5) }} />
          <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: 6 }}>🔒 Private to you unless you post it in Community.</Txt>
        </Card>

        {/* Photo nudge */}
        {photoNudge && photos.length > 0 && (
          <Card style={{ borderColor: colors.primary, backgroundColor: colors.primary + '0e' }}>
            <Txt weight="800">📸 Time for a new progress photo</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>It's been {daysSincePhoto} days. Keep your record so you can *see* how far you've come.</Txt>
          </Card>
        )}

        {/* Photo timeline — swipe through all your photos over time */}
        {photos.length > 2 && (
          <Card>
            <Txt weight="800" style={{ marginBottom: spacing(1) }}>🗓️ Your timeline</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {sortedPhotos.map((p) => (
                <View key={p.id} style={{ marginRight: 8, alignItems: 'center' }}>
                  {sources[p.id] ? (
                    <Image source={sources[p.id]} style={{ width: 84, height: 112, borderRadius: radius.sm, backgroundColor: colors.cardAlt }} />
                  ) : <View style={{ width: 84, height: 112, borderRadius: radius.sm, backgroundColor: colors.cardAlt }} />}
                  <Txt dim size={font.tiny} style={{ marginTop: 4 }}>{p.taken_at?.slice(5, 10)}</Txt>
                </View>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Badges preview */}
        <Card onPress={() => navigation.navigate('Badges')} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="800">🏅 Your badges</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>See what you've unlocked →</Txt>
          </View>
          <Txt size={22}>›</Txt>
        </Card>

        {/* 4) Weight trend */}
        {weights.length > 1 && (
          <Card>
            <Txt weight="800" style={{ marginBottom: spacing(1) }}>📈 Weight over time</Txt>
            <LineChart values={weights.slice(-30).map((w) => w.weight_kg)} goal={goalW} unit="kg" />
          </Card>
        )}

        {/* 5) Measurements (only if logged) */}
        {waists.length > 0 && (
          <Card>
            <Txt weight="800" style={{ marginBottom: spacing(1) }}>📏 Measurements</Txt>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <Stat label="Waist" value={latest.waist_cm} />
              <Stat label="Chest" value={latest.chest_cm} />
              <Stat label="Arms" value={latest.arms_cm} />
            </View>
          </Card>
        )}

        {/* Share */}
        <Button title="📤 Share my progress" variant="ghost" onPress={onShare} style={{ marginTop: spacing(1) }} />

        {/* AI review */}
        <Card style={{ borderColor: colors.primary, backgroundColor: colors.primary + '0c', marginTop: spacing(1) }}>
          <Txt weight="800">✨ AI Progress Review</Txt>
          <Txt dim size={font.small} style={{ marginTop: 2, marginBottom: spacing(1.5) }}>A personalised read on your photos & numbers — what's working and what to do next.</Txt>
          <Button title={analyzing ? 'Analyzing…' : '🤖 Review my progress'} loading={analyzing} onPress={analyze} disabled={photos.length === 0} />
          {photos.length === 0 && <Txt dim size={font.tiny} style={{ marginTop: 6, textAlign: 'center' }}>Add a progress photo first</Txt>}
        </Card>

        {analysis && (
          <Card style={{ borderColor: colors.accent }}>
            <Txt weight="800" style={{ textTransform: 'capitalize', color: analysis.verdict === 'needs_adjustment' ? colors.carbs : colors.accent }}>{String(analysis.verdict || '').replace('_', ' ')}</Txt>
            <Txt style={{ lineHeight: 22, marginTop: 4 }}>{analysis.message}</Txt>
            {analysis.action_items?.length ? (
              <View style={{ marginTop: spacing(1) }}>
                {analysis.action_items.map((a: string, i: number) => <Txt key={i} size={font.small} style={{ marginTop: 3, color: colors.accent }}>→ {a}</Txt>)}
              </View>
            ) : null}
          </Card>
        )}

        <View style={{ height: spacing(4) }} />
      </KeyboardScroll>

      <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none">
        <ShareCard ref={cardRef} name={user?.name || 'Me'} gym={org?.name} streak={streak} longest={stats?.longest || 0} monthCheckins={weights.length} weightChange={wChange} />
      </View>
    </View>
  );
}

function PhotoBox({ label, tint, photo, src, onDelete }: { label: string; tint: string; photo: any; src: any; onDelete: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.cardAlt }}>
        {src ? <Image source={src} style={{ width: '100%', height: '100%' }} /> : null}
        <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: tint, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
          <Txt size={font.tiny} weight="800" style={{ color: '#fff' }}>{label}</Txt>
        </View>
        <TouchableOpacity onPress={onDelete} style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#000a', borderRadius: 999, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={12} style={{ color: '#fff' }}>✕</Txt>
        </TouchableOpacity>
      </View>
      <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: 4 }}>{photo?.taken_at?.slice(0, 10)}</Txt>
    </View>
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
