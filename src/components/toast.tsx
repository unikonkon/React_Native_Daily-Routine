// Toast pill เหนือ tab bar — หายเอง ~1.9s (จัดคิวโดย stores/ui.ts)
import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TABBAR_H } from '@/components/screen';
import { Txt, useTokens } from '@/components/ui';
import { useUI } from '@/stores/ui';

export function ToastHost() {
  const toast = useUI((s) => s.toast);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [toast, anim]);

  if (!toast) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: TABBAR_H + insets.bottom + 14, alignItems: 'center' }}>
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          backgroundColor: t.ink,
          borderRadius: 99,
          paddingHorizontal: 18,
          paddingVertical: 10,
        }}>
        <Txt size={13} color={t.bg} weight="med">
          {toast}
        </Txt>
      </Animated.View>
    </View>
  );
}
