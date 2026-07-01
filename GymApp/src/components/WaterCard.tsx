// Daily water tracker — in litres. Tap quick amounts (glass 250ml, bottle 500ml,
// 1L), see a fill bar and litres left, editable goal. Simple, clean, habit-forming.
import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from './UI';
import { WaterAPI } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

const QUICK = [
  { label: 'Glass', sub: '250 ml', ml: 250 },
  { label: 'Bottle', sub: '500 ml', ml: 500 },
  { label: 'Litre', sub: '1 L', ml: 1000 },
];
const litres = (ml: number) => (ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1);

export function WaterCard() {
  const [ml, setMl] = useState(0);
  const [goalMl, setGoalMl] = useState(3000);

  const load = useCallback(() => {
    WaterAPI.today().then((d) => { setMl(d.ml); setGoalMl(d.goalMl); }).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async (amount: number) => {
    setMl((m) => Math.max(0, m + amount)); // optimistic
    try { const d = await WaterAPI.add(amount); setMl(d.ml); } catch { load(); }
  };

  const editGoal = () => {
    const opts = [2000, 2500, 3000, 3500, 4000].map((n) => ({
      text: `${litres(n)} L`,
      onPress: async () => { setGoalMl(n); try { await WaterAPI.setGoal(n); } catch {} },
    }));
    Alert.alert('Daily water goal', 'How much do you want to drink each day?', [...opts, { text: 'Cancel', style: 'cancel' }]);
  };

  const pct = Math.min(1, goalMl ? ml / goalMl : 0);
  const done = ml >= goalMl;
  const leftMl = Math.max(0, goalMl - ml);

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
        <Txt dim size={font.small} weight="800" style={{ letterSpacing: 1 }}>💧 WATER</Txt>
        <TouchableOpacity onPress={editGoal}>
          <Txt size={font.small} weight="700" style={{ color: colors.primary }}>Goal: {litres(goalMl)} L ✎</Txt>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Txt size={font.h1} weight="900" style={{ color: done ? colors.accent : colors.primary }}>
            {litres(ml)}<Txt size={font.body} weight="700" dim> / {litres(goalMl)} L</Txt>
          </Txt>
          <Txt dim size={font.tiny}>{done ? '🎉 Goal reached — nicely hydrated!' : `${litres(leftMl)} L to go`}</Txt>
        </View>
        {ml > 0 && (
          <TouchableOpacity onPress={() => add(-250)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Txt size={font.small} weight="700" dim>− Undo</Txt>
          </TouchableOpacity>
        )}
      </View>

      {/* progress bar */}
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.cardAlt, marginTop: spacing(1.25), overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: done ? colors.accent : colors.primary }} />
      </View>

      {/* quick add buttons */}
      <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
        {QUICK.map((qd) => (
          <TouchableOpacity key={qd.ml} onPress={() => add(qd.ml)}
            style={{ flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Txt weight="800" size={font.small}>＋ {qd.label}</Txt>
            <Txt dim size={font.tiny}>{qd.sub}</Txt>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}
