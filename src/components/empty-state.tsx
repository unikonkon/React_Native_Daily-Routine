// หน้าว่าง (ยังไม่มีข้อมูล / ทำครบแล้ว) — ภาพเส้นเล็ก ๆ ในวงสีอ่อนของธีม + ข้อความ 2 บรรทัด + ปุ่มถ้ามี
// ใช้ร่วมกันทุกหน้า ให้หน้าว่างดูเป็นมิตรและบอกขั้นต่อไป ไม่ใช่ตัวหนังสือลอย ๆ
import React from 'react';
import { View } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import { GREEN } from '@/constants/theme';

interface EmptyStateProps {
  /** ชื่อไอคอนจาก components/svg-icon */
  icon: string;
  title: string;
  sub?: string;
  /** done = โทนเขียว (ทำครบ/ไม่มีอะไรค้าง) · ค่าเริ่มต้น = สีเน้นของธีม */
  tone?: 'accent' | 'done';
  /** ปุ่ม/ลิงก์ใต้ข้อความ */
  children?: React.ReactNode;
  /** ระยะขอบบน (ค่าเริ่มต้น 40) */
  top?: number;
}

export function EmptyState({ icon, title, sub, tone = 'accent', children, top = 40 }: EmptyStateProps) {
  const t = useTokens();
  const tint = tone === 'done' ? GREEN : t.accent;
  const ink = tone === 'done' ? t.greenInk : t.accentInk;
  return (
    <View style={{ alignItems: 'center', paddingTop: top, paddingBottom: 24, paddingHorizontal: 32, gap: 6 }}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: 84, height: 84, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tint + '1F', alignItems: 'center', justifyContent: 'center' }}>
          <SvgIcon name={icon} size={30} color={ink} strokeWidth={1.6} />
        </View>
        {/* จุดประดับเล็ก ๆ — ให้ภาพไม่แข็ง */}
        <View style={{ position: 'absolute', right: 4, top: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: tint + '66' }} />
        <View style={{ position: 'absolute', left: 6, bottom: 6, width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: tint + '80' }} />
      </View>
      <Txt size={16} weight="bold" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {sub ? (
        <Txt size={13} color={t.sub} style={{ textAlign: 'center', lineHeight: 20 }}>
          {sub}
        </Txt>
      ) : null}
      {children ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}
