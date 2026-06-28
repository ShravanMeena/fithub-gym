// Daily water tracker — tap a glass to fill it. Free, simple, habit-forming.
import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from './UI';
import { WaterAPI } from '../api/client';
import { colors, font, spacing } from '../theme';

export function WaterCard() {
  const [glasses, setGlasses] = useState(0);
  const [goal, setGoal] = useState(8);

  const load = useCallback(() => { WaterAPI.today().then((d) => { setGlasses(d.glasses); setGoal(d.goal); }).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const change = async (delta: 1 | -1) => {
    setGlasses((g) => Math.max(0, g + delta)); // optimistic
    try { const d = await WaterAPI.add(delta); setGlasses(d.glasses); } catch { load(); }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
        <Txt dim size={font.small} weight="800" style={{ letterSpacing: 1 }}>💧 WATER</Txt>
        <Txt weight="800" style={{ color: glasses >= goal ? colors.accent : colors.primary }}>{glasses} / {goal} glasses</Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        {Array.from({ length: goal }).map((_, i) => (
          <TouchableOpacity key={i} onPress={() => change(i < glasses ? -1 : 1)} style={{ marginRight: 6, marginBottom: 6 }}>
            <Txt size={26} style={{ opacity: i < glasses ? 1 : 0.25 }}>🥤</Txt>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => change(1)} style={{ marginLeft: 4, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Txt weight="900" style={{ color: '#fff' }}>＋</Txt>
        </TouchableOpacity>
      </View>
      {glasses >= goal && <Txt size={font.tiny} style={{ color: colors.accent, marginTop: 8 }}>🎉 Goal reached — nicely hydrated!</Txt>}
    </Card>
  );
}
