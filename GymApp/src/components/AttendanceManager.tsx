import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Modal, AppState, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { EventType } from '@notifee/react-native';
import { Card, Txt, Button } from './UI';
import { AttendanceAPI, apiError } from '../api/client';
import { scheduleCheckoutReminder, cancelCheckoutReminder } from '../notifications';
import { colors, font, radius, spacing } from '../theme';

const SESSION_KEY = 'gym.sessionMin';
const DURATIONS = [
  { label: '45 min', min: 45 },
  { label: '1 hour', min: 60 },
  { label: '1h 30m', min: 90 },
  { label: '2 hours', min: 120 },
];

const fmtDur = (m: number | null) => {
  if (!m) return 'not set';
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h ? `${h}h ` : ''}${mm ? `${mm}m` : ''}`.trim();
};

function Sheet({ visible, onClose, children }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: spacing(3) }}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing(3), borderWidth: 1, borderColor: colors.border }}>
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export function AttendanceManager({ attendance, reload, gymName }: { attendance: any; reload: () => Promise<void>; gymName?: string }) {
  const [sessionMin, setSessionMin] = useState<number | null>(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showDuration, setShowDuration] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [ch, setCh] = useState(1); // custom hours
  const [cm, setCm] = useState(0); // custom minutes
  const durationMode = useRef<'first' | 'update'>('first');
  const promptedRef = useRef(false);

  const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const closeDuration = () => { setShowDuration(false); setCustomMode(false); };

  const checkedIn = !!attendance?.checkedIn;

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY).then((v) => v && setSessionMin(Number(v)));
  }, []);

  // Prompt to check in when the app opens / returns to foreground (if not already in).
  useEffect(() => {
    if (attendance && !checkedIn && !promptedRef.current) {
      promptedRef.current = true;
      setShowCheckIn(true);
    }
  }, [attendance, checkedIn]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { promptedRef.current = false; reload(); }
    });
    return () => sub.remove();
  }, [reload]);

  // Tapping the checkout reminder opens the checkout sheet.
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification?.data?.type === 'checkout') {
        reload();
        setShowCheckout(true);
      }
    });
    notifee.getInitialNotification().then((init) => {
      if (init?.notification?.data?.type === 'checkout') setShowCheckout(true);
    });
    return unsub;
  }, [reload]);

  const promptShortReason = (id: number, mins: number) => {
    const save = (reason: string) => AttendanceAPI.setReason(id, reason).then(reload).catch(() => {});
    Alert.alert('Leaving already? 🤔', `You trained only ${mins} min. Quick sessions happen — what was the reason?`, [
      { text: 'Short on time', onPress: () => save('Short on time') },
      { text: 'Felt unwell', onPress: () => save('Felt unwell') },
      { text: 'Just a quick session', onPress: () => save('Quick session') },
      { text: 'Skip', style: 'cancel' },
    ]);
  };

  const doCheckIn = async () => {
    setShowCheckIn(false);
    try {
      await AttendanceAPI.checkin();
      await reload();
      if (sessionMin == null) { durationMode.current = 'first'; setShowDuration(true); }
      else await scheduleCheckoutReminder(sessionMin, gymName);
    } catch (e) { Alert.alert('Error', apiError(e)); }
  };

  const doCheckOut = async () => {
    setShowCheckout(false);
    try {
      const res = await AttendanceAPI.checkout();
      await cancelCheckoutReminder();
      await reload();
      if (res.tooShort && res.attendance?.id) promptShortReason(res.attendance.id, res.durationMin ?? 0);
    } catch (e) { Alert.alert('Error', apiError(e)); }
  };

  const pickDuration = async (min: number) => {
    closeDuration();
    await AsyncStorage.setItem(SESSION_KEY, String(min));
    setSessionMin(min);
    if (durationMode.current === 'first' || checkedIn) await scheduleCheckoutReminder(min, gymName);
  };

  const Chip = ({ label, active, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, marginRight: 8, backgroundColor: active ? colors.primary : colors.cardAlt }}>
      <Txt weight="700" size={font.small} style={{ color: active ? '#fff' : colors.textDim }}>{label}</Txt>
    </TouchableOpacity>
  );

  return (
    <>
      <Card style={{ borderColor: checkedIn ? colors.accent : colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="700">{checkedIn ? '🟢 You are in the gym' : '📍 Gym attendance'}</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>
              {attendance?.todayCount ?? 0} here today · trained {attendance?.daysThisWeek ?? 0}× this week
            </Txt>
          </View>
          <TouchableOpacity
            onPress={checkedIn ? () => setShowCheckout(true) : doCheckIn}
            style={{ backgroundColor: checkedIn ? colors.danger : colors.accent, paddingHorizontal: spacing(2), paddingVertical: 10, borderRadius: radius.pill }}>
            <Txt weight="800" style={{ color: '#fff' }}>{checkedIn ? 'Check out' : 'Check in'}</Txt>
          </TouchableOpacity>
        </View>

        {/* Reminder control */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(1.25), paddingTop: spacing(1.25), borderTopWidth: 1, borderTopColor: colors.border }}>
          <Txt dim size={font.small}>⏰ Checkout reminder: <Txt size={font.small} weight="700" style={{ color: colors.text }}>{fmtDur(sessionMin)}</Txt></Txt>
          <TouchableOpacity onPress={() => { durationMode.current = 'update'; setShowDuration(true); }}>
            <Txt size={font.small} weight="700" style={{ color: colors.primary }}>{sessionMin ? 'Change' : 'Set'}</Txt>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Check-in prompt on app open */}
      <Sheet visible={showCheckIn} onClose={() => setShowCheckIn(false)}>
        <Txt size={font.h3} weight="800" style={{ textAlign: 'center' }}>Welcome to {gymName || 'the gym'} 💪</Txt>
        <Txt dim style={{ textAlign: 'center', marginTop: 8, marginBottom: spacing(2) }}>Check in to start your session and track your attendance.</Txt>
        <Button title="✅ Check in now" onPress={doCheckIn} />
        <Button title="Maybe later" variant="ghost" onPress={() => setShowCheckIn(false)} style={{ marginTop: spacing(1) }} />
      </Sheet>

      {/* Duration picker */}
      <Sheet visible={showDuration} onClose={closeDuration}>
        <Txt size={font.h3} weight="800" style={{ textAlign: 'center' }}>How long will you train?</Txt>
        <Txt dim style={{ textAlign: 'center', marginTop: 8, marginBottom: spacing(2) }}>We'll remind you to check out when your session ends. This becomes your default — change it anytime.</Txt>

        {!customMode ? (
          <>
            {DURATIONS.map((d) => (
              <TouchableOpacity key={d.min} onPress={() => pickDuration(d.min)} style={{ padding: 16, borderRadius: radius.md, backgroundColor: sessionMin === d.min ? colors.primary : colors.cardAlt, marginBottom: 10, alignItems: 'center' }}>
                <Txt weight="700" style={{ color: sessionMin === d.min ? '#fff' : colors.text }}>{d.label}</Txt>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setCustomMode(true)} style={{ padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' }}>
              <Txt weight="700" style={{ color: colors.primary }}>＋ Custom time</Txt>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Txt dim size={font.small} weight="700" style={{ marginBottom: 8 }}>Hours</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(1.5) }}>
              {[0, 1, 2, 3, 4, 5].map((h) => <Chip key={h} label={`${h}h`} active={ch === h} onPress={() => setCh(h)} />)}
            </ScrollView>
            <Txt dim size={font.small} weight="700" style={{ marginBottom: 8 }}>Minutes</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing(2) }}>
              {MINUTES.map((m) => <Chip key={m} label={`${m}m`} active={cm === m} onPress={() => setCm(m)} />)}
            </ScrollView>
            <Button title={`Set ${fmtDur(ch * 60 + cm) || '0m'}`} onPress={() => ch * 60 + cm > 0 ? pickDuration(ch * 60 + cm) : Alert.alert('Pick a time', 'Choose at least a few minutes.')} />
            <Button title="← Back to presets" variant="ghost" onPress={() => setCustomMode(false)} style={{ marginTop: spacing(1) }} />
          </>
        )}
      </Sheet>

      {/* Checkout confirm */}
      <Sheet visible={showCheckout} onClose={() => setShowCheckout(false)}>
        <Txt size={font.h3} weight="800" style={{ textAlign: 'center' }}>Leaving {gymName || 'the gym'}?</Txt>
        <Txt dim style={{ textAlign: 'center', marginTop: 8, marginBottom: spacing(2) }}>Check out to record your session time.</Txt>
        <Button title="🏁 Check out now" onPress={doCheckOut} />
        <Button title="Still training" variant="ghost" onPress={() => setShowCheckout(false)} style={{ marginTop: spacing(1) }} />
      </Sheet>
    </>
  );
}
