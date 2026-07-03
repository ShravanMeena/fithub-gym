// Lightweight shimmer placeholders shown while content loads (feed, lists, etc.).
import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function Skeleton({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ backgroundColor: colors.cardAlt, borderRadius: radius.sm, opacity }, style]} />;
}

// A placeholder shaped like a feed post card.
export function PostSkeleton() {
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing(2), marginBottom: spacing(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing(1.5) }}>
        <Skeleton style={{ width: 38, height: 38, borderRadius: 19 }} />
        <View style={{ marginLeft: 10 }}>
          <Skeleton style={{ width: 120, height: 12, marginBottom: 6 }} />
          <Skeleton style={{ width: 70, height: 10 }} />
        </View>
      </View>
      <Skeleton style={{ width: '90%', height: 12, marginBottom: 8 }} />
      <Skeleton style={{ width: '70%', height: 12, marginBottom: spacing(1.5) }} />
      <Skeleton style={{ width: '100%', height: 180 }} />
    </View>
  );
}
