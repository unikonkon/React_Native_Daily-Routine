// Toast pill ลอยเหนือแถบล่าง — หายเอง ~1.9s (มีปุ่ม "เลิกทำ" = 5s · 2 ปุ่ม เช่น "จดโน้ต" + "เลิกทำ" = 6s) จัดคิวโดย stores/ui.ts
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_SPACE } from '@/components/b1/bottom-bar';
import { Txt, useTokens } from '@/components/ui';
import { useUI } from '@/stores/ui';

export function ToastHost() {
  const toast = useUI((s) => s.toast);
  const action = useUI((s) => s.toastAction);
  const action2 = useUI((s) => s.toastAction2);
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
          gap: action2 ? 6 : 10,
          flexDirection: 'row',
          alignItems: 'center',
          maxWidth: '100%',
        }}>
        <Txt size={13} color={t.bg} weight="med" numberOfLines={2} style={{ flexShrink: 1 }}>
          {toast}
        </Txt>
        {action2 ? <ToastBtn a={action2} primary /> : null}
        {action ? <ToastBtn a={action} /> : null}
      </Animated.View>
    </View>
  );
}

/** ปุ่มใน toast — primary = พื้นส้ม (ชวนกด) · ปกติ = พื้นอ่อน */
function ToastBtn({ a, primary }: { a: { label: string; run: () => void }; primary?: boolean }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        useUI.getState().hideToast();
        a.run();
      }}
      hitSlop={6}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 18,
        backgroundColor: primary ? (pressed ? '#9A3F22' : '#B44E2C') : pressed ? t.sub : t.bg,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Txt size={13} weight="bold" color={primary ? '#FFFFFF' : t.ink}>
        {a.label}
      </Txt>
    </Pressable>
  );
}
