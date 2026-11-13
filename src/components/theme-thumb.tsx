// หน้าจอย่อของธีม — ใช้ในหน้าเลือกธีม (ตั้งค่า) และหน้าต้อนรับ
import React from 'react';
import { View } from 'react-native';

import { useTokens } from '@/components/ui';
import { GREEN, type Palette } from '@/constants/theme';

/** หน้าจอย่อของธีม — วาดด้วยสีของธีมนั้นเอง (ไม่ใช่ธีมที่ใช้อยู่): พื้น · การ์ด · วงวันนี้ · รายการ · ปุ่มหลัก */
export function ThemeThumb({ p }: { p: Palette }) {
  const t = useTokens();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: 92, height: 66, borderRadius: 12, backgroundColor: p.bg, borderWidth: 1, borderColor: t.line2, padding: 6, gap: 5, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flex: 1, height: 11, borderRadius: 4, backgroundColor: i === 1 ? p.card : p.track, borderWidth: i === 1 ? 1.5 : 0, borderColor: p.accent }} />
        ))}
      </View>
      <View style={{ flex: 1, backgroundColor: p.card, borderRadius: 7, paddingHorizontal: 6, justifyContent: 'center', gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
          <View style={{ width: 30, height: 3, borderRadius: 2, backgroundColor: p.faint }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: p.accent }} />
          <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: p.ink }} />
          <View style={{ marginLeft: 'auto', width: 20, height: 9, borderRadius: 5, backgroundColor: p.primary }} />
        </View>
      </View>
    </View>
  );
}
