// ชิ้นส่วน UI ร่วมของแท็บวันนี้ (ลุค mockup iOS Calendar) — ใช้ธีมเดิมของแอป
import React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt, useTokens } from '@/components/ui';

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
