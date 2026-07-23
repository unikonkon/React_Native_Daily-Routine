// แท็บ 4 — ตั้งค่า: การ์ดสถิติ + เมนู (APP_STRUCTURE.md §6)
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Btn, Card, Row, Segmented, Toggle, Txt, useTokens } from '@/components/ui';
import { ACCENT, CATS, GREEN } from '@/constants/theme';
import { beYear, nowMin, todayISO } from '@/lib/dates';
import { restoreAll } from '@/lib/db';
import { computeStats } from '@/lib/engine';
import { buildMockYear } from '@/lib/mock';
import { requestResync } from '@/lib/notifications';
import { useActivities } from '@/stores/activities';
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
  const maxH = Math.max(...Object.values(stats.hoursByCat), 1);

  const syncNotif = (master: boolean, morning: boolean) => requestResync(acts, occ, master, morning);

  // สร้างข้อมูลตัวอย่าง 1 ปี (แทนที่ข้อมูลเดิมทั้งหมด) — ใช้ทดสอบสถิติ/จัดการข้อมูล/Export
  const showToast = useUI((s) => s.showToast);
  const year = Number(todayISO().slice(0, 4));
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const seedNow = async () => {
    setSeeding(true);
    try {
      const data = buildMockYear(year);
      await restoreAll(data, 'replace');
      await Promise.all([useActivities.getState().boot(), useContacts.getState().boot()]);
      setConfirmSeed(false);
      showToast(`สร้างข้อมูลตัวอย่างปี ${beYear(year)} แล้ว ✓ (${data.activities.length} กิจกรรม · ${data.contacts.length} รายชื่อ)`);
    } catch {
      showToast('สร้างข้อมูลตัวอย่างไม่สำเร็จ');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Screen title="ตั้งค่า" subtitle="สถิติ & ค่าระบบ">
      {/* สถิติ — แตะเพื่อเปิดหน้ารายงานสถิติเต็ม (สัปดาห์ · เดือน · ทั้งหมด) */}
      <Pressable onPress={() => router.push('/settings/stats')}>
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <ProgressRing pct={stats.rate} />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt size={14} weight="bold">ความสำเร็จสัปดาห์นี้</Txt>
              <Txt size={12} color={t.sub}>🔥 {stats.streak} วันติดต่อ (streak)</Txt>
              <Txt size={12} color={t.sub}>✓ เสร็จสัปดาห์นี้ {stats.doneWeek} รายการ</Txt>
            </View>
            <Icon name="chevR" size={18} color={t.faint} />
          </View>
          <View style={{ gap: 6 }}>
            {CATS.filter((c) => stats.hoursByCat[c.id]).map((c) => {
              const h = stats.hoursByCat[c.id];
              return (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={11} color={t.sub} style={{ width: 76 }} numberOfLines={1}>{c.short}</Txt>
                  <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: t.chip }}>
                    <View style={{ width: `${(h / maxH) * 100}%`, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                  </View>
                  <Txt size={11} num color={t.faint} style={{ width: 36, textAlign: 'right' }}>
                    {h.toFixed(1)}ช
                  </Txt>
                </View>
              );
            })}
            {Object.keys(stats.hoursByCat).length === 0 ? (
              <Txt size={12} color={t.faint}>ยังไม่มีรายการที่ทำเสร็จสัปดาห์นี้</Txt>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line2, paddingTop: 10 }}>
            <Txt size={12.5} weight="med" color={ACCENT} style={{ flex: 1 }}>ดูรายงานสถิติทั้งหมด · สัปดาห์ · เดือน · ทั้งหมด</Txt>
            <Icon name="chevR" size={16} color={ACCENT} />
          </View>
        </Card>
      </Pressable>

      {/* การจัดการ */}
      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>การจัดการ</Txt>
        <Row icon="grid" label="จัดการหมวดหมู่" sub="6 หมวด · P1–P6" onPress={() => router.push('/settings/categories')} />
        <Row icon="user" label="สมุดรายชื่อ" sub={`${nContacts} รายชื่อ`} onPress={() => router.push('/settings/contacts')} />
        <Row icon="bars" label="จัดการข้อมูล" sub="ดูความจุ & ลบข้อมูล รายปี · เดือน · สัปดาห์ · วัน" onPress={() => router.push('/settings/manage')} last />
      </Card>

      {/* การแจ้งเตือน */}
      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>การแจ้งเตือน</Txt>
        <Row
          icon="bell"
          label="เปิดการแจ้งเตือน"
          sub="งบ 50 รายการ · ใต้ลิมิต iOS"
          right={<Toggle value={settings.notifMaster} onChange={(v) => { settings.setNotifMaster(v); syncNotif(v, settings.morning); }} />}
        />
        <Row
          icon="sun"
          label="สรุปตอนเช้า"
          sub="ทุกวัน 06:00"
          last
          right={<Toggle value={settings.morning} onChange={(v) => { settings.setMorning(v); syncNotif(settings.notifMaster, v); }} />}
        />
      </Card>

      {/* ธีม */}
      <Card style={{ gap: 8 }}>
        <Txt size={12} weight="bold" color={t.faint}>โหมดแสดงผล</Txt>
        <Segmented
          options={[
            { key: 'light', label: 'สว่าง' },
            { key: 'dark', label: 'มืด' },
          ]}
          value={settings.theme}
          onChange={settings.setTheme}
        />
      </Card>

      {/* ข้อมูล */}
      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>ข้อมูล</Txt>
        <Row icon="share" label="Export / Import / Google Sheets" sub="CSV · JSON · ส่งขึ้น Sheets ทางเดียว" onPress={() => router.push('/settings/data')} last />
      </Card>

      {/* ข้อมูลตัวอย่าง (Demo) */}
      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>ข้อมูลตัวอย่าง (Demo)</Txt>
        <Row
          icon="calendar"
          label="สร้างข้อมูลตัวอย่าง 1 ปี"
          sub={`งานประจำ + นัดคุยเคส + กิจกรรม ทั้งปี ${beYear(year)} — แทนที่ข้อมูลเดิม`}
          onPress={() => setConfirmSeed(true)}
          last
        />
      </Card>

      {confirmSeed ? (
        <Card tone="card2" style={{ gap: 10 }}>
          <Txt size={14} weight="bold">สร้างข้อมูลตัวอย่างทั้งปี?</Txt>
          <Txt size={12} color={t.sub}>
            จะลบข้อมูลปัจจุบันทั้งหมด (กิจกรรม/สถานะ/รายชื่อ) แล้วแทนที่ด้วยตารางจำลอง 1 ปี{'\n'}
            เหมาะสำหรับทดสอบสถิติ · จัดการข้อมูล · Export / Import
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" disabled={seeding} onPress={() => setConfirmSeed(false)} />
            <Btn style={{ flex: 1 }} kind="danger" label={seeding ? 'กำลังสร้าง…' : 'สร้าง (แทนที่)'} disabled={seeding} onPress={seedNow} />
          </View>
        </Card>
      ) : null}

      <Txt size={11} color={t.faint} style={{ textAlign: 'center', marginTop: 4 }}>
        ตารางชีวิตจอย · v2 · Offline-first
      </Txt>
    </Screen>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const t = useTokens();
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <View style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={76} height={76} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={38} cy={38} r={R} stroke={t.chip} strokeWidth={7} fill="none" />
        <Circle
          cx={38}
          cy={38}
          r={R}
          stroke={pct >= 0.7 ? GREEN : ACCENT}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${C}`}
          strokeDashoffset={C * (1 - pct)}
        />
      </Svg>
      <Txt size={17} num weight="bold">{Math.round(pct * 100)}%</Txt>
    </View>
  );
}
