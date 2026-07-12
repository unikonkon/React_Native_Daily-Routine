// มุมมองสัปดาห์: 7 คอลัมน์ (จันทร์เริ่ม) 06:00–30:00 ครบ 24 ชม. — ใช้ทั้งแท็บวันนี้ (normal) และสรุปวันว่าง (free)
import { Pressable, ScrollView, View } from 'react-native';

import { Txt, useTokens } from '@/components/ui';
import { CAT_BY_ID, DAY_END, DAY_START, GREEN } from '@/constants/theme';
import { WD_TH, addDays, fmtMin, fromISO, todayISO } from '@/lib/dates';
import { freeSlots } from '@/lib/engine';
import { useDayReader } from '@/stores/activities';

const W_START = DAY_START;
const W_END = DAY_END;
const PX = 0.4; // 24px/ชม. — พอสำหรับป้ายเวลาทุก 1 ชม.

interface WeekGridProps {
  monday: string;
  mode?: 'normal' | 'free';
  onPressDay: (iso: string) => void;
}

export function WeekGrid({ monday, mode = 'normal', onPressDay }: WeekGridProps) {
  const t = useTokens();
  const getDay = useDayReader(); // อ่านผ่าน hook — อัปเดตเมื่อข้อมูลเปลี่ยน (ปลอดภัยกับ React Compiler)
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const height = (W_END - W_START) * PX;
  // ป้ายเวลาทุก 1 ชม. (รวมชั่วโมงเลขคี่): 06:00 → 06:00 (+1)
  const rules = [];
  for (let m = W_START; m <= W_END; m += 60) rules.push(m);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 140 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <View style={{ width: 34 }} />
        {days.map((d) => (
          <Pressable key={d} onPress={() => onPressDay(d)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
            <Txt size={11} color={t.faint}>
              {WD_TH[days.indexOf(d)]}
            </Txt>
            <Txt size={13} num weight={d === today ? 'bold' : 'med'} color={d === today ? t.ink : t.sub}>
              {fromISO(d).getDate()}
            </Txt>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 4, height }}>
        <View style={{ width: 34 }}>
          {/* กึ่งกลางป้าย = พิกัดนาที + 1px (ชดเชย border คอลัมน์) ให้ตรงขอบบนบล็อกกิจกรรมพอดี */}
          {rules.map((m) => (
            <Txt key={m} size={9} num color={t.faint} style={{ position: 'absolute', top: (m - W_START) * PX - 5, lineHeight: 12 }}>
              {fmtMin(m)}
            </Txt>
          ))}
        </View>
        {days.map((d) => {
          const items = getDay(d);
          const slots = mode === 'free' ? freeSlots(items) : [];
          return (
            <Pressable key={d} onPress={() => onPressDay(d)} style={{ flex: 1 }}>
              <View style={{ flex: 1, backgroundColor: t.card, borderRadius: 8, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                {items.map((it) => {
                  const color = CAT_BY_ID[it.cat].color;
                  const dim = mode === 'free' ? 0.35 : it.ostatus === 'rescheduled' ? 0.35 : it.ostatus === 'done' ? 1 : 0.6;
                  return (
                    <View
                      key={`${it.id}:${d}`}
                      style={{
                        position: 'absolute',
                        top: (Math.max(it.startMin, W_START) - W_START) * PX,
                        left: 2,
                        right: 2,
                        height: Math.max((Math.min(it.endMin, W_END) - Math.max(it.startMin, W_START)) * PX, 4),
                        borderRadius: 3,
                        backgroundColor: color,
                        opacity: dim,
                      }}
                    />
                  );
                })}
                {slots.map((s) => (
                  <View
                    key={s.start}
                    style={{
                      position: 'absolute',
                      top: (Math.max(s.start, W_START) - W_START) * PX,
                      left: 2,
                      right: 2,
                      height: Math.max((Math.min(s.end, W_END) - Math.max(s.start, W_START)) * PX, 4),
                      borderRadius: 3,
                      backgroundColor: GREEN,
                      opacity: 0.9,
                    }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
