// ⑤ ทบทวนรายการค้าง — หน้าย่อย (ระบบ B1): รายการที่เลยเวลาแล้วแต่ยังไม่ได้บอกว่าทำหรือข้าม
// แยกตามวันบนราง · วงกลม = บันทึกว่าทำแล้ว · ปุ่ม "ข้าม" ต่อแถว · ล่าง: ‹ กลับ + ทำแล้วทั้งหมด (มี toast เลิกทำ)
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Rail } from '@/components/b1/rail';
import { useNow } from '@/components/b1/use-now';
import { useToggleStatus } from '@/components/b1/use-toggle';
import { Screen } from '@/components/screen';
import { Segmented, Txt, useTokens } from '@/components/ui';
import { addDays, thaiDate } from '@/lib/dates';
import { overdueBetween } from '@/lib/progress';
import type { DayItem, OccStatus } from '@/lib/types';
import { useActivities, useDayReader } from '@/stores/activities';
import { useUI } from '@/stores/ui';

type Range = '7' | '30';
const keyOf = (it: Pick<DayItem, 'id' | 'date'>) => `${it.id}:${it.date}`;

export default function ReviewScreen() {
  const t = useTokens();
  const now = useNow();
  const getDay = useDayReader();
  const setStatus = useActivities((s) => s.setStatus);
  const notes = useActivities((s) => s.notes);
  const showToast = useUI((s) => s.showToast);
  const openSheet = useUI((s) => s.openSheet);
  const toggle = useToggleStatus();
  const [range, setRange] = useState<Range>('7');
  const [confirmSkip, setConfirmSkip] = useState(false);
  // รายการที่เพิ่งจัดการในหน้านี้ — ยังโชว์ต่อ (ขีดฆ่า/ข้าม) ให้เห็นผลและแตะกลับได้ จนกว่าจะออกจากหน้า
  const [handled, setHandled] = useState<string[]>([]);

  const n7 = useMemo(() => overdueBetween(getDay, addDays(now.date, -6), now.date, now).length, [getDay, now]);
  const n30 = useMemo(() => overdueBetween(getDay, addDays(now.date, -29), now.date, now).length, [getDay, now]);

  const from = addDays(now.date, range === '7' ? -6 : -29);
  const pending = useMemo(() => overdueBetween(getDay, from, now.date, now), [getDay, from, now]);

  // รวมรายการค้าง + ที่เพิ่งจัดการ แล้วแยกตามวัน (ใหม่ → เก่า)
  const groups = useMemo(() => {
    const byKey = new Map<string, DayItem>(pending.map((it) => [keyOf(it), it]));
    for (const k of handled) {
      if (byKey.has(k)) continue;
      const [id, date] = [Number(k.split(':')[0]), k.split(':')[1]];
      if (date < from) continue;
      const it = getDay(date).find((x) => x.id === id);
      if (it) byKey.set(k, it);
    }
    const map = new Map<string, DayItem[]>();
    for (const it of byKey.values()) (map.get(it.date) ?? map.set(it.date, []).get(it.date)!).push(it);
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, list]) => ({ date, list: list.sort((a, b) => a.startMin - b.startMin) }));
  }, [pending, handled, getDay, from]);

  const mark = (k: string) => setHandled((h) => (h.includes(k) ? h : [...h, k]));

  const skip = (it: DayItem) => {
    const prev: OccStatus | null = it.ostatus === 'planned' ? null : it.ostatus;
    mark(keyOf(it));
    setStatus(it, 'skipped');
    showToast(`ข้าม “${it.title.length > 20 ? `${it.title.slice(0, 19)}…` : it.title}” แล้ว`, { label: 'เลิกทำ', run: () => setStatus(it, prev) });
  };

  const bulk = (status: OccStatus) => {
    const list = [...pending];
    if (!list.length) return;
    for (const it of list) {
      mark(keyOf(it));
      setStatus(it, status);
    }
    showToast(`${status === 'done' ? 'บันทึกว่าทำแล้ว' : 'ข้าม'} ${list.length} รายการ`, {
      label: 'เลิกทำ',
      run: () => list.forEach((it) => setStatus(it, null)),
    });
    setConfirmSkip(false);
  };

  const dayLabel = (d: string) => (d === now.date ? 'วันนี้' : d === addDays(now.date, -1) ? 'เมื่อวาน' : '');

  return (
    <Screen
      title="ค้างบันทึก"
      subtitle="เลยเวลาแล้ว แต่ยังไม่ได้บอกว่าทำหรือข้าม"
      variant="sub"
      action={pending.length ? { label: `ทำแล้วทั้งหมด (${pending.length})`, icon: 'check', onPress: () => bulk('done') } : undefined}>
      <Segmented<Range>
        options={[
          { key: '7', label: `7 วันล่าสุด · ${n7}` },
          { key: '30', label: `30 วัน · ${n30}` },
        ]}
        value={range}
        onChange={(r) => {
          setRange(r);
          setConfirmSkip(false);
        }}
      />

      {pending.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt size={12.5} color={t.sub} style={{ flex: 1 }}>
            แตะวงกลมเพื่อบันทึกว่าทำแล้ว · แตะรายการเพื่อดูรายละเอียด
          </Txt>
          <Pressable
            accessibilityRole="button"
            onPress={() => (confirmSkip ? bulk('skipped') : setConfirmSkip(true))}
            hitSlop={6}
            style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: confirmSkip ? t.warn : 'transparent', justifyContent: 'center' }}>
            <Txt size={13} weight="bold" color={confirmSkip ? '#FFFFFF' : t.sub}>
              {confirmSkip ? `ยืนยันข้าม ${pending.length}` : 'ข้ามทั้งหมด…'}
            </Txt>
          </Pressable>
        </View>
      ) : null}

      {groups.length ? (
        groups.map((g) => {
          const left = g.list.filter((it) => it.ostatus === 'planned').length;
          return (
            <View key={g.date} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Txt size={13} weight="bold" color={t.sub}>
                  {dayLabel(g.date) ? `${dayLabel(g.date)} · ` : ''}
                  {thaiDate(g.date)}
                </Txt>
                <Txt size={12} color={t.muted}>
                  {left ? `${left} รายการ` : 'บันทึกครบแล้ว'}
                </Txt>
              </View>
              <Rail
                items={g.list}
                now={now}
                onPressItem={(it) => openSheet(it.id, it.date)}
                onToggle={(it, st) => {
                  mark(keyOf(it));
                  toggle(it, st);
                }}
                noteOf={(it) => notes[it.date]?.[it.id]}
                renderRight={(it) =>
                  it.ostatus === 'planned' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`ข้าม ${it.title}`}
                      onPress={() => skip(it)}
                      style={({ pressed }) => ({ height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: pressed ? t.rail : t.track, justifyContent: 'center' })}>
                      <Txt size={13} weight="med" color={t.sub}>
                        ข้าม
                      </Txt>
                    </Pressable>
                  ) : null
                }
              />
            </View>
          );
        })
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 48, gap: 6 }}>
          <Txt size={16} weight="bold">
            บันทึกครบทุกรายการแล้ว
          </Txt>
          <Txt size={13} color={t.sub}>
            ไม่มีรายการค้างใน{range === '7' ? ' 7 วันล่าสุด' : ' 30 วัน'}
          </Txt>
        </View>
      )}
    </Screen>
  );
}
