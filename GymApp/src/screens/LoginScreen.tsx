import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { Screen, Txt, Field, Button } from '../components/UI';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { apiError } from '../api/client';
import { colors, font, spacing } from '../theme';

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
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing(4) }}>
          <BrandMark name={org?.name || 'Your Gym'} tagline={org?.tagline} color={org?.primary_color} />
          <TouchableOpacity onPress={clearOrg} style={{ marginTop: spacing(1) }}>
            <Txt size={font.tiny} style={{ color: colors.primary }}>Change gym</Txt>
          </TouchableOpacity>
        </View>

        <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
        <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />

        <Button title="Log In" loading={loading} onPress={onLogin} style={{ marginTop: spacing(1) }} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing(3) }}>
          <Txt dim>New here? </Txt>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
            <Txt weight="700" style={{ color: colors.primary }}>Create account</Txt>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
