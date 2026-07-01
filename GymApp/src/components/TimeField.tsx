// Tap-to-pick time selector (no typing). Displays 12-hour time; returns 24h "HH:MM".
import React, { useState } from 'react';
import { View, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Txt, Button } from './UI';
import { colors, font, radius, spacing } from '../theme';

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function to12(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  const h = m ? Number(m[1]) : 6;
  const min = m ? Number(m[2]) : 0;
  return { h12: h % 12 || 12, min, ampm: (h >= 12 ? 'PM' : 'AM') as 'AM' | 'PM' };
}
function to24(h12: number, min: number, ampm: 'AM' | 'PM') {
  const h = ampm === 'PM' ? (h12 % 12) + 12 : h12 % 12;
  return `${pad(h)}:${pad(min)}`;
}
export function display12(hhmm: string) {
  const { h12, min, ampm } = to12(hhmm);
  return `${h12}:${pad(min)} ${ampm}`;
}

export function TimeField({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [h12, setH] = useState(6);
  const [min, setMin] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

  const openPicker = () => { const i = to12(value); setH(i.h12); setMin(i.min); setAmpm(i.ampm); setOpen(true); };
  const done = () => { onChange(to24(h12, min, ampm)); setOpen(false); };

  const Chip = ({ active, label: l, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: radius.pill, marginRight: 8, backgroundColor: active ? colors.primary : colors.cardAlt }}>
      <Txt weight="800" size={font.small} style={{ color: active ? '#fff' : colors.textDim }}>{l}</Txt>
    </TouchableOpacity>
  );

  return (
    <View style={{ marginBottom: spacing(1.5) }}>
      {label ? <Txt dim size={font.small} weight="700" style={{ marginBottom: 6 }}>{label}</Txt> : null}
      <TouchableOpacity onPress={openPicker} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt weight="700">{display12(value)}</Txt>
        <Txt dim size={16}>🕐</Txt>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing(2.5) }}>
            <Txt size={font.h3} weight="800" style={{ textAlign: 'center', marginBottom: spacing(2) }}>{label || 'Pick a time'}</Txt>
            <Txt dim size={font.small} weight="700" style={{ marginBottom: 8 }}>Hour</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(1.5) }}>
              {HOURS12.map((h) => <Chip key={h} label={h} active={h12 === h} onPress={() => setH(h)} />)}
            </ScrollView>
            <Txt dim size={font.small} weight="700" style={{ marginBottom: 8 }}>Minute</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(1.5) }}>
              {MINUTES.map((m) => <Chip key={m} label={pad(m)} active={min === m} onPress={() => setMin(m)} />)}
            </ScrollView>
            <View style={{ flexDirection: 'row', marginBottom: spacing(2) }}>
              <Chip label="AM" active={ampm === 'AM'} onPress={() => setAmpm('AM')} />
              <Chip label="PM" active={ampm === 'PM'} onPress={() => setAmpm('PM')} />
            </View>
            <Button title={`Set ${h12}:${pad(min)} ${ampm}`} onPress={done} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
