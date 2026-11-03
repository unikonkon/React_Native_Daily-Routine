// Toast pill ลอยเหนือแถบล่าง — หายเอง ~1.9s (มีปุ่ม "เลิกทำ" = 5s) จัดคิวโดย stores/ui.ts
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_SPACE } from '@/components/b1/bottom-bar';
import { Txt, useTokens } from '@/components/ui';
import { useUI } from '@/stores/ui';

export function ToastHost() {
  const toast = useUI((s) => s.toast);
  const action = useUI((s) => s.toastAction);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [toast, anim]);

  if (!toast) return null;
  return (
    // วางเหนือแถบล่างลอย (B1) — ไม่บังปุ่มวันนี้/กลับ
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 18, right: 18, bottom: insets.bottom + BOTTOM_BAR_SPACE, alignItems: 'center' }}>
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          backgroundColor: t.ink,
          borderRadius: 99,
          paddingLeft: 18,
          paddingRight: action ? 6 : 18,
          paddingVertical: action ? 6 : 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          maxWidth: '100%',
        }}>
        <Txt size={13} color={t.bg} weight="med" numberOfLines={2} style={{ flexShrink: 1 }}>
          {toast}
        </Txt>
        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              useUI.getState().hideToast();
              action.run();
            }}
            hitSlop={6}
            style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pressed ? t.sub : t.bg, alignItems: 'center', justifyContent: 'center' })}>
            <Txt size={13} weight="bold" color={t.ink}>
              {action.label}
            </Txt>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
