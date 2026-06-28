// Cross-platform keyboard-aware scroll. When the keyboard opens it adds bottom
// room AND scrolls the focused input above the keyboard — works on Android too
// (where automaticallyAdjustKeyboardInsets is a no-op). Drop-in for ScrollView.
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, ScrollViewProps, Keyboard, Platform, TextInput, Dimensions } from 'react-native';

export function KeyboardScroll({ children, contentContainerStyle, ...rest }: ScrollViewProps & { children?: React.ReactNode }) {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [kb, setKb] = useState(0);

  const scrollToFocused = (kbH: number) => {
    const input: any =
      (TextInput as any).State?.currentlyFocusedInput?.() ||
      (TextInput as any).State?.currentlyFocusedField?.();
    if (!input?.measureInWindow) return;
    setTimeout(() => {
      try {
        input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          const screenH = Dimensions.get('window').height;
          const keyboardTop = screenH - kbH;
          const fieldBottom = y + h;
          const pad = 28;
          if (fieldBottom > keyboardTop - pad) {
            ref.current?.scrollTo({ y: offset.current + (fieldBottom - (keyboardTop - pad)), animated: true });
          }
        });
      } catch {}
    }, Platform.OS === 'ios' ? 0 : 60);
  };

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => { const h = e.endCoordinates?.height || 0; setKb(h); scrollToFocused(h); });
    const s2 = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  return (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      scrollEventThrottle={16}
      onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }}
      contentContainerStyle={[contentContainerStyle, kb ? { paddingBottom: kb + 28 } : null]}
      {...rest}>
      {children}
    </ScrollView>
  );
}
