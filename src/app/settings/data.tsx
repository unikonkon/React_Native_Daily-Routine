// 6.5 ข้อมูล — Export CSV / สำรอง-กู้คืน JSON / ส่งขึ้น Google Sheets (ทางเดียว ผ่าน Apps Script)
// ใช้ expo-file-system API ใหม่ (File/Paths) + expo-sharing + expo-document-picker
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, Row, Txt, useTokens } from '@/components/ui';
import { CAT_BY_ID, DANGER } from '@/constants/theme';
import { WD_TH_FULL, addDays, fmtMin, mondayOf, todayISO } from '@/lib/dates';
import { dumpAll, insertActivities, purgeRange, restoreAll, type BackupData } from '@/lib/db';
import { buildSheetTabs, pushToSheets, type SheetsRange } from '@/lib/sheets';
import { buildTimeTableCsv, parseTimeTableCsv, type TimeTableImport } from '@/lib/timetable';
import { buildTimeTableXls, buildWeekXls } from '@/lib/xls';
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

  // Google Sheets (Apps Script Web App URL — เก็บใน SQLite ผ่าน settings store, ตั้งค่าที่หน้า settings/sheets-setup)
  const sheetsUrl = useSettings((s) => s.sheetsUrl);
  const sheetsUrls = useSettings((s) => s.sheetsUrls);
  const setSheetsUrl = useSettings((s) => s.setSheetsUrl);
  const removeSheetsUrl = useSettings((s) => s.removeSheetsUrl);
  const [sending, setSending] = useState<SheetsRange | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  /** URL อื่นที่บันทึกไว้ (ไม่รวมตัวที่ใช้งานอยู่) */
  const savedOthers = sheetsUrls.filter((u) => u !== sheetsUrl);

  const disconnectSheets = () => {
    setSheetsUrl(''); // ล้างเฉพาะ URL ที่ใช้งาน — รายการที่บันทึกไว้ยังอยู่ครบ ให้เชื่อมต่อใหม่ได้
    setConfirmDisconnect(false);
    showToast('ยกเลิกการเชื่อมต่อแล้ว — เลือกเชื่อมต่อใหม่จากรายการได้ตลอด');
  };

  const connectUrl = (url: string) => {
    setSheetsUrl(url);
    showToast('เชื่อมต่อ Google Sheets แล้ว ✓');
  };

  const deleteUrl = (url: string) => {
    removeSheetsUrl(url);
    showToast('ลบ URL ออกจากรายการแล้ว');
  };

  /** ช่วงที่รอเลือกรูปแบบก่อนส่งขึ้นชีต (มีสี / ค่าล้วน) */
  const [sheetsPick, setSheetsPick] = useState<SheetsRange | null>(null);

  const sendToSheets = async (range: SheetsRange, styled: boolean) => {
    if (sending) return;
    setSending(range);
    try {
      const { acts, occ } = useActivities.getState();
      const tabs = buildSheetTabs(getDay, acts, occ, range, styled);
      if (!tabs.length) {
        showToast('ไม่มีข้อมูลให้ส่ง');
        return;
      }
      await pushToSheets(sheetsUrl, tabs);
      showToast(`ส่งขึ้น Sheets ${styled ? 'แบบมีสี' : ''}แล้ว ✓ (${tabs.length} แท็บ)`);
    } catch (err) {
      showToast(`ส่งไม่สำเร็จ — ${err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง'}`);
    } finally {
      setSending(null);
    }
  };

  const pickAndSend = (styled: boolean) => {
    const range = sheetsPick;
    setSheetsPick(null);
    if (range) sendToSheets(range, styled);
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

  /** ตัวส่งออกที่กำลังรอเลือกฟอร์แมต: สัปดาห์ หรือ Time Table เดือน */
  const [exportPick, setExportPick] = useState<'week' | 'timetable' | null>(null);

  /** ส่งออกตามฟอร์แมตที่เลือก — 'xls' = มีสี/จัดรูปแบบ (HTML table เปิดใน Excel), 'csv' = แบบเดิม */
  const doExport = async (format: 'xls' | 'csv') => {
    const pick = exportPick;
    setExportPick(null);
    if (!pick) return;
    try {
      const anchor = todayISO();
      if (pick === 'week') {
        if (format === 'xls') await shareFile(`routine-${anchor}.xls`, buildWeekXls(getDay), 'application/vnd.ms-excel');
        else await shareFile(`routine-${anchor}.csv`, buildWeekCsv(), 'text/csv');
      } else {
        const ym = anchor.slice(0, 7);
        if (format === 'xls') await shareFile(`timetable-${ym}.xls`, buildTimeTableXls(getDay, anchor), 'application/vnd.ms-excel');
        else await shareFile(`timetable-${ym}.csv`, buildTimeTableCsv(getDay, anchor), 'text/csv');
      }
    } catch {
      showToast('ส่งออกไม่สำเร็จ');
    }
  };

  /** การ์ดเลือกฟอร์แมตส่งออก — มีสี (.xls) เป็นตัวเลือกแรก */
  const exportPickCard = (kind: 'week' | 'timetable') =>
    exportPick === kind ? (
      <Card tone="card2" style={{ gap: 10 }}>
        <Txt size={14} weight="bold">
          {kind === 'week' ? 'ส่งออกตารางสัปดาห์นี้' : 'ส่งออก Time Table เดือนนี้'} — เลือกรูปแบบไฟล์
        </Txt>
        <Txt size={12} color={t.sub}>
          มีสี (.xls): พื้นสีตามหมวด ตัวหนา ✓/✗ ตามสถานะ — เปิดใน Excel/Google Sheets ได้เลย{'\n'}
          แบบเดิม (.csv): ข้อความล้วน เหมาะกับนำเข้าโปรแกรมอื่น{kind === 'timetable' ? ' และนำกลับเข้าแอปนี้' : ''}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setExportPick(null)} />
          <Btn style={{ flex: 1 }} label="มีสี (.xls)" onPress={() => doExport('xls')} />
          <Btn style={{ flex: 1 }} kind="ghost" label="แบบเดิม (.csv)" onPress={() => doExport('csv')} />
        </View>
      </Card>
    ) : null;

  const exportJson = async () => {
    try {
      const data = await dumpAll();
      await shareFile(`routine-backup-${todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json');
    } catch {
      showToast('สำรองข้อมูลไม่สำเร็จ');
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
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>Time Table</Txt>
        <Row icon="grid" label="ส่งออก Time Table" sub="ตารางทั้งเดือนนี้ — เลือกได้: มีสี (.xls) / CSV เดิม" onPress={() => setExportPick('timetable')} />
        <Row icon="repeat" label="นำเข้า Time Table" sub="ไฟล์ CSV แบบ grid เดือน (MONTH m/yyyy)" onPress={pickCsvImport} last />
      </Card>

      {exportPickCard('timetable')}

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
        <Row icon="share" label="ส่งออกตารางสัปดาห์" sub="สัปดาห์นี้ — เลือกได้: มีสี (.xls) / CSV เดิม" onPress={() => setExportPick('week')} />
        <Row icon="download" label="สำรองข้อมูล (JSON)" sub="ทุกตาราง — เก็บไว้กู้คืน/ย้ายเครื่อง" onPress={exportJson} />
        <Row icon="restore" label="กู้คืน / นำเข้า (JSON)" sub="เลือกไฟล์ที่สำรองไว้" onPress={pickImport} last />
      </Card>

      {exportPickCard('week')}

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
          // ยังไม่เชื่อมต่อ — เลือกจากรายการ URL ที่บันทึกไว้ได้ทันที หรือไปตั้งค่าใหม่
          <>
            <Row
              icon="cloud"
              label="ส่งขึ้น Google Sheets"
              sub={sheetsUrls.length ? `ยังไม่เชื่อมต่อ — มี ${sheetsUrls.length} URL บันทึกไว้ แตะเพื่อเชื่อมต่อ` : 'ยังไม่เชื่อมต่อ — ติดตั้งครั้งเดียว ใช้ได้ตลอด'}
              last
              onPress={sheetsUrls.length ? undefined : () => router.push('/settings/sheets-setup')}
            />
            {sheetsUrls.length ? (
              <>
                <View style={{ gap: 6 }}>
                  <Txt size={11} weight="bold" color={t.faint}>URL ที่บันทึกไว้ ({sheetsUrls.length}/5)</Txt>
                  {sheetsUrls.map((u) => (
                    <UrlItem key={u} url={u} actionLabel="เชื่อมต่อ" onAction={() => connectUrl(u)} onRemove={() => deleteUrl(u)} />
                  ))}
                </View>
                <Btn
                  kind="ghost"
                  icon="arrowR"
                  label="ตั้งค่าใหม่ / เพิ่ม URL อื่น (ทีละขั้น)"
                  onPress={() => router.push('/settings/sheets-setup')}
                />
              </>
            ) : (
              <Btn icon="arrowR" label="วิธีติดตั้ง & เชื่อมต่อ (ทีละขั้น)" onPress={() => router.push('/settings/sheets-setup')} />
            )}
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

            {/* แสดงทีละบล็อก: เลือกรูปแบบส่ง → ยืนยันยกเลิก → ปุ่มปกติ (ไม่ซ้อนกันให้รก) */}
            {sheetsPick ? (
              <View style={{ gap: 8 }}>
                <Txt size={14} weight="bold">
                  {sheetsPick === 'month' ? 'ส่งเดือนนี้' : 'ส่งทั้งหมด'} — เลือกรูปแบบ
                </Txt>
                <Txt size={12} color={t.sub}>
                  มีสี: พื้นสีตามหมวด ตัวหนา ✓/✗ ในชีตเลย (ต้องใช้สคริปต์เวอร์ชันล่าสุด — ถ้ายังไม่อัปเดต
                  ข้อมูลจะลงแบบค่าล้วน){'\n'}แบบเดิม: ค่าล้วนไม่จัดรูปแบบ
                </Txt>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setSheetsPick(null)} />
                  <Btn style={{ flex: 1 }} label="มีสี" onPress={() => pickAndSend(true)} />
                  <Btn style={{ flex: 1 }} kind="ghost" label="แบบเดิม" onPress={() => pickAndSend(false)} />
                </View>
              </View>
            ) : confirmDisconnect ? (
              <View style={{ gap: 8 }}>
                <Txt size={12} color={t.sub}>
                  ยกเลิกการเชื่อมต่อ? — ข้อมูลในชีตไม่ถูกลบ และ URL ยังอยู่ในรายการที่บันทึกไว้
                  เลือกเชื่อมต่อใหม่ได้ตลอด
                </Txt>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn style={{ flex: 1 }} kind="ghost" label="ไม่ยกเลิก" onPress={() => setConfirmDisconnect(false)} />
                  <Btn style={{ flex: 1 }} kind="danger" label="ยืนยันยกเลิก" onPress={disconnectSheets} />
                </View>
              </View>
            ) : showSwitch ? (
              <View style={{ gap: 6 }}>
                <Txt size={11} weight="bold" color={t.faint}>สลับไปใช้ URL อื่น</Txt>
                {savedOthers.map((u) => (
                  <UrlItem key={u} url={u} actionLabel="ใช้" onAction={() => { connectUrl(u); setShowSwitch(false); }} onRemove={() => deleteUrl(u)} />
                ))}
                <Btn kind="ghost" label="ปิด" onPress={() => setShowSwitch(false)} />
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn
                    style={{ flex: 1 }}
                    label={sending === 'month' ? 'กำลังส่ง…' : 'ส่งเดือนนี้'}
                    disabled={sending !== null}
                    onPress={() => setSheetsPick('month')}
                  />
                  <Btn
                    style={{ flex: 1 }}
                    kind="ghost"
                    label={sending === 'all' ? 'กำลังส่ง…' : 'ส่งทั้งหมด'}
                    disabled={sending !== null}
                    onPress={() => setSheetsPick('all')}
                  />
                </View>
                {savedOthers.length ? (
                  <Btn
                    kind="ghost"
                    icon="cloud"
                    label={`สลับ URL อื่น (${savedOthers.length})`}
                    disabled={sending !== null}
                    onPress={() => setShowSwitch(true)}
                  />
                ) : null}
                <Btn
                  kind="ghost"
                  icon="x"
                  label="ยกเลิกการเชื่อมต่อ"
                  disabled={sending !== null}
                  onPress={() => setConfirmDisconnect(true)}
                />
              </>
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

/** แถว URL ในรายการที่บันทึกไว้ — โชว์ URL ย่อ + ปุ่มเชื่อมต่อ/ใช้ + ปุ่มลบ */
function UrlItem({ url, actionLabel, onAction, onRemove }: { url: string; actionLabel: string; onAction: () => void; onRemove: () => void }) {
  const t = useTokens();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: t.card2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: t.line,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}>
      <Icon name="cloud" size={15} color={t.faint} />
      <Txt size={11} num color={t.sub} numberOfLines={1} style={{ flex: 1 }}>
        {truncate(url.replace('https://script.google.com/macros/s/', '…/'), 24)}
      </Txt>
      <Chip small icon="check" label={actionLabel} onPress={onAction} />
      <Pressable
        onPress={onRemove}
        hitSlop={6}
        style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: t.chip }}>
        <Icon name="trash" size={14} color={DANGER} />
      </Pressable>
    </View>
  );
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
