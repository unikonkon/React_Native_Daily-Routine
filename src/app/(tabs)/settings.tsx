// แท็บ 3 — ตั้งค่า (ระบบ B1): การ์ดสรุปสัปดาห์ (→ สถิติ · ค้างบันทึก → ทบทวน) + เมนู 3 กลุ่ม
// การจัดการ · การแจ้งเตือนและการแสดงผล (โหมด สว่าง/มืด/ตามระบบ) · ข้อมูลและขั้นสูง (ข้อมูลตัวอย่างมีขั้นยืนยัน)
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { StatusDot } from '@/components/b1/status-circle';
import { useNow } from '@/components/b1/use-now';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { Btn, Card, Row, Segmented, Toggle, Txt, useTokens } from '@/components/ui';
import { CATS, GREEN, type ThemePref } from '@/constants/theme';
import { MONTH_TH_FULL, addDays, beYear, fromISO, nowMin, todayISO } from '@/lib/dates';
import { restoreAll } from '@/lib/db';
import { computeStats } from '@/lib/engine';
import { overdueBetween } from '@/lib/progress';
import { buildMockMonth } from '@/lib/mock';
import { TT_SOURCE_LABEL } from '@/lib/mock-timetable';
import { notifPermissionGranted, requestNotifPermission, requestResync } from '@/lib/notifications';
import { useActivities, useDayReader } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export default function SettingsScreen() {
  const t = useTokens();
  const router = useRouter();
  const { acts, occ } = useActivities();
  const nContacts = useContacts((s) => s.list.length);
  const settings = useSettings();

  const stats = useMemo(() => computeStats(acts, occ, nowMin()), [acts, occ]);

  const syncNotif = (master: boolean, morning: boolean) => requestResync(acts, occ, master, morning);

  // ข้อมูลตัวอย่าง = ตารางจริงจากไฟล์ "Time Table จอย.xlsx" นำเข้าเป็นเดือนปัจจุบัน 1 เดือน (แทนที่ข้อมูลเดิมทั้งหมด)
  const showToast = useUI((s) => s.showToast);
  const today = todayISO();
  const monthLabel = `${MONTH_TH_FULL[fromISO(today).getMonth()]} ${beYear(Number(today.slice(0, 4)))}`;
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // กล่องยืนยันอยู่ท้ายหน้า — เลื่อนลงไปให้เห็นทันทีที่กด
  useEffect(() => {
    if (!confirmSeed) return;
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [confirmSeed]);

  // สิทธิ์แจ้งเตือนของเครื่อง — ถูกปฏิเสธไว้ต้องบอกผู้ใช้ (สวิตช์ในแอปเปิดอยู่ก็ไม่มีแจ้งเตือนเด้ง)
  const [notifDenied, setNotifDenied] = useState(false);
  const notifMaster = settings.notifMaster;
  useEffect(() => {
    const check = () => {
      if (!notifMaster) return setNotifDenied(false);
      notifPermissionGranted().then((ok) => setNotifDenied(!ok)).catch(() => {});
    };
    check();
    // กลับมาจากหน้าตั้งค่าของเครื่อง → ตรวจใหม่
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, [notifMaster]);

  const seedNow = async () => {
    setSeeding(true);
    try {
      const data = buildMockMonth(today);
      await restoreAll(data, 'replace');
      await Promise.all([useActivities.getState().boot(), useContacts.getState().boot()]);
      setConfirmSeed(false);
      showToast(`นำเข้าตารางตัวอย่างเดือน${monthLabel} แล้ว ✓ (${data.activities.length} กิจกรรม · ${data.contacts.length} รายชื่อ)`);
    } catch {
      showToast('นำเข้าข้อมูลตัวอย่างไม่สำเร็จ');
    } finally {
      setSeeding(false);
    }
  };

  const getDay = useDayReader();
  const now = useNow();
  const overdue7 = useMemo(() => overdueBetween(getDay, addDays(now.date, -6), now.date, now).length, [getDay, now]);
  const split = CATS.filter((c) => stats.hoursByCat[c.id]).map((c) => ({ ...c, h: stats.hoursByCat[c.id] }));
  const totalH = split.reduce((a, c) => a + c.h, 0);

  return (
    <Screen title="ตั้งค่า" scrollRef={scrollRef}>
      {/* สรุปสัปดาห์นี้ — แตะหัวการ์ดเปิดสถิติเต็ม · แถวค้างบันทึก → หน้าทบทวน */}
      <View style={{ backgroundColor: t.card, borderRadius: 16, paddingTop: 12, paddingHorizontal: 16, shadowColor: '#221C13', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`ความสำเร็จสัปดาห์นี้ ${Math.round(stats.rate * 100)}% — ดูสถิติทั้งหมด`}
          onPress={() => router.push('/settings/stats')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
          <ProgressRing pct={stats.rate} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Txt size={15} weight="bold">
              ความสำเร็จสัปดาห์นี้
            </Txt>
            <Txt size={12.5} color={t.sub}>
              เสร็จ {stats.doneWeek}/{stats.dueWeek}
              {stats.streak > 0 ? (
                <Txt size={12.5} weight="bold" color={t.greenInk}>
                  {` · ติดต่อกัน ${stats.streak} วัน`}
                </Txt>
              ) : null}
            </Txt>
          </View>
          <Txt size={13.5} weight="bold" color={t.accentInk}>
            สถิติ
          </Txt>
          <SvgIcon name="chevR" size={16} color={t.accentInk} strokeWidth={2.2} />
        </Pressable>

        <View accessible accessibilityLabel={`ชั่วโมงตามหมวด: ${split.map((c) => `${c.short} ${c.h.toFixed(1)}`).join(', ') || 'ยังไม่มี'}`} style={{ marginTop: 8, gap: 6, paddingBottom: overdue7 ? 0 : 14 }}>
          {split.length ? (
            <>
              <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', gap: 2 }}>
                {split.map((c) => (
                  <View key={c.id} style={{ flex: c.h / totalH, backgroundColor: c.color }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 }}>
                {split.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                    <Txt size={12} color={t.sub}>
                      {c.short}{' '}
                      <Txt size={12} num color={t.ink}>
                        {c.h.toFixed(1)}
                      </Txt>
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt size={12} color={t.faint}>
              ยังไม่มีรายการที่ทำเสร็จสัปดาห์นี้
            </Txt>
          )}
        </View>

        {overdue7 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/review')}
            style={({ pressed }) => ({ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, opacity: pressed ? 0.7 : 1 })}>
            <StatusDot state="overdue" />
            <Txt size={14} weight="bold" color={t.warn} style={{ flex: 1 }}>
              ค้างบันทึก {overdue7} รายการ
            </Txt>
            <Txt size={13.5} weight="bold" color={t.accentInk}>
              ทบทวน
            </Txt>
            <SvgIcon name="chevR" size={16} color={t.accentInk} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      <Section title="การจัดการ">
        <Row icon="user" label="สมุดรายชื่อ" sub={`${nContacts} รายชื่อ · ใช้กับนัดเคส`} onPress={() => router.push('/settings/contacts')} />
        <Row icon="grid" label="หมวดหมู่" sub={`${CATS.length} หมวด · ชื่อที่ใช้บ่อย ประเภท สถานที่`} onPress={() => router.push('/settings/categories')} />
        <Row icon="copy" label="คัดลอกกิจกรรม" sub="เลือกจากสัปดาห์/เดือน → วางวันอื่น" onPress={() => router.push('/settings/copy')} />
        <Row icon="trash" label="ลบรายการ" sub="เลือกทีละรายการ หรือทั้งวัน · สัปดาห์ · เดือน" onPress={() => router.push('/settings/delete')} last />
      </Section>

      <Section title="การแจ้งเตือนและการแสดงผล">
        <Row
          label="เปิดการแจ้งเตือน"
          sub={notifDenied ? 'เครื่องไม่อนุญาตให้แจ้งเตือน — แตะเพื่อเปิดในการตั้งค่าเครื่อง' : 'ตั้งเวลาเตือนรายกิจกรรมได้ในฟอร์มเพิ่ม'}
          subColor={notifDenied ? t.warn : undefined}
          onPress={notifDenied ? () => Linking.openSettings() : undefined}
          right={
            <Toggle
              label="เปิดการแจ้งเตือน"
              value={settings.notifMaster}
              onChange={async (v) => {
                settings.setNotifMaster(v);
                if (v) {
                  const ok = await requestNotifPermission();
                  setNotifDenied(!ok);
                  if (!ok) showToast('เครื่องยังไม่อนุญาตการแจ้งเตือน — เปิดได้ที่การตั้งค่าเครื่อง');
                }
                syncNotif(v, settings.morning);
              }}
            />
          }
        />
        <Row
          label="สรุปตอนเช้า 06:00"
          sub="แจ้งนัดเคสของวันนั้น"
          right={
            <Toggle
              label="สรุปตอนเช้า"
              value={settings.morning}
              onChange={(v) => {
                settings.setMorning(v);
                syncNotif(settings.notifMaster, v);
              }}
            />
          }
        />
        <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Txt size={14.5} style={{ flex: 1 }}>
            โหมดแสดงผล
          </Txt>
          <View style={{ width: 216 }}>
            <Segmented<ThemePref>
              options={[
                { key: 'light', label: 'สว่าง' },
                { key: 'dark', label: 'มืด' },
                { key: 'system', label: 'ตามระบบ' },
              ]}
              value={settings.theme}
              onChange={settings.setTheme}
            />
          </View>
        </View>
      </Section>

      <Section title="ข้อมูลและขั้นสูง">
        <Row
          icon="download"
          label="สำรอง / นำเข้า · Google Sheets"
          sub={settings.sheetsUrl ? 'เชื่อม Google Sheets แล้ว' : 'Excel · CSV · JSON · ส่งขึ้น Sheets'}
          subColor={settings.sheetsUrl ? t.greenInk : undefined}
          onPress={() => router.push('/settings/data')}
        />
        <Row icon="bars" label="ล้างข้อมูลเก่า" sub="ดูความจุ · ลบถาวรเพื่อคืนพื้นที่ (กู้คืนได้จากไฟล์สำรองเท่านั้น)" onPress={() => router.push('/settings/manage')} />
        <Row
          label="ข้อมูลตัวอย่าง"
          sub={`ตาราง 1 เดือน (${monthLabel}) ไว้ทดลอง — แทนที่ข้อมูลเดิม`}
          last
          right={
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmSeed(true)}
              style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: pressed ? t.rail : t.track, justifyContent: 'center' })}>
              <Txt size={13.5} weight="bold">
                ใส่ตัวอย่าง
              </Txt>
            </Pressable>
          }
        />
      </Section>

      {confirmSeed ? (
        <View style={{ backgroundColor: t.card, borderRadius: 16, borderWidth: 1.5, borderColor: t.warn, padding: 14, gap: 10 }}>
          <Txt size={15} weight="bold">
            นำเข้าตารางตัวอย่างเป็นเดือน{monthLabel}?
          </Txt>
          <Txt size={12.5} color={t.sub} style={{ lineHeight: 19 }}>
            ใช้ตารางจริงจากไฟล์ {TT_SOURCE_LABEL} มาลงเดือนนี้ทั้งเดือน (จับคู่ตามวันในสัปดาห์ · เก็บสีเดิมของไฟล์){'\n'}
            จะลบข้อมูลปัจจุบันทั้งหมด (กิจกรรม/สถานะ/รายชื่อ) ก่อน — สำรองไว้ก่อนที่ ข้อมูล → สำรอง
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ไม่ใส่" disabled={seeding} onPress={() => setConfirmSeed(false)} />
            <Btn style={{ flex: 1 }} kind="danger" label={seeding ? 'กำลังนำเข้า…' : 'แทนที่ด้วยตัวอย่าง'} disabled={seeding} onPress={seedNow} />
          </View>
        </View>
      ) : null}

      <Txt size={11} color={t.faint} style={{ textAlign: 'center', marginTop: 4 }}>
        ตารางชีวิตจอย · v2 · Offline-first
      </Txt>
    </Screen>
  );
}

/** หัวกลุ่มเมนู + การ์ดรวมแถว */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} weight="bold" color={t.sub} style={{ marginHorizontal: 2 }}>
        {title}
      </Txt>
      <Card style={{ paddingVertical: 0, paddingHorizontal: 14 }}>{children}</Card>
    </View>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const t = useTokens();
  const R = 23;
  const C = 2 * Math.PI * R;
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={56} height={56} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={28} cy={28} r={R} stroke={t.track} strokeWidth={7} fill="none" />
        <Circle
          cx={28}
          cy={28}
          r={R}
          stroke={pct >= 0.7 ? GREEN : '#D2603A'}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${C}`}
          strokeDashoffset={C * (1 - pct)}
        />
      </Svg>
      <Txt size={14} num weight="bold">{Math.round(pct * 100)}%</Txt>
    </View>
  );
}
