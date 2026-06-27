import React, { useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { Card, Txt, Field, Button } from '../components/UI';
import { ProgressAPI, apiError } from '../api/client';
import { useBilling } from '../context/BillingContext';
import { colors, font, spacing } from '../theme';

export default function CoachScreen() {
  const { aiActive, showPaywall } = useBilling();
  const [question, setQuestion] = useState('');
  const [advice, setAdvice] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!aiActive) { showPaywall('AI Coach'); return; }
    setLoading(true);
    try {
      const { advice } = await ProgressAPI.coach(question || undefined);
      setAdvice(advice);
    } catch (e: any) {
      if (e?.response?.status === 402) showPaywall('AI Coach');
      else Alert.alert('Coach unavailable', apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">AI Coach 🤖</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>
        Personalized advice from your profile, progress and recent meals.
      </Txt>

      <Card>
        <Field
          label="Ask anything (optional)"
          value={question}
          onChangeText={setQuestion}
          placeholder="e.g. My weight isn't moving, what should I change?"
          multiline
          style={{ height: 90, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <Button title="✨ Get advice" loading={loading} onPress={ask} />
      </Card>

      {advice && (
        <Card style={{ borderColor: colors.primary }}>
          <Txt weight="700" style={{ marginBottom: 8 }}>Your coach says</Txt>
          <Txt style={{ lineHeight: 22 }}>{advice.message}</Txt>
          {advice.action_items?.length ? (
            <View style={{ marginTop: spacing(1.5) }}>
              <Txt weight="700" size={font.small} style={{ marginBottom: 6 }}>Action items</Txt>
              {advice.action_items.map((a: string, i: number) => (
                <Txt key={i} size={font.small} style={{ marginTop: 4, color: colors.accent }}>→ {a}</Txt>
              ))}
            </View>
          ) : null}
        </Card>
      )}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
