import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { Screen, Txt, Field, Button } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { apiError } from '../api/client';
import { colors, font, spacing } from '../theme';

export default function SignupScreen({ navigation }: any) {
  const { signup } = useAuth();
  const { org } = useOrg();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSignup = async () => {
    if (!name || !email || !password) return Alert.alert('Missing info', 'Fill all fields.');
    if (password.length < 6) return Alert.alert('Weak password', 'Use at least 6 characters.');
    setLoading(true);
    try {
      await signup(name.trim(), email.trim(), password, org?.id);
    } catch (e) {
      Alert.alert('Signup failed', apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
        <Txt size={font.h1} weight="800">Create account</Txt>
        <Txt dim style={{ marginBottom: spacing(4) }}>
          Joining <Txt weight="700" style={{ color: colors.primary }}>{org?.name || 'your gym'}</Txt>
        </Txt>

        <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
        <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
        <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="At least 6 characters" />

        <Button title="Sign Up" loading={loading} onPress={onSignup} style={{ marginTop: spacing(1) }} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing(3) }}>
          <Txt dim>Already have an account? </Txt>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Txt weight="700" style={{ color: colors.primary }}>Log in</Txt>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
