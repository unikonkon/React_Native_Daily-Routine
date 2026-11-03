// แถววันที่ของหน้าปฏิทิน (ระบบ B1) — หัวเรื่องใหญ่ + บรรทัดสรุป (แตะ → เดือน) และตัวกรองมุมมอง 4 ไอคอนทางขวา
// ไอคอนทั้ง 4 อันกดได้ตลอด (ไม่ซ่อนใน dropdown) · อันที่เลือกอยู่ = พื้นขาว + ไอคอนสีส้ม
import React from 'react';
import { Pressable, View } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';

export type CalView = 'day' | 'week' | 'month' | 'year';

const VIEWS: { key: CalView; label: string; icon: string }[] = [
  { key: 'day', label: 'วัน', icon: 'viewDay' },
  { key: 'week', label: 'สัปดาห์', icon: 'viewWeek' },
  { key: 'month', label: 'เดือน', icon: 'viewMonth' },
  { key: 'year', label: 'ปี', icon: 'viewYear' },
];

export function ViewFilter({ value, onChange }: { value: CalView; onChange: (v: CalView) => void }) {
  const t = useTokens();
  return (
    <View accessibilityRole="tablist" accessibilityLabel="มุมมอง" style={{ flexDirection: 'row', gap: 2, backgroundColor: t.track, padding: 3, borderRadius: 14 }}>
      {VIEWS.map((v) => {
        const on = v.key === value;
        return (
          <Pressable
            key={v.key}
            accessibilityRole="tab"
            accessibilityLabel={v.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) onChange(v.key);
            }}
            style={{
              width: 40,
              height: 38,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.card : 'transparent',
              shadowColor: '#221C13',
              shadowOpacity: on ? 0.12 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: on ? 1 : 0,
            }}>
            <SvgIcon name={v.icon} size={20} color={on ? t.accentInk : t.sub} strokeWidth={on ? 1.9 : 1.8} />
          </Pressable>
        );
      })}
    </View>
  );
}

interface DateHeaderProps {
  title: string;
  summary?: string;
  /** แตะหัวเรื่อง (เช่น ไปมุมมองเดือน/ปี) */
  onPressTitle?: () => void;
  view: CalView;
  onChangeView: (v: CalView) => void;
}

export function DateHeader({ title, summary, onPressTitle, view, onChangeView }: DateHeaderProps) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4 }}>
      <Pressable accessibilityRole="button" onPress={onPressTitle} disabled={!onPressTitle} style={{ flex: 1, minWidth: 0 }}>
        <Txt size={22} weight="bold" numberOfLines={1}>
          {title}
        </Txt>
        {summary ? (
          <Txt size={12.5} color={t.sub} numberOfLines={2}>
            {summary}
          </Txt>
        ) : null}
      </Pressable>
      <ViewFilter value={view} onChange={onChangeView} />
    </View>
  );
}
