import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { Txt, Button } from '../components/UI';
import { useAuth } from './AuthContext';
import { useOrg } from './OrgContext';
import { PLANS, Plan, UPI_ID, WHATSAPP_NUMBER } from '../billing';
import { colors, font, radius, spacing } from '../theme';

type BillingState = {
  aiActive: boolean;
  showPaywall: (feature?: string) => void;
};

const BillingContext = createContext<BillingState>({} as BillingState);
export const useBilling = () => useContext(BillingContext);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { org } = useOrg();
  const [visible, setVisible] = useState(false);
  const [feature, setFeature] = useState<string>('AI features');
  const [selected, setSelected] = useState<Plan | null>(null);

  const aiActive = !!user?.ai_active;
  const showPaywall = useCallback((f?: string) => { setFeature(f || 'AI features'); setSelected(null); setVisible(true); }, []);

  const payUpi = (plan: Plan) => {
    const url = `upi://pay?pa=${UPI_ID}&pn=FitHub&am=${plan.price}&cu=INR&tn=${encodeURIComponent('FitHub AI ' + plan.label)}`;
    Linking.openURL(url).catch(() => Alert.alert('No UPI app', `Pay ₹${plan.price} to UPI ID:\n${UPI_ID}`));
  };

  const sendWhatsApp = (plan: Plan) => {
    const msg =
      `Hi, I paid ₹${plan.price} for the *${plan.label}* AI plan on FitHub.\n` +
      `Gym: ${org?.name || user?.org?.name || '-'}\n` +
      `Name: ${user?.name}\nEmail: ${user?.email}\n` +
      `Please activate my AI access. Screenshot attached.`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => Alert.alert('WhatsApp not available', `Message us at +${WHATSAPP_NUMBER}`));
  };

  return (
    <BillingContext.Provider value={{ aiActive, showPaywall }}>
      {children}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#000c', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing(2.5), maxHeight: '90%' }}>
            <View style={{ alignItems: 'center', marginBottom: spacing(1) }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing(1.5) }} />
              <Txt size={font.h2} weight="800">Unlock AI ✨</Txt>
              <Txt dim style={{ textAlign: 'center', marginTop: 6 }}>
                {feature} uses AI. Subscribe to unlock AI diet plans, food scanning, photo analysis & the AI coach.
              </Txt>
              <Txt dim size={font.tiny} style={{ marginTop: 4 }}>Free ready-made diet plans always stay free.</Txt>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {PLANS.map((p) => {
                  const active = selected?.days === p.days;
                  return (
                    <TouchableOpacity
                      key={p.days}
                      onPress={() => setSelected(p)}
                      style={{ width: '48%', padding: spacing(1.5), borderRadius: radius.md, marginBottom: 12, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '18' : colors.card }}>
                      <Txt weight="700">{p.label}</Txt>
                      <Txt size={font.h3} weight="800" style={{ color: colors.primary, marginTop: 2 }}>₹{p.price}</Txt>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selected && (
                <View style={{ marginTop: spacing(1) }}>
                  <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing(2), marginBottom: spacing(1.5) }}>
                    <Txt dim size={font.small}>Pay to UPI ID</Txt>
                    <Txt weight="800" size={font.h3} style={{ marginVertical: 4 }}>{UPI_ID}</Txt>
                    <Txt dim size={font.small}>Amount: <Txt weight="700" style={{ color: colors.primary }}>₹{selected.price}</Txt> · {selected.label} of AI access</Txt>
                  </View>
                  <Button title={`Pay ₹${selected.price} via UPI`} onPress={() => payUpi(selected)} />
                  <Button title="✅ Paid? Send screenshot on WhatsApp" variant="ghost" onPress={() => sendWhatsApp(selected)} style={{ marginTop: spacing(1) }} />
                  <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: spacing(1) }}>
                    After we verify your screenshot, your gym admin activates AI on your account.
                  </Txt>
                </View>
              )}
            </ScrollView>

            <Button title="Maybe later" variant="ghost" onPress={() => setVisible(false)} style={{ marginTop: spacing(1) }} />
          </View>
        </View>
      </Modal>
    </BillingContext.Provider>
  );
}
