// ชิ้นส่วน UI ร่วมของแท็บวันนี้ (ลุค mockup iOS Calendar) — ใช้ธีมเดิมของแอป
import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';

export type View3 = 'day' | 'week' | 'month' | 'year';

const VIEW_TABS: { key: View3; label: string; icon: string }[] = [
  { key: 'day', label: 'วัน', icon: 'sun' },
  { key: 'week', label: 'สัปดาห์', icon: 'bars' },
  { key: 'month', label: 'เดือน', icon: 'calendar' },
  { key: 'year', label: 'ปี', icon: 'grid' },
];

const SWITCH_SPRING = LinearTransition.springify().damping(20).stiffness(200).mass(0.4);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * ตัวสลับมุมมอง วัน/สัปดาห์/เดือน/ปี แบบ Active-pill (Tint)
 * ไม่เลือก = ไอคอนล้วน · active = pill พื้นส้มจาง ~15% + ไอคอน/ตัวอักษรส้ม
 * ใช้ร่วมในหัวของทุกมุมมอง (ประหยัดที่) — label ของ active ค่อยๆ fade เข้า
 */
export function ViewSwitcher({ value, onChange }: { value: View3; onChange: (v: View3) => void }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {VIEW_TABS.map((tab) => {
        const active = tab.key === value;
        const fg = active ? ACCENT : t.sub;
        return (
          <AnimatedPressable
            key={tab.key}
            layout={SWITCH_SPRING}
            hitSlop={4}
            onPress={() => {
              if (!active) onChange(tab.key);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: 34,
              width: active ? undefined : 34,
              paddingHorizontal: active ? 12 : 0,
              borderRadius: 99,
              backgroundColor: active ? ACCENT + '26' : 'transparent', // 0x26 ≈ 15%
            }}>
            <Icon name={tab.icon} size={19} color={fg} />
            {active ? (
              <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
                <Txt size={13} weight="bold" color={ACCENT}>
                  {tab.label}
                </Txt>
              </Animated.View>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/** ปุ่มกลม ‹ › สำหรับเลื่อนช่วง (ปี/เดือน) */
export function StepBtn({ icon, onPress, disabled }: { icon: 'chevL' | 'chevR'; onPress: () => void; disabled?: boolean }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: t.chip,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}>
      <Icon name={icon} size={18} color={t.sub} />
    </Pressable>
  );
}

/** ปุ่มย้อนขึ้นระดับ (‹ ป้าย) — แทน back ของ mockup ที่โชว์ชื่อระดับบน */
export function DrillBack({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: t.chip,
        borderRadius: 20,
        paddingLeft: 6,
        paddingRight: 12,
        paddingVertical: 6,
        alignSelf: 'flex-start',
      }}>
      <Icon name="chevL" size={16} color={t.sub} />
      <Txt size={13} weight="med" color={t.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** แถวหัวช่วง: back (ซ้าย) + ‹ › (ขวา) */
export function DrillBar({
  backLabel,
  onBack,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: {
  backLabel?: string;
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, minHeight: 34, gap: 8 }}>
      {onBack ? <DrillBack label={backLabel ?? ''} onPress={onBack} /> : null}
      <View style={{ flex: 1 }} />
      {onPrev ? <StepBtn icon="chevL" onPress={onPrev} disabled={prevDisabled} /> : null}
      {onNext ? <StepBtn icon="chevR" onPress={onNext} disabled={nextDisabled} /> : null}
    </View>
  );
}
