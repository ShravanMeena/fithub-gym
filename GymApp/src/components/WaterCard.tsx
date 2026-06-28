// Daily water tracker — clean progress, big −/＋ controls, editable goal, and a
// hydration-reminders toggle. Free, simple, habit-forming.
import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from './UI';
import { WaterAPI } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

export function WaterCard() {
  const [glasses, setGlasses] = useState(0);
  const [goal, setGoal] = useState(8);
  const [reminders, setReminders] = useState(false);

  const load = useCallback(() => {
    WaterAPI.today().then((d) => { setGlasses(d.glasses); setGoal(d.goal); setReminders(!!d.reminders); }).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const change = async (delta: 1 | -1) => {
    setGlasses((g) => Math.max(0, g + delta)); // optimistic
    try { const d = await WaterAPI.add(delta); setGlasses(d.glasses); } catch { load(); }
  };

  const editGoal = () => {
    const opts = [6, 8, 10, 12].map((n) => ({
      text: `${n} glasses`,
      onPress: async () => { setGoal(n); try { await WaterAPI.setGoal(n); } catch {} },
    }));
    Alert.alert('Daily water goal', 'How many glasses per day?', [...opts, { text: 'Cancel', style: 'cancel' }]);
  };

  const toggleReminders = async () => {
    const next = !reminders;
    setReminders(next);
    try { await WaterAPI.setReminders(next); } catch { setReminders(!next); }
  };

  const pct = Math.min(1, goal ? glasses / goal : 0);
  const done = glasses >= goal;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
        <Txt dim size={font.small} weight="800" style={{ letterSpacing: 1 }}>💧 WATER</Txt>
        <TouchableOpacity onPress={editGoal}>
          <Txt size={font.small} weight="700" style={{ color: colors.primary }}>Goal: {goal} ✎</Txt>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* − / count / + */}
        <TouchableOpacity onPress={() => change(-1)} disabled={glasses === 0}
          style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: glasses === 0 ? 0.4 : 1 }}>
          <Txt size={24} weight="900" dim>−</Txt>
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt size={font.h1} weight="900" style={{ color: done ? colors.accent : colors.primary }}>{glasses}<Txt dim size={font.body} weight="700"> / {goal}</Txt></Txt>
          <Txt dim size={font.tiny}>glasses today</Txt>
        </View>

        <TouchableOpacity onPress={() => change(1)}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={24} weight="900" style={{ color: '#fff' }}>＋</Txt>
        </TouchableOpacity>
      </View>

      {/* progress bar */}
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.cardAlt, marginTop: spacing(1.5), overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: done ? colors.accent : colors.primary }} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1.25) }}>
        <Txt size={font.tiny} style={{ color: done ? colors.accent : colors.textDim }}>
          {done ? '🎉 Goal reached — nicely hydrated!' : `${goal - glasses} to go`}
        </Txt>
        <TouchableOpacity onPress={toggleReminders} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Txt size={font.tiny} weight="700" style={{ color: reminders ? colors.primary : colors.textDim }}>
            {reminders ? '🔔 Reminders on' : '🔕 Remind me'}
          </Txt>
        </TouchableOpacity>
      </View>
    </Card>
  );
}
