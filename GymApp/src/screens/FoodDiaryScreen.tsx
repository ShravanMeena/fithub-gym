// Food diary — the day-by-day meal history (moved out of the main tabs into the
// sidebar). Browse any day, see what you ate (with photos), re-log, or delete.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Image, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button } from '../components/UI';
import { DateNav, todayStr } from '../components/DateNav';
import { Skeleton } from '../components/Skeleton';
import { FoodAPI, ProfileAPI, mealPhotoSource } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

export default function FoodDiaryScreen({ navigation }: any) {
  const [date, setDate] = useState(todayStr());
  const [logs, setLogs] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [targets, setTargets] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const isToday = date === todayStr();

  const loadFood = useCallback(async () => {
    setLoading(true);
    const d = await FoodAPI.day(isToday ? undefined : date).catch(() => ({ logs: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } }));
    setLogs(d.logs || []);
    setTotals(d.totals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    if (isToday) FoodAPI.recent().then((r) => setRecent(r.recent || [])).catch(() => {});
    setLoading(false);
  }, [date, isToday]);

  useEffect(() => { loadFood(); }, [loadFood]);
  useFocusEffect(useCallback(() => {
    ProfileAPI.get().then((p) => setTargets(p?.targets || null)).catch(() => {});
    loadFood();
  }, [loadFood]));

  const relog = async (f: any) => {
    setTotals((t: any) => ({ calories: t.calories + f.calories, protein_g: t.protein_g + f.protein_g, carbs_g: t.carbs_g + f.carbs_g, fat_g: t.fat_g + f.fat_g }));
    try { await FoodAPI.log({ name: f.name, calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, source: 'relog' }); loadFood(); } catch {}
  };

  const deleteFood = (item: any) => {
    setLogs((prev) => prev.filter((x) => x.id !== item.id));
    setTotals((t: any) => ({
      calories: Math.max(0, t.calories - (item.calories || 0)),
      protein_g: Math.max(0, t.protein_g - (item.protein_g || 0)),
      carbs_g: Math.max(0, t.carbs_g - (item.carbs_g || 0)),
      fat_g: Math.max(0, t.fat_g - (item.fat_g || 0)),
    }));
    FoodAPI.remove(item.id).catch(() => {});
  };

  const kcalLeft = targets ? Math.max(0, Math.round((targets.calories || 0) - totals.calories)) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadFood(); setRefreshing(false); }} tintColor={colors.primary} />}>

      <DateNav date={date} onChange={setDate} />

      {/* Day's nutrition */}
      <Card style={{ borderColor: colors.primary }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt dim size={font.small} weight="800" style={{ letterSpacing: 1 }}>INTAKE</Txt>
          {targets ? <Txt size={font.small} weight="800" style={{ color: kcalLeft <= 0 ? colors.accent : colors.primary }}>{kcalLeft <= 0 ? '🎯 Target hit' : `${kcalLeft} kcal ${isToday ? 'left' : 'under'}`}</Txt> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
          <Txt size={font.h1} weight="900">{Math.round(totals.calories)}</Txt>
          <Txt dim weight="700"> / {targets?.calories ?? '—'} kcal</Txt>
        </View>
        <Bar value={totals.calories} max={targets?.calories} color={colors.primary} />
        <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
          <MiniMacro label="Protein" v={totals.protein_g} t={targets?.protein_g} color={colors.protein} />
          <MiniMacro label="Carbs" v={totals.carbs_g} t={targets?.carbs_g} color={colors.carbs} />
          <MiniMacro label="Fat" v={totals.fat_g} t={targets?.fat_g} color={colors.fat} />
        </View>
        {isToday ? <Button title="📷 Add food" onPress={() => navigation.navigate('Main', { screen: 'Scan' })} style={{ marginTop: spacing(1.5) }} /> : null}
      </Card>

      {/* One-tap re-log of recent foods */}
      {isToday && recent.length > 0 && (
        <View style={{ marginTop: spacing(2) }}>
          <Txt weight="800" style={{ marginBottom: spacing(1) }}>⚡ Log again</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {recent.map((f, i) => (
              <TouchableOpacity key={i} onPress={() => relog(f)}
                style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, maxWidth: 180 }}>
                <Txt weight="700" size={font.small} numberOfLines={1}>＋ {f.name}</Txt>
                <Txt dim size={font.tiny}>{Math.round(f.calories)} kcal · {Math.round(f.protein_g)}g P</Txt>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Txt size={font.h3} weight="800" style={{ marginTop: spacing(2), marginBottom: spacing(1) }}>{isToday ? "Today's food" : 'Food logged'}</Txt>
      {loading ? (
        <>
          <Skeleton style={{ height: 60, marginBottom: spacing(1) }} />
          <Skeleton style={{ height: 60, marginBottom: spacing(1) }} />
        </>
      ) : logs.length === 0 ? (
        <Card><Txt dim size={font.small}>{isToday ? 'Nothing logged yet. Tap “Add food” to scan a meal.' : 'No food logged this day.'}</Txt></Card>
      ) : logs.map((l) => (
        <Card key={l.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {l.photo_url ? <MealThumb url={l.photo_url} /> : null}
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Txt weight="700">{l.name}</Txt>
            <Txt dim size={font.tiny}>P {Math.round(l.protein_g)}g · C {Math.round(l.carbs_g)}g · F {Math.round(l.fat_g)}g</Txt>
          </View>
          <Txt weight="800" style={{ color: colors.primary, marginRight: 6 }}>{Math.round(l.calories)}</Txt>
          {isToday ? <TouchableOpacity onPress={() => deleteFood(l)} style={{ padding: 8 }}><Txt size={15} style={{ color: colors.danger }}>🗑</Txt></TouchableOpacity> : null}
        </Card>
      ))}

      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}

function Bar({ value, max, color }: { value: number; max?: number; color: string }) {
  const pct = max ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.cardAlt, marginTop: spacing(1), overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

function MiniMacro({ label, v, t, color }: { label: string; v: number; t?: number; color: string }) {
  const pct = t ? Math.max(0, Math.min(1, v / t)) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt size={font.tiny} weight="700" dim>{label}</Txt>
        <Txt size={font.tiny} weight="800">{Math.round(v)}{t ? `/${t}` : ''}g</Txt>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: color }} />
      </View>
    </View>
  );
}

function MealThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<any>(null);
  useEffect(() => { mealPhotoSource(url).then(setSrc).catch(() => {}); }, [url]);
  if (!src) return <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.cardAlt, marginRight: 10 }} />;
  return <Image source={src} style={{ width: 44, height: 44, borderRadius: 8, marginRight: 10, backgroundColor: colors.cardAlt }} />;
}
