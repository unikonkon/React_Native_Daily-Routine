// แท็บ 3 — ตั้งค่า (ระบบ B1): การ์ดสรุปสัปดาห์ (→ สถิติ · ค้างบันทึก → ทบทวน) + เมนู 3 กลุ่ม
// การจัดการ · การแจ้งเตือนและการแสดงผล (ธีม → หน้า settings/theme) · ข้อมูลและขั้นสูง (ข้อมูลตัวอย่างมีขั้นยืนยัน)
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { StatusDot } from '@/components/b1/status-circle';
import { FadeInView, useEased } from '@/components/motion';
import { useNow } from '@/components/b1/use-now';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { Btn, Card, Chip, ChipRow, Row, Toggle, Txt, useTokens } from '@/components/ui';
import Constants from 'expo-constants';

import { CATS, DARK_THEMES, GREEN, LIGHT_THEMES } from '@/constants/theme';
import { MONTH_TH_FULL, addDays, beYear, fmtMin, fromISO, nowMin, todayISO } from '@/lib/dates';
import { restoreAll } from '@/lib/db';
import { computeStats } from '@/lib/engine';
import { overdueBetween } from '@/lib/progress';
import { buildMockMonth } from '@/lib/mock';
import { TT_SOURCE_LABEL } from '@/lib/mock-timetable';
import { notifPermissionGranted, requestNotifPermission } from '@/lib/notifications';
import { resyncNotifications, useActivities, useDayReader } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { MORNING_TIMES, useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export default function SettingsScreen() {
  const t = useTokens();
  const router = useRouter();
  const { acts, occ } = useActivities();
  const nContacts = useContacts((s) => s.list.length);
  const settings = useSettings();

  const stats = useMemo(() => computeStats(acts, occ, nowMin()), [acts, occ]);

  /** เปิด/ปิดการแจ้งเตือนทั้งแอป — เปิดแล้วขอสิทธิ์ของเครื่อง (ระบบไม่ให้ถามแล้ว = บอกให้ไปเปิดในการตั้งค่าเครื่อง) */
  const setMaster = async (v: boolean) => {
    settings.setNotifMaster(v);
    if (v) {
      const ok = await requestNotifPermission();
      setNotifDenied(!ok);
      if (!ok) showToast('เครื่องยังไม่อนุญาตการแจ้งเตือน — เปิดได้ที่การตั้งค่าเครื่อง', { label: 'ไปตั้งค่า', run: () => Linking.openSettings() });
    }
    resyncNotifications();
  };
  const setMorning = (v: boolean) => {
    settings.setMorning(v);
    resyncNotifications();
  };

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
      showToast(`นำเข้าตารางตัวอย่างเดือน${monthLabel} แล้ว (${data.activities.length} กิจกรรม · ${data.contacts.length} รายชื่อ)`);
    } catch {
      showToast('นำเข้าข้อมูลตัวอย่างไม่สำเร็จ');
    } finally {
      setSeeding(false);
    }
  };

  const getDay = useDayReader();
  const now = useNow();
  const overdue7 = useMemo(() => overdueBetween(getDay, addDays(now.date, -6), now.date, now).length, [getDay, now]);
  const lightName = LIGHT_THEMES.find((x) => x.id === settings.themeLight)?.name ?? '';
  const darkName = DARK_THEMES.find((x) => x.id === settings.themeDark)?.name ?? '';
  const split = CATS.filter((c) => stats.hoursByCat[c.id]).map((c) => ({ ...c, h: stats.hoursByCat[c.id] }));
  const totalH = split.reduce((a, c) => a + c.h, 0);

  return (
    <Screen title="ตั้งค่า" scrollRef={scrollRef}>
      {/* สรุปสัปดาห์นี้ — แตะหัวการ์ดเปิดสถิติเต็ม · แถวค้างบันทึก → หน้าทบทวน */}
      <View style={{ backgroundColor: t.card, borderRadius: 20, paddingTop: 12, paddingHorizontal: 16, shadowColor: t.shadow, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
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

        <View accessible accessibilityLabel={`ชั่วโมงตามหมวดสัปดาห์นี้: ${split.map((c) => `${c.short} ${c.h.toFixed(1)} ชั่วโมง`).join(', ') || 'ยังไม่มี'}`} style={{ marginTop: 8, gap: 6, paddingBottom: overdue7 ? 0 : 14 }}>
          {split.length ? (
            <>
              {/* แถบสัดส่วนเวลาจางเข้าพร้อมวงแหวนที่ค่อย ๆ เติม */}
              <FadeInView duration={420} style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', gap: 2 }}>
                {split.map((c) => (
                  <View key={c.id} style={{ flex: c.h / totalH, backgroundColor: c.color }} />
                ))}
              </FadeInView>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 }}>
                {split.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                    <Txt size={12} color={t.sub}>
                      {c.short}{' '}
                      <Txt size={12} num color={t.ink}>
                        {c.h.toFixed(1)}
                      </Txt>
                      {' ชม.'}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt size={12} color={t.sub}>
              ยังไม่มีรายการที่ทำเสร็จสัปดาห์นี้ — ติ๊กรายการแรกแล้วแถบนี้จะเริ่มเติม
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
              ยังไม่ได้บันทึก {overdue7} รายการ
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
        <Row
          icon="note"
          label="จัดการโน้ต"
          sub={`โน้ตสำเร็จรูป ${settings.noteSnippets.length} · แม่แบบต่อหมวด · จุดที่แสดงโน้ต`}
          onPress={() => router.push('/settings/notes')}
        />
        <Row icon="copy" label="คัดลอกกิจกรรม" sub="เลือกจากสัปดาห์/เดือน → วางวันอื่น" onPress={() => router.push('/settings/copy')} />
        <Row icon="trash" label="ลบรายการ" sub="เลือกทีละรายการ หรือทั้งวัน · สัปดาห์ · เดือน" onPress={() => router.push('/settings/delete')} last />
      </Section>

      <Section title="การแจ้งเตือนและการแสดงผล">
        <Row
          label="เปิดการแจ้งเตือน"
          sub={notifDenied ? 'เครื่องยังไม่อนุญาตให้แจ้งเตือน — แตะเพื่ออนุญาต' : 'ตั้งเวลาเตือนรายกิจกรรมได้ในฟอร์มเพิ่ม'}
          subColor={notifDenied ? t.warn : undefined}
          // แตะทั้งแถวได้ (ไม่ต้องเล็งสวิตช์) · ยังไม่ได้สิทธิ์ → ขอสิทธิ์ก่อน ถ้าระบบไม่ให้ถามแล้วค่อยพาไปการตั้งค่าเครื่อง
          onPress={
            notifDenied
              ? async () => {
                  const ok = await requestNotifPermission();
                  setNotifDenied(!ok);
                  if (ok) resyncNotifications();
                  else Linking.openSettings();
                }
              : () => setMaster(!settings.notifMaster)
          }
          right={<Toggle label="เปิดการแจ้งเตือน" value={settings.notifMaster} onChange={setMaster} />}
        />
        <Row
          label={`สรุปตอนเช้า ${fmtMin(settings.morningAt)}`}
          sub={settings.notifMaster ? 'แจ้งนัดเคสของวันนั้น' : 'ต้องเปิดการแจ้งเตือนก่อน'}
          onPress={settings.notifMaster ? () => setMorning(!settings.morning) : undefined}
          last={settings.notifMaster && settings.morning ? true : undefined}
          right={<Toggle label="สรุปตอนเช้า" value={settings.morning && settings.notifMaster} disabled={!settings.notifMaster} onChange={setMorning} />}
        />
        {/* เวลาของสรุปตอนเช้า — เลือกได้เมื่อเปิดอยู่ (เดิมล็อกที่ 06:00) */}
        {settings.notifMaster && settings.morning ? (
          <FadeInView rise={-6} style={{ paddingBottom: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }}>
            <Txt size={12} color={t.sub}>
              ส่งสรุปตอน
            </Txt>
            <ChipRow>
              {MORNING_TIMES.map((m) => (
                <Chip
                  key={m}
                  small
                  label={fmtMin(m)}
                  active={settings.morningAt === m}
                  onPress={() => {
                    settings.setMorningAt(m);
                    resyncNotifications();
                  }}
                />
              ))}
            </ChipRow>
          </FadeInView>
        ) : null}
        <Row
          label="ธีมและการแสดงผล"
          sub={`${settings.theme === 'system' ? 'ตามระบบ' : settings.theme === 'dark' ? 'โหมดมืด' : 'โหมดสว่าง'} · สว่าง: ${lightName} · มืด: ${darkName}`}
          onPress={() => router.push('/settings/theme')}
        />
        <Row label="วิธีใช้เบื้องต้น" sub="คำแนะนำการใช้ 4 ข้อ · เลือกโทนสีอีกครั้ง" onPress={() => useUI.getState().setGuide(true)} last />
      </Section>

      <Section title="ข้อมูลและขั้นสูง">
        <Row
          icon="download"
          label="สำรอง / นำเข้า · Google Sheets"
          sub={settings.sheetsUrl ? 'เชื่อม Google Sheets แล้ว' : 'ไฟล์สำรอง · Excel · CSV · ส่งขึ้น Sheets'}
          subColor={settings.sheetsUrl ? t.greenInk : undefined}
          onPress={() => router.push('/settings/data')}
        />
        <Row icon="bars" label="ล้างข้อมูลเก่า" sub="ดูความจุ · ลบถาวรเพื่อคืนพื้นที่ (กู้คืนได้จากไฟล์สำรองเท่านั้น)" onPress={() => router.push('/settings/manage')} last={!__DEV__} />
        {/* ข้อมูลตัวอย่าง = แทนที่ข้อมูลทั้งแอปด้วยตารางทดสอบ — มีเฉพาะตอนพัฒนา ไม่ขึ้นในแอปที่ปล่อยให้ผู้ใช้ */}
        {__DEV__ ? (
          <Row
            label="ข้อมูลตัวอย่าง (เฉพาะตอนพัฒนา)"
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
        ) : null}
      </Section>

      {__DEV__ && confirmSeed ? (
        <FadeInView rise={6} style={{ backgroundColor: t.card, borderRadius: 20, borderWidth: 1.5, borderColor: t.warn, padding: 14, gap: 10 }}>
          <Txt size={15} weight="bold">
            นำเข้าตารางตัวอย่างเป็นเดือน{monthLabel}?
          </Txt>
          <Txt size={12.5} color={t.sub} style={{ lineHeight: 19 }}>
            ใช้ตารางจากไฟล์ {TT_SOURCE_LABEL} มาลงเดือนนี้ทั้งเดือน (จับคู่ตามวันในสัปดาห์ · เก็บสีเดิมของไฟล์){'\n'}
            จะลบข้อมูลปัจจุบันทั้งหมด (กิจกรรม/สถานะ/รายชื่อ) ก่อน — สำรองไว้ก่อนที่ ข้อมูล → สำรอง
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ไม่ใส่" disabled={seeding} onPress={() => setConfirmSeed(false)} />
            <Btn style={{ flex: 1 }} kind="danger" label={seeding ? 'กำลังนำเข้า…' : 'แทนที่ด้วยตัวอย่าง'} disabled={seeding} onPress={seedNow} />
          </View>
        </FadeInView>
      ) : null}

      <Txt size={11.5} color={t.sub} style={{ textAlign: 'center', marginTop: 4 }}>
        {Constants.expoConfig?.name ?? 'Daily Routine'} · เวอร์ชัน {Constants.expoConfig?.version ?? '1.0.0'} · ข้อมูลเก็บในเครื่องนี้
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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_R = 23;
const RING_C = 2 * Math.PI * RING_R;

/** วงแหวน % สำเร็จ — เปิดหน้าครั้งแรกค่อย ๆ เติมจาก 0 (0.5 วิ) และเลื่อนตามเมื่อค่าเปลี่ยน */
function ProgressRing({ pct }: { pct: number }) {
  const t = useTokens();
  const R = RING_R;
  const C = RING_C;
  const p = useEased(pct, 500, 0);
  const ring = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - p.value) }));
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={56} height={56} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={28} cy={28} r={R} stroke={t.track} strokeWidth={7} fill="none" />
        <AnimatedCircle
          cx={28}
          cy={28}
          r={R}
          // ต่ำกว่า 70% ใช้สีเน้นของธีม (ไม่ใช่ส้มเตือน) — ต้นสัปดาห์เปิดมา 0% ไม่ควรดูเหมือนมีอะไรผิด
          stroke={pct >= 0.7 ? GREEN : t.accent}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${C}`}
          animatedProps={ring}
        />
      </Svg>
      <Txt size={14} num weight="bold">{Math.round(pct * 100)}%</Txt>
    </View>
  );
}
