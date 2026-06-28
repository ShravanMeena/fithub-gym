import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { Txt, Field, Button } from '../components/UI';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { apiError } from '../api/client';
import { colors, font, radius, shadow, spacing } from '../theme';

const VALUE = [
  ['📍', 'Show up & stay regular', 'Check in, build streaks, never lose momentum'],
  ['🥗', 'Eat right, effortlessly', 'Track meals & hit your daily targets'],
  ['💬', 'Your gym community', 'Updates, wins and a leaderboard'],
];

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const { org, clearOrg } = useOrg();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!email || !password) return Alert.alert('Missing info', 'Enter email and password.');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      Alert.alert('Login failed', apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing(2.5), paddingTop: spacing(7), paddingBottom: spacing(4) }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: spacing(3) }}>
            <BrandMark name={org?.name || 'Your Gym'} tagline={org?.tagline} color={org?.primary_color} />
            <TouchableOpacity onPress={clearOrg} style={{ marginTop: spacing(1) }}>
              <Txt size={font.tiny} style={{ color: colors.primary }}>Change gym</Txt>
            </TouchableOpacity>
          </View>

          {/* What this app is */}
          <Txt size={font.h2} weight="900" style={{ textAlign: 'center' }}>Your membership, leveled up</Txt>
          <Txt dim style={{ textAlign: 'center', marginTop: 6, marginBottom: spacing(2.5) }}>
            Stay regular, eat right, and stay connected with your gym.
          </Txt>

          <View style={[{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing(2), marginBottom: spacing(3) }, shadow]}>
            {VALUE.map(([icon, title, sub], i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: i < VALUE.length - 1 ? spacing(1.75) : 0 }}>
                <Txt size={26} style={{ width: 40 }}>{icon}</Txt>
                <View style={{ flex: 1 }}>
                  <Txt weight="800">{title}</Txt>
                  <Txt dim size={font.small}>{sub}</Txt>
                </View>
              </View>
            ))}
          </View>

          <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
          <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
          <Button title="Log In" loading={loading} onPress={onLogin} style={{ marginTop: spacing(1) }} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing(3) }}>
            <Txt dim>New here? </Txt>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Txt weight="800" style={{ color: colors.primary }}>Create account</Txt>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
