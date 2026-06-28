import React from 'react';
import {
  Text,
  TextProps,
  View,
  ViewProps,
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  TextInput,
  TextInputProps,
  StyleSheet,
  Platform,
} from 'react-native';
import { colors, radius, spacing, font } from '../theme';

// Android renders the same point size visibly larger, so trim it a touch. Also
// ignore the OS font-scale setting so the layout stays consistent.
const FS = Platform.OS === 'android' ? 0.92 : 1;
const fs = (n: number) => Math.round(n * FS);

export function Screen({ children, style }: ViewProps) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style, onPress }: ViewProps & { onPress?: () => void }) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Txt({ style, dim, size, weight, ...p }: TextProps & { dim?: boolean; size?: number; weight?: any }) {
  return (
    <Text
      allowFontScaling={false}
      {...p}
      style={[
        { color: dim ? colors.textDim : colors.text, fontSize: fs(size ?? font.body), fontWeight: weight },
        style,
      ]}
    />
  );
}

export function Button({
  title,
  loading,
  variant = 'primary',
  style,
  ...p
}: TouchableOpacityProps & { title: string; loading?: boolean; variant?: 'primary' | 'ghost' | 'danger' }) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  return (
    <TouchableOpacity
      {...p}
      activeOpacity={0.85}
      disabled={loading || p.disabled}
      style={[
        styles.btn,
        { backgroundColor: bg, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: colors.border },
        (loading || p.disabled) && { opacity: 0.6 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text allowFontScaling={false} style={[styles.btnTxt, variant === 'ghost' && { color: colors.text }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Field({ label, style, ...p }: TextInputProps & { label?: string }) {
  return (
    <View style={{ marginBottom: spacing(1.5) }}>
      {label ? <Txt dim size={font.small} style={{ marginBottom: 6 }}>{label}</Txt> : null}
      <TextInput
        allowFontScaling={false}
        placeholderTextColor={colors.textDim}
        {...p}
        style={[styles.input, style]}
      />
    </View>
  );
}

export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <Text style={{ color: active ? '#fff' : colors.textDim, fontSize: font.small, fontWeight: '600' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing(2) },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing(1.5),
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  btn: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(2),
  },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: fs(font.body) },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing(1.5),
    height: 48,
    fontSize: fs(font.body),
  },
  pill: {
    paddingHorizontal: spacing(1.5),
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
});
