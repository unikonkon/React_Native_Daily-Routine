// Toast pill ลอยเหนือแถบล่าง — หายเอง ~1.9s (มีปุ่ม "เลิกทำ" = 5s · 2 ปุ่ม เช่น "จดโน้ต" + "เลิกทำ" = 6s) จัดคิวโดย stores/ui.ts
// เข้า: จางเข้า + ลอยขึ้นเล็กน้อย · ออก: จางออก · ข้อความใหม่มาแทน: ตัวเก่าจางออกขณะตัวใหม่เข้า (ซ้อนตำแหน่งเดียวกัน)
//
// แผ่นรายละเอียด/หน้าต่างเลื่อนนัดเป็น Modal ของระบบ — วาดทับทุกอย่างในหน้า toast ตัวหลัก (ใน root layout) จึงอยู่ "ใต้" แผ่น
// ปุ่ม "เลิกทำ" หลังเปลี่ยนสถานะ/บันทึกโน้ตในแผ่นกดไม่ถึง → Modal วาง <ToastHost docked /> ของตัวเองไว้เหนือขอบบนของแผ่น
// ระหว่างที่มีตัว docked อยู่ ตัวหลักจะหยุดวาด (ไม่ให้ข้อความขึ้นซ้อนสองที่)
import React, { useEffect, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_BAR_SPACE } from '@/components/b1/bottom-bar';
import { EASE_OUT } from '@/components/motion';
import { useKeyboardHeight } from '@/components/note-bar';
import { Txt, useTokens } from '@/components/ui';
import { useUI } from '@/stores/ui';

const ENTER = FadeInDown.duration(220).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });
const EXIT = FadeOut.duration(160);

// จำนวน ToastHost แบบ docked ที่เปิดอยู่ (ใน Modal) — ตัวหลักฟังค่านี้เพื่อหลบ
let docks = 0;
const dockSubs = new Set<() => void>();
const subscribeDocks = (fn: () => void) => {
  dockSubs.add(fn);
  return () => {
    dockSubs.delete(fn);
  };
};
const getDocks = () => docks;
const setDocks = (n: number) => {
  docks = n;
  dockSubs.forEach((fn) => fn());
};

/**
 * docked = วางใน Modal เหนือขอบบนของแผ่น (กล่องสูง 0 ในแนวเรียงของ Modal — ไม่ดันแผ่น ไม่กินพื้นที่แตะปิด)
 * ไม่ส่ง = ตัวหลักของแอป ลอยเหนือแถบล่าง · คีย์บอร์ดเปิดอยู่ → ยกขึ้นเหนือคีย์บอร์ด (และแถบปุ่มโน้ต)
 */
export function ToastHost({ docked }: { docked?: boolean }) {
  const toast = useUI((s) => s.toast);
  const action = useUI((s) => s.toastAction);
  const action2 = useUI((s) => s.toastAction2);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const docksOpen = useSyncExternalStore(subscribeDocks, getDocks, getDocks);

  useEffect(() => {
    if (!docked) return;
    setDocks(docks + 1);
    return () => setDocks(docks - 1);
  }, [docked]);

  const show = toast && (docked || docksOpen === 0);
  const pill = show ? (
    <Animated.View key={toast} entering={ENTER} exiting={EXIT} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          backgroundColor: t.ink,
          borderRadius: action ? 26 : 22,
          paddingLeft: 18,
          paddingRight: action ? 6 : 18,
          paddingVertical: action ? 6 : 10,
          gap: action2 ? 6 : 10,
          flexDirection: 'row',
          alignItems: 'center',
          maxWidth: '100%',
        }}>
        <Txt size={13} color={t.bg} weight="med" numberOfLines={3} style={{ flexShrink: 1 }}>
          {toast}
        </Txt>
        {action2 ? <ToastBtn a={action2} primary /> : null}
        {action ? <ToastBtn a={action} /> : null}
      </View>
    </Animated.View>
  ) : null;

  if (docked) {
    return (
      <View pointerEvents="box-none" style={{ height: 0, zIndex: 1 }}>
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 18, right: 18, bottom: 10 }}>
          {pill}
        </View>
      </View>
    );
  }

  return (
    // วางเหนือแถบล่างลอย (B1) — ไม่บังปุ่มวันนี้/กลับ · กล่องนี้อยู่ตลอด (สูง 0 ตอนไม่มีข้อความ) ให้ตัว toast เล่นแอนิเมชันออกได้
    // คีย์บอร์ดเปิด: ยกขึ้นเหนือคีย์บอร์ด + เผื่อแถบปุ่มโน้ต (ไม่งั้นข้อความ "กรอกไม่ครบ" ถูกคีย์บอร์ดบัง)
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 18, right: 18, bottom: kb > 0 ? kb + 64 : insets.bottom + BOTTOM_BAR_SPACE }}>
      {pill}
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
