// แถววันที่ของหน้าปฏิทิน (ระบบ B1) — หัวเรื่องใหญ่ + บรรทัดสรุป (แตะ → เดือน) และตัวกรองมุมมอง 4 ไอคอนทางขวา
// ไอคอนทั้ง 4 อันกดได้ตลอด (ไม่ซ่อนใน dropdown) · อันที่เลือกอยู่ = พื้นขาว + ไอคอนสีส้ม
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useEased } from '@/components/motion';
import { SvgIcon } from '@/components/svg-icon';
import { Txt, pressFade, useTokens } from '@/components/ui';

export type CalView = 'day' | 'week' | 'month' | 'year';

const VIEWS: { key: CalView; label: string; icon: string }[] = [
  { key: 'day', label: 'วัน', icon: 'viewDay' },
  { key: 'week', label: 'สัปดาห์', icon: 'viewWeek' },
  { key: 'month', label: 'เดือน', icon: 'viewMonth' },
  { key: 'year', label: 'ปี', icon: 'viewYear' },
];

const CELL_W = 44;
const CELL_GAP = 2;
/**
 * ตำแหน่งล่าสุดของแผ่นขาว — หัวของมุมมองวันกับมุมมองอื่นเป็นคนละชิ้น (ถูกสร้างใหม่ตอนสลับ)
 * จำไว้นอกคอมโพเนนต์ ให้แผ่นขาวของชิ้นใหม่เริ่มเลื่อนจากตำแหน่งเดิม ไม่โผล่ที่ปลายทางทันที
 */
let lastIdx = 0;

export function ViewFilter({ value, onChange }: { value: CalView; onChange: (v: CalView) => void }) {
  const t = useTokens();
  const idx = Math.max(VIEWS.findIndex((v) => v.key === value), 0);
  const pos = useEased(idx, 220, lastIdx);
  useEffect(() => {
    lastIdx = idx;
  }, [idx]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * (CELL_W + CELL_GAP) }] }));
  return (
    <View accessibilityRole="tablist" accessibilityLabel="มุมมอง" style={{ flexDirection: 'row', gap: CELL_GAP, backgroundColor: t.track, padding: 3, borderRadius: 14 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: 3, top: 3, width: CELL_W, height: 38, borderRadius: 11, backgroundColor: t.card, shadowColor: t.shadow, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
          thumb,
        ]}
      />
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
            style={pressFade({ width: CELL_W, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' })}>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingBottom: 6 }}>
      <Pressable accessibilityRole="button" onPress={onPressTitle} disabled={!onPressTitle} style={pressFade({ flex: 1, minWidth: 0 })}>
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
