// 6.5 ข้อมูล — Export CSV / สำรอง-กู้คืน JSON / ส่งขึ้น Google Sheets (ทางเดียว ผ่าน Apps Script)
// ใช้ expo-file-system API ใหม่ (File/Paths) + expo-sharing + expo-document-picker
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { Btn, Card, Chip, Row, Txt, useTokens } from '@/components/ui';
import { CAT_BY_ID } from '@/constants/theme';
import { WD_TH_FULL, addDays, fmtMin, mondayOf, todayISO } from '@/lib/dates';
import { dumpAll, insertActivities, purgeRange, restoreAll, type BackupData } from '@/lib/db';
import { buildSheetTabs, pushToSheets, type SheetsRange } from '@/lib/sheets';
import { buildTimeTableCsv, parseTimeTableCsv, type TimeTableImport } from '@/lib/timetable';
import { getDay, useActivities } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export default function DataScreen() {
  const t = useTokens();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const [pendingImport, setPendingImport] = useState<BackupData | null>(null);
  const [pendingCsv, setPendingCsv] = useState<TimeTableImport | null>(null);
  /** กันเปิด document picker ซ้อน (native อนุญาตทีละตัว — เรียกซ้ำจะ throw) */
  const picking = useRef(false);

  // Google Sheets (Apps Script Web App URL — ตั้งค่า/แก้ไขที่หน้า settings/sheets-setup)
  const sheetsUrl = useSettings((s) => s.sheetsUrl);
  const setSheetsUrl = useSettings((s) => s.setSheetsUrl);
  const [sending, setSending] = useState<SheetsRange | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const disconnectSheets = () => {
    setSheetsUrl(''); // ล้างค่าใน settings (SQLite) — กลับสู่สถานะยังไม่เชื่อมต่อ
    setConfirmDisconnect(false);
    showToast('ยกเลิกการเชื่อมต่อ Google Sheets แล้ว ✓');
  };

  const sendToSheets = async (range: SheetsRange) => {
    if (sending) return;
    setSending(range);
    try {
      const { acts, occ } = useActivities.getState();
      const tabs = buildSheetTabs(getDay, acts, occ, range);
      if (!tabs.length) {
        showToast('ไม่มีข้อมูลให้ส่ง');
        return;
      }
      await pushToSheets(sheetsUrl, tabs);
      showToast(`ส่งขึ้น Sheets แล้ว ✓ (${tabs.length} แท็บ)`);
    } catch (err) {
      showToast(`ส่งไม่สำเร็จ — ${err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง'}`);
    } finally {
      setSending(null);
    }
  };

  const pickDocument = async (type: string[]) => {
    if (picking.current) return null;
    picking.current = true;
    try {
      const res = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
      return res.canceled ? null : res.assets[0];
    } catch {
      showToast('เปิดตัวเลือกไฟล์ไม่สำเร็จ — ลองใหม่อีกครั้ง');
      return null;
    } finally {
      picking.current = false;
    }
  };

  const shareFile = async (name: string, content: string, mimeType: string) => {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType });
    else showToast('เครื่องนี้แชร์ไฟล์ไม่ได้');
  };

  const exportCsv = async () => {
    try {
      await shareFile(`routine-${todayISO()}.csv`, buildWeekCsv(), 'text/csv');
    } catch {
      showToast('ส่งออก CSV ไม่สำเร็จ');
    }
  };

  const exportJson = async () => {
    try {
      const data = await dumpAll();
      await shareFile(`routine-backup-${todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json');
    } catch {
      showToast('สำรองข้อมูลไม่สำเร็จ');
    }
  };

  // Time Table CSV (ฟอร์แมต "Time Table จอย" — grid เดือน) — lib/timetable.ts
  const exportTimeTable = async () => {
    try {
      const anchor = todayISO();
      await shareFile(`timetable-${anchor.slice(0, 7)}.csv`, buildTimeTableCsv(getDay, anchor), 'text/csv');
    } catch {
      showToast('ส่งออก Time Table ไม่สำเร็จ');
    }
  };

  const pickCsvImport = async () => {
    const asset = await pickDocument(['text/csv', 'text/comma-separated-values', 'text/plain']);
    if (!asset) return;
    try {
      const text = await new File(asset.uri).text();
      setPendingCsv(parseTimeTableCsv(text));
    } catch {
      showToast('อ่านไฟล์ไม่ได้ — ต้องเป็น CSV ฟอร์แมต Time Table (มีหัว MONTH และแถว Time)');
    }
  };

  const doCsvImport = async (mode: 'merge' | 'replace') => {
    if (!pendingCsv) return;
    try {
      if (mode === 'replace') await purgeRange(pendingCsv.from, pendingCsv.to);
      await insertActivities(pendingCsv.list);
      await useActivities.getState().boot();
      setPendingCsv(null);
      showToast(`นำเข้า ${pendingCsv.list.length} รายการแล้ว ✓`);
    } catch {
      showToast('นำเข้าไม่สำเร็จ');
    }
  };

  const pickImport = async () => {
    const asset = await pickDocument(['application/json']);
    if (!asset) return;
    try {
      const text = await new File(asset.uri).text();
      const data = JSON.parse(text) as BackupData;
      if (data.version !== 1 || !Array.isArray(data.activities)) throw new Error('bad format');
      setPendingImport(data);
    } catch {
      showToast('ไฟล์ไม่ถูกต้อง — ต้องเป็น JSON ที่สำรองจากแอปนี้');
    }
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    try {
      await restoreAll(pendingImport, mode);
      await Promise.all([useActivities.getState().boot(), useContacts.getState().boot()]);
      setPendingImport(null);
      showToast(mode === 'replace' ? 'กู้คืนข้อมูล (แทนที่) แล้ว ✓' : 'รวมข้อมูลแล้ว ✓');
    } catch {
      showToast('กู้คืนไม่สำเร็จ');
    }
  };

  return (
    <Screen title="ข้อมูล" subtitle="Export · Import · Google Sheets" back>
      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>Time Table (CSV)</Txt>
        <Row icon="grid" label="ส่งออก Time Table" sub="ตารางทั้งเดือนนี้ — ฟอร์แมต Time Table จอย" onPress={exportTimeTable} />
        <Row icon="repeat" label="นำเข้า Time Table" sub="ไฟล์ CSV แบบ grid เดือน (MONTH m/yyyy)" onPress={pickCsvImport} last />
      </Card>

      {pendingCsv ? (
        <Card tone="card2" style={{ gap: 10 }}>
          <Txt size={14} weight="bold">
            พบ Time Table {pendingCsv.monthLabel}: {pendingCsv.list.length} รายการ
          </Txt>
          <Txt size={12} color={t.sub}>
            ช่วง {pendingCsv.from} – {pendingCsv.to} · หมวดถูกเดาจากชื่อกิจกรรม แก้ทีหลังได้{'\n'}
            “แทนที่ช่วงนี้” จะลบข้อมูลเดิมเฉพาะช่วงวันดังกล่าวก่อนนำเข้า
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setPendingCsv(null)} />
            <Btn style={{ flex: 1 }} label="เพิ่มรวม" onPress={() => doCsvImport('merge')} />
            <Btn style={{ flex: 1 }} kind="danger" label="แทนที่ช่วงนี้" onPress={() => doCsvImport('replace')} />
          </View>
        </Card>
      ) : null}

      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>สำรอง & กู้คืน</Txt>
        <Row icon="share" label="ส่งออก CSV" sub="ตารางสัปดาห์นี้ (ฟอร์แมต Excel เดิม)" onPress={exportCsv} />
        <Row icon="download" label="สำรองข้อมูล (JSON)" sub="ทุกตาราง — เก็บไว้กู้คืน/ย้ายเครื่อง" onPress={exportJson} />
        <Row icon="restore" label="กู้คืน / นำเข้า (JSON)" sub="เลือกไฟล์ที่สำรองไว้" onPress={pickImport} last />
      </Card>

      {pendingImport ? (
        <Card tone="card2" style={{ gap: 10 }}>
          <Txt size={14} weight="bold">
            พบข้อมูล: กิจกรรม {pendingImport.activities.length} · รายชื่อ {pendingImport.contacts.length}
          </Txt>
          <Txt size={12} color={t.sub}>เลือกวิธีนำเข้า — “แทนที่” จะลบข้อมูลปัจจุบันทั้งหมดก่อน</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setPendingImport(null)} />
            <Btn style={{ flex: 1 }} label="รวม (merge)" onPress={() => doImport('merge')} />
            <Btn style={{ flex: 1 }} kind="danger" label="แทนที่" onPress={() => doImport('replace')} />
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: 13 }}>
        <Txt size={12} weight="bold" color={t.faint}>Google Sheets (ทางเดียว)</Txt>

        {!sheetsUrl ? (
          <>
            <Row
              icon="cloud"
              label="ส่งขึ้น Google Sheets"
              sub="ยังไม่เชื่อมต่อ — ติดตั้งครั้งเดียว ใช้ได้ตลอด"
              last
              onPress={() => router.push('/settings/sheets-setup')}
            />
            <Btn icon="arrowR" label="วิธีติดตั้ง & เชื่อมต่อ (ทีละขั้น)" onPress={() => router.push('/settings/sheets-setup')} />
          </>
        ) : (
          <>
            <Row
              icon="cloud"
              label="เชื่อมต่อแล้ว"
              sub={truncate(sheetsUrl.replace('https://script.google.com/', '…/'), 20)}
              last
              right={<Chip small icon="edit" label="แก้ URL" onPress={() => router.push('/settings/sheets-setup')} />}
            />

            <View style={{ flexDirection: 'row', gap: 18 }}>
              <Btn
                style={{ flex: 1 }}
                label={sending === 'month' ? 'กำลังส่ง…' : 'ส่งเดือนนี้'}
                disabled={sending !== null}
                onPress={() => sendToSheets('month')}
              />
              <Btn
                style={{ flex: 1 }}
                kind="ghost"
                label={sending === 'all' ? 'กำลังส่ง…' : 'ส่งทั้งหมด'}
                disabled={sending !== null}
                onPress={() => sendToSheets('all')}
              />
            </View>

            {confirmDisconnect ? (
              <View style={{ gap: 8 }}>
                <Txt size={12} color={t.sub}>
                  ยกเลิกการเชื่อมต่อ? URL จะถูกลบออกจากแอปและกลับสู่สถานะยังไม่เชื่อมต่อ — ข้อมูลที่ส่งไปแล้วในชีตไม่ถูกลบ
                  และเชื่อมต่อใหม่ได้ตลอดด้วย URL เดิม
                </Txt>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn style={{ flex: 1 }} kind="ghost" label="ไม่ยกเลิก" onPress={() => setConfirmDisconnect(false)} />
                  <Btn style={{ flex: 1 }} kind="danger" label="ยืนยันยกเลิก" onPress={disconnectSheets} />
                </View>
              </View>
            ) : (
              <Btn
                kind="ghost"
                icon="x"
                label="ยกเลิกการเชื่อมต่อ"
                disabled={sending !== null}
                onPress={() => setConfirmDisconnect(true)}
              />
            )}
          </>
        )}
      </Card>

      <Txt size={11} color={t.faint} style={{ textAlign: 'center' }}>
        ส่งขึ้น Google Sheets ทางเดียว (แอป → Sheets): grid Time Table รายเดือน + แท็บรายการกิจกรรม
      </Txt>
    </Screen>
  );
}

/** ตัดข้อความยาวเกิน max ตัวอักษร แล้วปิดท้ายด้วย … */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** CSV สัปดาห์ปัจจุบัน: แถว = ช่วงเวลา 30 นาที (06:00–30:00 ครบ 24 ชม.), คอลัมน์ = จันทร์–อาทิตย์ */
function buildWeekCsv(): string {
  const monday = mondayOf(todayISO());
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const itemsPerDay = days.map((d) => getDay(d));
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

  const lines = [['เวลา', ...days.map((d, i) => `${WD_TH_FULL[i]} ${d}`)].map(esc).join(',')];
  for (let m = 360; m < 1800; m += 30) {
    const row = [fmtMin(m)];
    for (const items of itemsPerDay) {
      const here = items.filter((it) => it.startMin < m + 30 && it.endMin > m);
      row.push(here.map((it) => `${CAT_BY_ID[it.cat].short}: ${it.title}`).join(' | '));
    }
    lines.push(row.map(esc).join(','));
  }
  return '﻿' + lines.join('\n'); // BOM ให้ Excel เปิดภาษาไทยถูก
}
