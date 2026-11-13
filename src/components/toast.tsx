// Toast pill ลอยเหนือแถบล่าง — หายเอง ~1.9s (มีปุ่ม "เลิกทำ" = 5s · 2 ปุ่ม เช่น "จดโน้ต" + "เลิกทำ" = 6s) จัดคิวโดย stores/ui.ts
// เข้า: จางเข้า + ลอยขึ้นเล็กน้อย · ออก: จางออก · ข้อความใหม่มาแทน: ตัวเก่าจางออกขณะตัวใหม่เข้า (ซ้อนตำแหน่งเดียวกัน)
import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_SPACE } from '@/components/b1/bottom-bar';
import { EASE_OUT } from '@/components/motion';
import { Txt, useTokens } from '@/components/ui';
import { useUI } from '@/stores/ui';

const ENTER = FadeInDown.duration(220).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });
const EXIT = FadeOut.duration(160);

export function ToastHost() {
  const toast = useUI((s) => s.toast);
  const action = useUI((s) => s.toastAction);
  const action2 = useUI((s) => s.toastAction2);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  return (
    // วางเหนือแถบล่างลอย (B1) — ไม่บังปุ่มวันนี้/กลับ · กล่องนี้อยู่ตลอด (สูง 0 ตอนไม่มีข้อความ) ให้ตัว toast เล่นแอนิเมชันออกได้
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 18, right: 18, bottom: insets.bottom + BOTTOM_BAR_SPACE }}>
      {toast ? (
        <Animated.View key={toast} entering={ENTER} exiting={EXIT} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
          <View
            style={{
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
          </View>
        </Animated.View>
      ) : null}
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
        backgroundColor: primary ? (pressed ? t.primaryDown : t.primary) : pressed ? t.sub : t.bg,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Txt size={13} weight="bold" color={primary ? '#FFFFFF' : t.ink}>
        {a.label}
      </Txt>
    </Pressable>
  );
}
