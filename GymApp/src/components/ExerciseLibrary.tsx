// Browsable exercise library with form cues. Tapping "Add" drops the exercise
// into the current workout. Pure static content (no backend / AI).
import React, { useState } from 'react';
import { Modal, ScrollView, View, TouchableOpacity } from 'react-native';
import { Txt, Button } from './UI';
import { EXERCISES, MUSCLES } from '../data/exercises';
import { colors, font, radius, spacing } from '../theme';

export function ExerciseLibrary({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick?: (name: string) => void;
}) {
  const [muscle, setMuscle] = useState<string | null>(null);
  const list = muscle ? EXERCISES.filter((e) => e.muscle === muscle) : EXERCISES;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing(2), paddingBottom: spacing(1) }}>
          <Txt size={font.h2} weight="800">Exercise Library 📖</Txt>
          <TouchableOpacity onPress={onClose}><Txt size={font.h3} dim>✕</Txt></TouchableOpacity>
        </View>

        {/* Muscle filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, paddingHorizontal: spacing(2) }}>
          {['All', ...MUSCLES].map((m) => {
            const active = (m === 'All' && !muscle) || muscle === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMuscle(m === 'All' ? null : m)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, marginRight: 8,
                  backgroundColor: active ? colors.primary : colors.cardAlt,
                }}>
                <Txt size={font.small} weight="700" style={{ color: active ? '#fff' : colors.textDim }}>{m}</Txt>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: spacing(2) }}>
          {list.map((e) => (
            <View key={e.name} style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing(1.5), marginBottom: spacing(1.5), borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="800">{e.name}</Txt>
                  <Txt dim size={font.tiny}>{e.muscle} · {e.equipment}</Txt>
                </View>
                {onPick && (
                  <TouchableOpacity
                    onPress={() => { onPick(e.name); onClose(); }}
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill }}>
                    <Txt weight="800" size={font.small} style={{ color: '#fff' }}>＋ Add</Txt>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ marginTop: spacing(1) }}>
                {e.cues.map((c, i) => (
                  <Txt key={i} dim size={font.small} style={{ marginTop: 2 }}>• {c}</Txt>
                ))}
              </View>
            </View>
          ))}
          <View style={{ height: spacing(2) }} />
        </ScrollView>
        <View style={{ padding: spacing(2) }}>
          <Button title="Done" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
