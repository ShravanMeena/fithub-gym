// A quick celebration overlay — emoji confetti + a message. Reused for badge
// unlocks, PRs, streak milestones, goals.
import React, { useEffect, useRef } from 'react';
import { Modal, View, Animated, Easing, Dimensions } from 'react-native';
import { Txt, Button } from './UI';
import { colors, font, radius, spacing } from '../theme';

const { width, height } = Dimensions.get('window');
const PIECES = ['🎉', '✨', '🎊', '⭐', '🔥', '💪', '🏅', '💥'];

export function Celebration({ visible, emoji = '🎉', title, message, onClose }: {
  visible: boolean; emoji?: string; title: string; message?: string; onClose: () => void;
}) {
  const pieces = useRef(
    Array.from({ length: 16 }, (_, i) => ({
      x: Math.random() * width,
      delay: Math.random() * 400,
      dur: 1500 + Math.random() * 1300,
      rot: (Math.random() * 720 - 360),
      emo: PIECES[i % PIECES.length],
      v: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    pieces.forEach((p) => {
      p.v.setValue(0);
      Animated.timing(p.v, { toValue: 1, duration: p.dur, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  }, [visible, pieces]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000c', alignItems: 'center', justifyContent: 'center' }}>
        {pieces.map((p, i) => (
          <Animated.Text key={i} style={{
            position: 'absolute', top: 0, left: p.x, fontSize: 26,
            opacity: p.v.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [-40, height] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot}deg`] }) },
            ],
          }}>{p.emo}</Animated.Text>
        ))}
        <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing(3), margin: spacing(3), alignItems: 'center', borderWidth: 1, borderColor: colors.primary }}>
          <Txt size={64}>{emoji}</Txt>
          <Txt size={font.h2} weight="900" style={{ textAlign: 'center', marginTop: spacing(1) }}>{title}</Txt>
          {message ? <Txt dim style={{ textAlign: 'center', marginTop: 6 }}>{message}</Txt> : null}
          <Button title="Nice! 🙌" onPress={onClose} style={{ marginTop: spacing(2), paddingHorizontal: spacing(4) }} />
        </View>
      </View>
    </Modal>
  );
}
