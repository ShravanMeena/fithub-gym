import React from 'react';
import { View } from 'react-native';
import { Txt } from './UI';
import { colors, font, spacing } from '../theme';

function Bar({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  const pct = target ? Math.min(1, value / target) : 0;
  return (
    <View style={{ marginBottom: spacing(1.25) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt size={font.small} weight="600">{label}</Txt>
        <Txt size={font.small} dim>
          {Math.round(value)}{target ? ` / ${Math.round(target)} g` : ' g'}
        </Txt>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export function MacroBars({
  protein,
  carbs,
  fat,
  targets,
}: {
  protein: number;
  carbs: number;
  fat: number;
  targets?: { protein_g?: number; carbs_g?: number; fat_g?: number };
}) {
  return (
    <View>
      <Bar label="Protein" value={protein} target={targets?.protein_g} color={colors.protein} />
      <Bar label="Carbs" value={carbs} target={targets?.carbs_g} color={colors.carbs} />
      <Bar label="Fat" value={fat} target={targets?.fat_g} color={colors.fat} />
    </View>
  );
}

// Big calorie remaining ring (simple text-based, no svg dependency).
export function CalorieSummary({ consumed, target }: { consumed: number; target?: number }) {
  const remaining = target ? Math.max(0, target - consumed) : null;
  const over = target ? consumed > target : false;
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing(1) }}>
      <Txt size={42} weight="800" style={{ color: over ? colors.danger : colors.primary }}>
        {Math.round(consumed)}
      </Txt>
      <Txt dim>
        {target ? `of ${Math.round(target)} kcal` : 'kcal today'}
      </Txt>
      {remaining !== null && (
        <Txt size={font.small} style={{ color: over ? colors.danger : colors.accent, marginTop: 4 }}>
          {over ? `${Math.round(consumed - target!)} kcal over` : `${Math.round(remaining)} kcal left`}
        </Txt>
      )}
    </View>
  );
}
