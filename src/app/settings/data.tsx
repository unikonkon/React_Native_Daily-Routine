// 6.5 ข้อมูล — Export CSV / สำรอง-กู้คืน JSON / ส่งขึ้น Google Sheets (ทางเดียว ผ่าน Apps Script)
// ใช้ expo-file-system API ใหม่ (File/Paths) + expo-sharing + expo-document-picker
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { FadeInView } from '@/components/motion';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, Row, Segmented, Txt, pressFade, useTokens } from '@/components/ui';
import { GREEN } from '@/constants/theme';
import { MONTH_TH, addDays, beYear, fmtMin, nowMin, thaiDate, toISO, todayISO } from '@/lib/dates';
import { dumpAll, insertActivities, purgeRange, restoreAll, type BackupData } from '@/lib/db';
import { EXPORT_PALETTES, EXPORT_TONES, type ExportTone } from '@/lib/export-theme';
import { buildReport, reportCsv, reportHtml, reportSheets } from '@/lib/report';
import { buildSheetTabs, pushToSheets, type SheetsScope, type SheetsStyle } from '@/lib/sheets';
import { buildTimeTableCsvMulti, listDataMonths, parseTimeTableCsv, type TimeTableImport } from '@/lib/timetable';
import { buildTimeTableXlsx, parseTimeTableXlsx } from '@/lib/timetableXlsx';
import { buildTimeTableXlsMulti } from '@/lib/xls';
import { getDay, useActivities } from '@/stores/activities';
import { useContacts } from '@/stores/contacts';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export default function DataScreen() {
  const t = useTokens();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const [pendingImport, setPendingImport] = useState<BackupData | null>(null);
  const [pendingTT, setPendingTT] = useState<TimeTableImport | null>(null);
  /** กันเปิด document picker ซ้อน (native อนุญาตทีละตัว — เรียกซ้ำจะ throw) */
  const picking = useRef(false);

  // Google Sheets (Apps Script Web App URL — เก็บใน SQLite ผ่าน settings store, ตั้งค่าที่หน้า settings/sheets-setup)
  const sheetsUrl = useSettings((s) => s.sheetsUrl);
  const sheetsUrls = useSettings((s) => s.sheetsUrls);
  const setSheetsUrl = useSettings((s) => s.setSheetsUrl);
  const removeSheetsUrl = useSettings((s) => s.removeSheetsUrl);
  const restoreSheetsUrls = useSettings((s) => s.restoreSheetsUrls);
  const sheetsLast = useSettings((s) => s.sheetsLast);
  const setSheetsLast = useSettings((s) => s.setSheetsLast);
  /** ตัวเลือกย่อยต่อหมวดที่ตั้งไว้ — ส่งเข้ารายงานเพื่อให้เห็นตัวที่ตั้งไว้แต่ยังไม่ได้ใช้ด้วย */
  const catOptions = useSettings((s) => s.catOptions);
  /** โน้ตในรายงาน/ไฟล์/ชีต — ปิดได้ที่ ตั้งค่า › จัดการโน้ต (null = ไม่มีคอลัมน์/ตารางโน้ต) */
  const noteReport = useSettings((s) => s.noteDisplay.report);
  const reportNotes = () => (noteReport ? useActivities.getState().notes : null);
  const [sending, setSending] = useState(false);
  /** กำลังนำเข้า/กู้คืน — ข้อมูลเยอะใช้เวลาหลายวินาที: บอกผู้ใช้ และกันกดซ้ำ */
  const [busy, setBusy] = useState<string | null>(null);
  /** "แทนที่" ลบข้อมูลเดิม — ต้องยืนยันขั้นที่สองก่อน (กู้คืน JSON = ทั้งแอป · Time Table = จำนวนรายการเดิมในช่วงนั้น) */
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmTT, setConfirmTT] = useState<number | null>(null);
  /** ส่งขึ้นชีตไม่สำเร็จ — ค้างไว้บนจอ (ไม่ใช่ toast ที่หายเอง) พร้อมปุ่มลองใหม่ */
  const [sendErr, setSendErr] = useState<string | null>(null);
  const contactCount = useContacts((s) => s.list.length);
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
    showToast('เชื่อมต่อ Google Sheets แล้ว');
  };

  const deleteUrl = (url: string) => {
    const before = sheetsUrls;
    removeSheetsUrl(url);
    showToast('ลบ URL ออกจากรายการแล้ว', { label: 'เลิกทำ', run: () => restoreSheetsUrls(before) });
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

  const shareFile = async (name: string, content: string | Uint8Array, mimeType: string) => {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType });
    else showToast('เครื่องนี้แชร์ไฟล์ไม่ได้');
  };

  // ---------- ส่งออก Time Table (รวมเป็นการทำงานเดียว: เลือกขอบเขต เดือนนี้ / เลือกเดือน / ทั้งหมด) ----------
  const acts = useActivities((s) => s.acts);
  const occ = useActivities((s) => s.occ);
  /** เดือนที่มีข้อมูล (first-of-month ISO) — สำหรับให้ติ๊กเลือกในโหมด "เลือกเดือน" */
  const dataMonths = useMemo(() => listDataMonths(acts, occ), [acts, occ]);

  type TtFormat = 'xlsx' | 'xls' | 'csv';
  const [ttOpen, setTtOpen] = useState(false);
  const [ttScope, setTtScope] = useState<'month' | 'pick' | 'all'>('month');
  const [ttFormat, setTtFormat] = useState<TtFormat>('xlsx');
  const [pickedMonths, setPickedMonths] = useState<string[]>([]);
  /** แนบ "รายงานสรุปจากที่บันทึกไว้" (ชุดเดียวกับหน้าสถิติ) ไปกับไฟล์ที่ส่งออก */
  const [withReport, setWithReport] = useState(true);
  /** ส่งออกเฉพาะรายงาน — ไม่ต้องมี grid Time Table ในไฟล์ */
  const [reportOnly, setReportOnly] = useState(false);
  /** โทนสีของไฟล์ (เฉพาะ .xlsx / .xls — CSV ไม่มีสี) */
  const [ttTone, setTtTone] = useState<ExportTone>('current');

  const openExport = () => {
    setTtScope('month');
    setTtFormat('xlsx');
    setPickedMonths([]);
    setWithReport(true);
    setReportOnly(false);
    setTtTone('current');
    setTtOpen(true);
  };

  const toggleMonth = (anchor: string) =>
    setPickedMonths((cur) => (cur.includes(anchor) ? cur.filter((x) => x !== anchor) : [...cur, anchor]));

  /** เดือนที่จะส่งตามขอบเขตที่เลือก (เรียงเวลา) — ใช้ร่วมทั้งส่งออกไฟล์และส่งขึ้นชีต */
  const anchorsOf = (scope: SheetsScope, picked: string[]): string[] =>
    (scope === 'month' ? [thisMonthAnchor()] : scope === 'all' ? dataMonths : [...picked]).sort();

  /**
   * ส่งออก Time Table + รายงานสรุป หลายเดือนในไฟล์เดียว
   * 'xlsx' = Excel จริง (โครง/สี/ฟอนต์/เซลล์ merge เหมือนไฟล์ต้นฉบับ · นำกลับเข้าแอปได้) — รายงานเป็นชีตแยกหน้าสุด
   * 'xls'  = HTML table มีสี (เปิดดูอย่างเดียว) · 'csv' = ข้อความล้วน (นำกลับเข้าแอปได้ — บล็อกรายงานถูกมองข้ามตอนนำเข้า)
   */
  const doExportTT = async (format: TtFormat) => {
    const anchors = anchorsOf(ttScope, pickedMonths);
    if (!anchors.length) {
      showToast('ยังไม่ได้เลือกเดือน');
      return;
    }
    if (!withReport && reportOnly) {
      showToast('เลือกอย่างน้อยหนึ่งอย่าง: ตาราง Time Table หรือรายงานสรุป');
      return;
    }
    if (busy) return;
    setTtOpen(false);
    setBusy('กำลังเตรียมไฟล์…');
    try {
      await nextFrame(); // ให้แถบ "กำลังเตรียมไฟล์" ขึ้นก่อน — การสร้างไฟล์กินเธรดหลักหลายวินาทีเมื่อข้อมูลเยอะ
      const report = withReport
        ? buildReport(acts, occ, useContacts.getState().list, anchors, todayISO(), nowMin(), catOptions, reportNotes())
        : null;
      const pal = EXPORT_PALETTES[ttTone];
      const ttAnchors = reportOnly ? [] : anchors;
      const kind = reportOnly ? 'report' : 'timetable';
      const tag =
        anchors.length === 1
          ? anchors[0].slice(0, 7)
          : `${anchors[0].slice(0, 7)}_ถึง_${anchors[anchors.length - 1].slice(0, 7)}`;
      if (format === 'xlsx') {
        await shareFile(
          `${kind}-${tag}.xlsx`,
          buildTimeTableXlsx(getDay, ttAnchors, report ? reportSheets(report, pal) : [], pal),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      } else if (format === 'xls') {
        await shareFile(`${kind}-${tag}.xls`, buildTimeTableXlsMulti(getDay, ttAnchors, report ? reportHtml(report, pal) : undefined, pal), 'application/vnd.ms-excel');
      } else {
        await shareFile(`${kind}-${tag}.csv`, buildTimeTableCsvMulti(getDay, ttAnchors, report ? reportCsv(report) : undefined), 'text/csv');
      }
    } catch {
      showToast('ส่งออกไม่สำเร็จ — ลองอีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  // ---------- ส่งขึ้น Google Sheets (ตัวเลือกชุดเดียวกับส่งออกไฟล์: ขอบเขต · เนื้อหา · รูปแบบ · โทนสี) ----------
  /** แผงตั้งค่าก่อนส่งเปิดอยู่ไหม */
  const [shOpen, setShOpen] = useState(false);
  const [shScope, setShScope] = useState<SheetsScope>('month');
  const [shMonths, setShMonths] = useState<string[]>([]);
  const [shStyle, setShStyle] = useState<SheetsStyle>('rich');
  const [shTone, setShTone] = useState<ExportTone>('current');
  /** แนบแท็บรายงานสรุป (ชุดเดียวกับหน้าสถิติ) */
  const [shReport, setShReport] = useState(true);
  /** ส่งแท็บ Time Table + รายการกิจกรรม (ปิด = ส่งเฉพาะรายงาน) */
  const [shGrid, setShGrid] = useState(true);

  const openSheets = () => {
    setShScope('month');
    setShMonths([]);
    setShStyle('rich');
    setShTone('current');
    setShReport(true);
    setShGrid(true);
    setConfirmDisconnect(false);
    setShowSwitch(false);
    setShOpen(true);
  };

  const toggleShMonth = (anchor: string) =>
    setShMonths((cur) => (cur.includes(anchor) ? cur.filter((x) => x !== anchor) : [...cur, anchor]));

  const sendToSheets = async () => {
    if (sending) return;
    const anchors = anchorsOf(shScope, shMonths);
    if (!anchors.length) {
      showToast('ยังไม่ได้เลือกเดือน');
      return;
    }
    if (!shReport && !shGrid) {
      showToast('เลือกอย่างน้อยหนึ่งอย่าง: ตาราง Time Table หรือรายงานสรุป');
      return;
    }
    setShOpen(false);
    setSending(true);
    setSendErr(null);
    try {
      await nextFrame();
      const report = shReport
        ? buildReport(acts, occ, useContacts.getState().list, anchors, todayISO(), nowMin(), catOptions, reportNotes())
        : null;
      const tabs = buildSheetTabs(getDay, anchors, {
        style: shStyle,
        pal: EXPORT_PALETTES[shTone],
        grid: shGrid,
        report,
        notes: reportNotes(),
      });
      if (!tabs.length) {
        showToast('ไม่มีข้อมูลให้ส่ง');
        return;
      }
      await pushToSheets(sheetsUrl, tabs);
      setSheetsLast({ at: Date.now(), tabs: tabs.length, url: sheetsUrl });
      showToast(`ส่งขึ้น Sheets แล้ว (${tabs.length} แท็บ)`);
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  const exportJson = async () => {
    if (busy) return;
    setBusy('กำลังเตรียมไฟล์สำรอง…');
    try {
      await nextFrame();
      const data = await dumpAll();
      await shareFile(`routine-backup-${todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json');
    } catch {
      showToast('สำรองข้อมูลไม่สำเร็จ — ลองอีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  /** นำเข้า Time Table — รับทั้ง .xlsx (อ่านสี/เซลล์ merge ด้วย) และ .csv ในปุ่มเดียว */
  const pickTimeTableImport = async () => {
    // ไฟล์ที่ได้จาก LINE/แชท มักถูกระบุชนิดเป็น octet-stream (หรือ csv เป็น ms-excel) — ต้องรับด้วย ไม่งั้นกดเลือกไม่ได้
    const asset = await pickDocument([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/comma-separated-values',
      'text/plain',
      'application/octet-stream',
    ]);
    if (!asset) return;
    try {
      const file = new File(asset.uri);
      const bytes = await file.bytes();
      // แยก .xlsx จากเนื้อไฟล์ (zip ขึ้นต้นด้วย "PK") — ชื่อ/ชนิดไฟล์จากแอปแชทเชื่อไม่ได้
      const isXlsx =
        (bytes[0] === 0x50 && bytes[1] === 0x4b) ||
        /\.xlsx$/i.test(asset.name ?? '') ||
        asset.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      setPendingTT(isXlsx ? parseTimeTableXlsx(bytes) : parseTimeTableCsv(await file.text()));
    } catch (err) {
      console.warn('[import] timetable parse failed', err);
      showToast('อ่านไฟล์นี้ไม่ได้ — ต้องเป็นไฟล์ Time Table (.xlsx หรือ .csv) ที่ส่งออกจากแอปนี้ หรือใช้โครงเดียวกัน');
    }
  };

  const doTTImport = async (mode: 'merge' | 'replace') => {
    if (!pendingTT || busy) return;
    setBusy(`กำลังนำเข้า ${pendingTT.list.length} รายการ…`);
    try {
      if (mode === 'replace') await purgeRange(pendingTT.from, pendingTT.to);
      await insertActivities(pendingTT.list);
      await useActivities.getState().boot();
      setPendingTT(null);
      setConfirmTT(null);
      showToast(`นำเข้า ${pendingTT.list.length} รายการแล้ว`);
    } catch {
      showToast('นำเข้าไม่สำเร็จ — ข้อมูลเดิมไม่ถูกแก้ ลองอีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  const pickImport = async () => {
    // JSON ที่ส่งต่อมาทาง LINE/แชท มักเป็น octet-stream หรือ text/plain — เนื้อไฟล์ถูกตรวจซ้ำด้านล่างอยู่แล้ว
    const asset = await pickDocument(['application/json', 'text/plain', 'application/octet-stream']);
    if (!asset) return;
    try {
      const text = await new File(asset.uri).text();
      const data = JSON.parse(text) as BackupData;
      if (data.version !== 1 || !Array.isArray(data.activities)) throw new Error('bad format');
      setConfirmAll(false);
      setPendingImport(data);
    } catch {
      showToast('ไฟล์ไม่ถูกต้อง — ต้องเป็น JSON ที่สำรองจากแอปนี้');
    }
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport || busy) return;
    setBusy(`กำลังกู้คืน ${pendingImport.activities.length} กิจกรรม…`);
    try {
      await restoreAll(pendingImport, mode);
      // แม่แบบโน้ต/ตัวเลือกย่อยของหมวดมากับไฟล์สำรองด้วย — โหลด settings ใหม่ให้หน้าจอใช้ค่าที่กู้มา
      await Promise.all([useActivities.getState().boot(), useContacts.getState().boot(), useSettings.getState().boot()]);
      setPendingImport(null);
      setConfirmAll(false);
      showToast(mode === 'replace' ? 'กู้คืนข้อมูลจากไฟล์แล้ว' : 'รวมข้อมูลจากไฟล์แล้ว');
    } catch {
      showToast('กู้คืนไม่สำเร็จ — ลองอีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="ข้อมูล" subtitle="ส่งออก สำรอง และเชื่อม Google Sheets" variant="sub" action={{ label: busy ? 'กำลังทำงาน…' : 'สำรองตอนนี้', icon: 'check', onPress: exportJson, disabled: !!busy }}>
      {/* งานที่ไม่มีกล่องของตัวเอง (ส่งออกไฟล์ / สำรอง) — บอกสถานะไว้บนสุดของหน้า */}
      {busy && !pendingTT && !pendingImport ? (
        <Card tone="card2">
          <BusyLine text={busy} />
        </Card>
      ) : null}
      <Card>
        <Txt size={12} weight="bold" color={t.sub} style={{ marginBottom: 4 }}>Time Table — ส่งออก / นำเข้า</Txt>
        <Row icon="grid" label="ส่งออก Time Table & รายงานสรุป" sub="เลือกช่วง: เดือนนี้ / เลือกเดือน / ทั้งหมด — Excel (.xlsx), มีสี (.xls) หรือ CSV" onPress={openExport} />
        <Row icon="repeat" label="นำเข้า Time Table" sub="ไฟล์ .xlsx หรือ CSV แบบตารางเวลา — รองรับหลายเดือน/หลายชีตในไฟล์เดียว" onPress={pickTimeTableImport} last />
      </Card>

      {ttOpen ? (
        <FadeInView rise={-6}>
        <Card tone="card2" style={{ gap: 12 }}>
          <Txt size={14} weight="bold">ส่งออก Time Table & รายงานสรุป — เลือกช่วงข้อมูล</Txt>

          {/* ขอบเขต 3 แบบ */}
          <Seg options={SCOPE_OPTIONS} value={ttScope} onChange={setTtScope} />

          {/* รายละเอียดขอบเขต / ตัวเลือกเดือน */}
          <ScopeDetail
            scope={ttScope}
            months={dataMonths}
            picked={pickedMonths}
            onToggle={toggleMonth}
            verb="ส่งออก"
          />

          {/* เนื้อหาในไฟล์ — ตาราง Time Table / รายงานสรุป (ชุดเดียวกับหน้าสถิติ) */}
          <View style={{ gap: 6 }}>
            <Txt size={12} weight="med" color={t.sub}>เนื้อหาในไฟล์</Txt>
            <CheckRow
              label="รายงานสรุปจากที่บันทึกไว้"
              sub={`ภาพรวม · แนวโน้ม · ชั่วโมงตามหมวด · สรุปหมวดหมู่ (หมวดที่ใช้มากสุด + ทุกหมวดพร้อมสถานะ/สัดส่วน) · รายการกิจกรรมทุกชื่อในทั้ง 6 หมวด (ครั้ง/เสร็จ/ชั่วโมง/ช่วงวัน) · นัดเคส · รายการนัด${noteReport ? ' · โน้ตรายครั้งทุกหมวด' : ''}`}
              on={withReport}
              onPress={() => {
                const next = !withReport;
                setWithReport(next);
                if (!next) setReportOnly(false); // ไม่เอารายงานแล้วจะ "เฉพาะรายงาน" ไม่ได้
              }}
            />
            <CheckRow
              label="ตาราง Time Table รายเดือน"
              sub="ตารางช่องเวลา 30 นาที — เอาออกได้ถ้าต้องการเฉพาะรายงาน"
              on={!reportOnly}
              disabled={!withReport}
              onPress={() => setReportOnly(!reportOnly)}
            />
          </View>

          {/* เลือกรูปแบบไฟล์ */}
          <View style={{ gap: 6 }}>
            <Txt size={12} weight="med" color={t.sub}>รูปแบบไฟล์</Txt>
            <Seg
              options={[['xlsx', 'Excel (.xlsx)'], ['xls', 'มีสี (.xls)'], ['csv', 'CSV']]}
              value={ttFormat}
              onChange={setTtFormat}
            />
            <Txt size={11.5} color={t.sub} style={{ lineHeight: 17 }}>
              {ttFormat === 'xlsx'
                ? `Excel (.xlsx): ตารางเวลารายเดือน คั่นเป็นสัปดาห์ รวมเซลล์ตามช่วงเวลา · นำกลับเข้าแอปได้ (เฉพาะตาราง — โน้ตไม่ถูกนำเข้า)${withReport ? ` · รายงานอยู่ในชีตแยกหน้าสุด (รายงานสรุป · สรุปเคส & รายชื่อ${noteReport ? ' · โน้ตรายครั้ง' : ''})` : ''}`
                : ttFormat === 'xls'
                  ? 'มีสี (.xls): พื้นสีตามหมวด ✓/✗ ตามสถานะ — เปิดดูใน Excel/Sheets ได้ แต่นำกลับเข้าแอปไม่ได้'
                  : `CSV: ข้อความล้วน นำกลับเข้าแอปนี้ได้${withReport ? ' (บล็อกรายงานถูกข้ามตอนนำเข้า)' : ''}`}
            </Txt>
          </View>

          {/* โทนสีของไฟล์ — CSV ไม่มีสีจึงไม่ต้องเลือก */}
          {ttFormat !== 'csv' ? (
            <TonePicks
              label="โทนสีของไฟล์"
              value={ttTone}
              onChange={setTtTone}
              note={
                ttTone !== 'current'
                  ? 'สีที่จำมาจากไฟล์ต้นฉบับถูกปรับตามโทนนี้ด้วย — ถ้านำไฟล์กลับเข้าแอป สีที่จำไว้จะกลายเป็นสีโทนนี้ (เลือก “ปัจจุบัน” ถ้าอยากได้สีเดิมเป๊ะ)'
                  : undefined
              }
            />
          ) : null}

          {/* ปุ่มส่งออก */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setTtOpen(false)} />
            <Btn
              style={{ flex: 2 }}
              icon="share"
              label={reportOnly ? 'ส่งออกรายงาน' : withReport ? 'ส่งออกตาราง + รายงาน' : 'ส่งออกตาราง'}
              disabled={ttScope === 'pick' && !pickedMonths.length}
              onPress={() => doExportTT(ttFormat)}
            />
          </View>
        </Card>
        </FadeInView>
      ) : null}

      {pendingTT ? (
        <FadeInView rise={-6}>
        <Card tone="card2" style={{ gap: 10, borderWidth: confirmTT != null ? 1.5 : 0, borderColor: t.warn }}>
          <Txt size={14} weight="bold">
            พบ Time Table {pendingTT.monthLabel}: {pendingTT.list.length} รายการ
          </Txt>
          {confirmTT != null ? (
            <>
              <Txt size={13.5} weight="bold" color={t.warn}>
                ลบกิจกรรมเดิม {confirmTT} รายการในช่วงนี้ก่อนนำเข้า?
              </Txt>
              <Txt size={12.5} color={t.sub} style={{ lineHeight: 18 }}>
                ช่วง {thaiDate(pendingTT.from)} – {thaiDate(pendingTT.to)} · ของเดิมในช่วงนี้ (รวมสถานะและโน้ต) จะหายและกู้คืนไม่ได้ · ถ้ายังไม่แน่ใจ สำรองข้อมูลไว้ก่อน
              </Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn style={{ flex: 1 }} kind="ghost" label="ไม่แทนที่" disabled={!!busy} onPress={() => setConfirmTT(null)} />
                <Btn style={{ flex: 1 }} kind="ghost" icon="download" label="สำรองก่อน" disabled={!!busy} onPress={exportJson} />
              </View>
              <Btn kind="danger" label="ยืนยัน · แทนที่ช่วงนี้" disabled={!!busy} onPress={() => doTTImport('replace')} />
            </>
          ) : (
            <>
              <Txt size={12} color={t.sub}>
                ช่วง {thaiDate(pendingTT.from)} – {thaiDate(pendingTT.to)} · หมวดถูกเดาจากชื่อกิจกรรม แก้ทีหลังได้{'\n'}
                ไฟล์ .xlsx: สีพื้นเซลล์เดิมถูกจำไว้ ส่งออกครั้งหน้าได้สีเดิมกลับไป{'\n'}
                “แทนที่ช่วงนี้” จะลบข้อมูลเดิมเฉพาะช่วงวันดังกล่าวก่อนนำเข้า
              </Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" disabled={!!busy} onPress={() => setPendingTT(null)} />
                <Btn style={{ flex: 1 }} label="เพิ่มรวม" disabled={!!busy} onPress={() => doTTImport('merge')} />
                <Btn
                  style={{ flex: 1 }}
                  kind="dangerSoft"
                  label="แทนที่ช่วงนี้…"
                  disabled={!!busy}
                  onPress={() => {
                    // นับของเดิมในช่วงที่จะถูกลบ — บอกจำนวนก่อนให้ยืนยัน
                    let n = 0;
                    for (let d = pendingTT.from; d <= pendingTT.to; d = addDays(d, 1)) n += getDay(d).length;
                    if (n) setConfirmTT(n);
                    else doTTImport('replace'); // ช่วงนี้ยังว่าง — ไม่มีอะไรให้ลบ
                  }}
                />
              </View>
            </>
          )}
          {busy ? <BusyLine text={busy} /> : null}
        </Card>
        </FadeInView>
      ) : null}

      <Card>
        <Txt size={12} weight="bold" color={t.sub} style={{ marginBottom: 4 }}>สำรองและกู้คืน</Txt>
        <Row icon="download" label="สำรองข้อมูลทั้งหมด" sub="ไฟล์เดียวครบทุกอย่าง (กิจกรรม · รายชื่อ · สถานะ · โน้ต · การตั้งค่าหมวด) — เก็บไว้กู้คืนหรือย้ายเครื่อง" onPress={exportJson} />
        <Row icon="restore" label="กู้คืนจากไฟล์สำรอง" sub="เลือกไฟล์ที่สำรองไว้จากแอปนี้" onPress={pickImport} last />
      </Card>

      {pendingImport ? (
        <FadeInView rise={-6}>
        <Card tone="card2" style={{ gap: 10, borderWidth: confirmAll ? 1.5 : 0, borderColor: t.warn }}>
          <Txt size={14} weight="bold">
            ในไฟล์: กิจกรรม {pendingImport.activities.length} · รายชื่อ {pendingImport.contacts.length}
          </Txt>
          {confirmAll ? (
            <>
              <Txt size={13.5} weight="bold" color={t.warn}>
                ลบข้อมูลในเครื่องทั้งหมด แล้วใช้ข้อมูลจากไฟล์นี้แทน?
              </Txt>
              <Txt size={12.5} color={t.sub} style={{ lineHeight: 18 }}>
                ตอนนี้ในเครื่องมีกิจกรรม {acts.length} · รายชื่อ {contactCount} — จะหายทั้งหมดและกู้คืนไม่ได้ · ถ้ายังไม่ได้สำรอง กด “สำรองก่อน”
              </Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn style={{ flex: 1 }} kind="ghost" label="ไม่แทนที่" disabled={!!busy} onPress={() => setConfirmAll(false)} />
                <Btn style={{ flex: 1 }} kind="ghost" icon="download" label="สำรองก่อน" disabled={!!busy} onPress={exportJson} />
              </View>
              <Btn kind="danger" label="ยืนยัน · แทนที่ทั้งหมด" disabled={!!busy} onPress={() => doImport('replace')} />
            </>
          ) : (
            <>
              <Txt size={12} color={t.sub}>เลือกวิธีนำเข้า — “รวม” เก็บของเดิมไว้แล้วเพิ่มของในไฟล์ · “แทนที่” ลบข้อมูลในเครื่องทั้งหมดก่อน</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" disabled={!!busy} onPress={() => setPendingImport(null)} />
                <Btn style={{ flex: 1 }} label="รวมกับของเดิม" disabled={!!busy} onPress={() => doImport('merge')} />
                {/* ในเครื่องยังว่าง = ไม่มีอะไรให้ลบ → แทนที่ได้เลย */}
                <Btn style={{ flex: 1 }} kind="dangerSoft" label="แทนที่…" disabled={!!busy} onPress={() => (acts.length || contactCount ? setConfirmAll(true) : doImport('replace'))} />
              </View>
            </>
          )}
          {busy ? <BusyLine text={busy} /> : null}
        </Card>
        </FadeInView>
      ) : null}

      <Card style={{ gap: 13 }}>
        <Txt size={12} weight="bold" color={t.sub}>Google Sheets (ส่งจากแอปขึ้นชีตทางเดียว)</Txt>

        {!sheetsUrl ? (
          // ยังไม่เชื่อมต่อ — เลือกจากรายการ URL ที่บันทึกไว้ได้ทันที หรือไปตั้งค่าใหม่
          <>
            <Row
              icon="cloud"
              label="ส่งขึ้น Google Sheets"
              sub={sheetsUrls.length ? `ยังไม่เชื่อมต่อ — มี ${sheetsUrls.length} URL บันทึกไว้ เลือกด้านล่างเพื่อเชื่อมต่อ` : 'ยังไม่เชื่อมต่อ — ติดตั้งครั้งเดียว ใช้ได้ตลอด'}
              last
              onPress={sheetsUrls.length ? undefined : () => router.push('/settings/sheets-setup')}
            />
            {sheetsUrls.length ? (
              <>
                <View style={{ gap: 6 }}>
                  <Txt size={12} weight="bold" color={t.sub}>URL ที่บันทึกไว้ ({sheetsUrls.length}/5)</Txt>
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
              sub={sheetsLast && sheetsLast.url === sheetsUrl ? `ส่งล่าสุด ${whenText(sheetsLast.at)} · ${sheetsLast.tabs} แท็บ` : 'ยังไม่เคยส่งจากเครื่องนี้'}
              subColor={sheetsLast && sheetsLast.url === sheetsUrl ? t.greenInk : undefined}
              last
              right={<Chip small icon="edit" label="แก้ URL" onPress={() => router.push('/settings/sheets-setup')} />}
            />

            {/* แสดงทีละบล็อก: ตั้งค่าก่อนส่ง → ยืนยันยกเลิก → ปุ่มปกติ (ไม่ซ้อนกันให้รก) */}
            {shOpen ? (
              <View style={{ gap: 12 }}>
                <Txt size={14} weight="bold">ส่งขึ้น Google Sheets — เลือกช่วงข้อมูล</Txt>

                {/* ขอบเขต 3 แบบ (ชุดเดียวกับส่งออกไฟล์) */}
                <Seg options={SCOPE_OPTIONS} value={shScope} onChange={setShScope} />
                <ScopeDetail scope={shScope} months={dataMonths} picked={shMonths} onToggle={toggleShMonth} verb="ส่ง" />

                {/* เนื้อหาที่จะลงในชีต */}
                <View style={{ gap: 6 }}>
                  <Txt size={12} weight="med" color={t.sub}>เนื้อหาในชีต</Txt>
                  <CheckRow
                    label="รายงานสรุปจากที่บันทึกไว้"
                    sub={`แท็บหน้าสุด: “รายงานสรุป” (ภาพรวม/แนวโน้ม/สรุปหมวดหมู่ + รายการกิจกรรมทุกชื่อในทั้ง 6 หมวด) · “สรุปเคส & รายชื่อ” (รวมรายการนัด)${noteReport ? ' · “โน้ตรายครั้ง” (โน้ตทุกหมวด)' : ''}`}
                    on={shReport}
                    onPress={() => {
                      const next = !shReport;
                      setShReport(next);
                      if (!next) setShGrid(true); // ไม่เอารายงานแล้วต้องเหลือตารางไว้อย่างน้อยหนึ่งอย่าง
                    }}
                  />
                  <CheckRow
                    label="ตาราง Time Table + รายการกิจกรรม"
                    sub={`แท็บตารางช่องเวลา 30 นาที ต่อเดือน + แท็บรายการกิจกรรมแบบแถว${noteReport ? ' (มีคอลัมน์โน้ต)' : ''}`}
                    on={shGrid}
                    disabled={!shReport}
                    onPress={() => setShGrid(!shGrid)}
                  />
                </View>

                {/* ระดับการจัดรูปแบบในชีต */}
                <View style={{ gap: 6 }}>
                  <Txt size={12} weight="med" color={t.sub}>รูปแบบข้อมูลในชีต</Txt>
                  <Seg
                    options={[['rich', 'เต็มรูปแบบ'], ['color', 'มีสี'], ['plain', 'ค่าล้วน']]}
                    value={shStyle}
                    onChange={setShStyle}
                  />
                  <Txt size={11.5} color={t.sub} style={{ lineHeight: 17 }}>
                    {shStyle === 'rich'
                      ? 'เต็มรูปแบบ: กิจกรรมยาวถมสีต่อเนื่องโดยไม่พิมพ์ชื่อซ้ำ (มองเป็นบล็อกเดียวเหมือนเซลล์ merge) ✓/✗ ตามสถานะ — อ่านสวยที่สุด'
                      : shStyle === 'color'
                        ? 'มีสี: พิมพ์ชื่อทุกช่องที่กิจกรรมคลุม (กริดเดียวกับ CSV — คัดลอกจากชีตกลับเข้าแอปได้) พร้อมพื้นสีตามหมวด'
                        : 'ค่าล้วน: ข้อความอย่างเดียวไม่จัดรูปแบบ — ใช้กับสคริปต์รุ่นเก่าที่ยังไม่รองรับการลงสี'}
                    {shStyle !== 'plain' ? '\n(สี/ตัวหนาต้องใช้ Apps Script เวอร์ชันล่าสุด — รุ่นเก่าจะลงเฉพาะค่า)' : ''}
                  </Txt>
                </View>

                {/* โทนสีของชีต — ค่าล้วนไม่มีสีจึงไม่ต้องเลือก */}
                {shStyle !== 'plain' ? <TonePicks label="โทนสีของชีต" value={shTone} onChange={setShTone} /> : null}

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn style={{ flex: 1 }} kind="ghost" label="ยกเลิก" onPress={() => setShOpen(false)} />
                  <Btn
                    style={{ flex: 2 }}
                    icon="cloud"
                    label={!shGrid ? 'ส่งรายงานขึ้นชีต' : shReport ? 'ส่งตาราง + รายงาน' : 'ส่งตารางขึ้นชีต'}
                    disabled={shScope === 'pick' && !shMonths.length}
                    onPress={sendToSheets}
                  />
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
                <Txt size={12} weight="bold" color={t.sub}>สลับไปใช้ URL อื่น</Txt>
                {savedOthers.map((u) => (
                  <UrlItem key={u} url={u} actionLabel="ใช้" onAction={() => { connectUrl(u); setShowSwitch(false); }} onRemove={() => deleteUrl(u)} />
                ))}
                <Btn kind="ghost" label="ปิด" onPress={() => setShowSwitch(false)} />
              </View>
            ) : (
              <>
                <Btn
                  icon="cloud"
                  label={sending ? 'กำลังส่ง…' : 'ส่งขึ้น Google Sheets'}
                  disabled={sending}
                  onPress={openSheets}
                />
                {sending ? <BusyLine text="กำลังส่งขึ้น Google Sheets…" /> : null}
                {/* ส่งไม่สำเร็จ — ค้างไว้ให้อ่าน + ลองใหม่/ดูวิธีแก้ (เดิมเป็น toast ที่หายใน 2 วินาที) */}
                {sendErr && !sending ? (
                  <FadeInView rise={-6}>
                    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: t.warn, backgroundColor: t.warn + '12', padding: 12, gap: 8 }}>
                      <Txt size={13.5} weight="bold" color={t.warn}>
                        ส่งขึ้นชีตไม่สำเร็จ
                      </Txt>
                      <Txt size={12.5} color={t.sub} style={{ lineHeight: 18 }}>
                        {sendErr}
                      </Txt>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Btn style={{ flex: 1 }} kind="ghost" label="ดูวิธีแก้" onPress={() => router.push('/settings/sheets-setup')} />
                        <Btn style={{ flex: 1 }} label="ลองอีกครั้ง" onPress={sendToSheets} />
                      </View>
                    </View>
                  </FadeInView>
                ) : null}
                <Txt size={11.5} color={t.sub}>
                  เลือกช่วง (เดือนนี้ / เลือกเดือน / ทั้งหมด) · เนื้อหา (ตาราง / รายงานสรุป) · รูปแบบและโทนสีได้ก่อนส่ง
                </Txt>
                {savedOthers.length ? (
                  <Btn
                    kind="ghost"
                    icon="cloud"
                    label={`สลับ URL อื่น (${savedOthers.length})`}
                    disabled={sending}
                    onPress={() => setShowSwitch(true)}
                  />
                ) : null}
                <Btn
                  kind="ghost"
                  icon="x"
                  label="ยกเลิกการเชื่อมต่อ"
                  disabled={sending}
                  onPress={() => setConfirmDisconnect(true)}
                />
              </>
            )}
          </>
        )}
      </Card>

      <Txt size={11.5} color={t.sub} style={{ textAlign: 'center', lineHeight: 17 }}>
        ส่งขึ้น Google Sheets ทางเดียว (แอป → Sheets): แท็บรายงาน (+ โน้ตรายครั้ง) + ตารางเวลารายเดือน + แท็บรายการกิจกรรม
        {'\n'}ชีตถูกเขียนทับทุกครั้งที่ส่ง (แท็บชื่อเดิม) — แท็บอื่นในไฟล์เดียวกันไม่ถูกแตะ
      </Txt>
    </Screen>
  );
}

/** ตัดข้อความยาวเกิน max ตัวอักษร แล้วปิดท้ายด้วย … */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** ขอบเขตเดือน 3 แบบ — ใช้ทั้งส่งออกไฟล์และส่งขึ้นชีต */
const SCOPE_OPTIONS = [['month', 'เดือนนี้'], ['pick', 'เลือกเดือน'], ['all', 'ทั้งหมด']] as const;

/** แถบเลือกแบบแบ่งช่องเท่า ๆ กัน (ขอบเขต / รูปแบบไฟล์ / รูปแบบชีต) — ใช้ Segmented กลางของแอป (แผ่นขาวเลื่อน + อ่านด้วยตัวอ่านหน้าจอได้) */
function Seg<K extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [K, string])[];
  value: K;
  onChange: (k: K) => void;
}) {
  return <Segmented options={options.map(([key, label]) => ({ key, label }))} value={value} onChange={onChange} />;
}

/** ให้จอวาดสถานะ "กำลังทำงาน" ก่อนเริ่มงานหนักบนเธรดหลัก */
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 40));

/** เวลาที่ผ่านมาแบบอ่านง่าย: "วันนี้ 14:05" / "12 พ.ย. 09:30" */
function whenText(at: number): string {
  const d = new Date(at);
  const iso = toISO(d);
  return `${iso === todayISO() ? 'วันนี้' : thaiDate(iso)} ${fmtMin(d.getHours() * 60 + d.getMinutes())}`;
}

/** รายละเอียดของขอบเขตที่เลือก — โหมด "เลือกเดือน" จะกลายเป็นชิปติ๊กเลือกจากเดือนที่มีข้อมูล */
function ScopeDetail({
  scope,
  months,
  picked,
  onToggle,
  verb,
}: {
  scope: SheetsScope;
  months: string[];
  picked: string[];
  onToggle: (anchor: string) => void;
  verb: string;
}) {
  const t = useTokens();
  if (scope !== 'pick') {
    return (
      <Txt size={12} color={t.sub}>
        {scope === 'month'
          ? `${verb}เฉพาะเดือนนี้ (${ttMonthLabel(thisMonthAnchor())})`
          : `${verb}ทุกเดือนที่มีข้อมูล — ${months.length} เดือน (${ttMonthLabel(months[0])} – ${ttMonthLabel(months[months.length - 1])})`}
      </Txt>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Txt size={11.5} color={t.sub}>ติ๊กเดือนที่จะ{verb} — เลือกแล้ว {picked.length} เดือน</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {months.map((mo) => {
          const on = picked.includes(mo);
          return (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={ttMonthLabel(mo)} hitSlop={4} style={pressFade()} key={mo} onPress={() => onToggle(mo)}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  minHeight: 36,
                  paddingHorizontal: 12,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: on ? t.accent : t.line,
                  backgroundColor: on ? t.chip : 'transparent',
                }}>
                <Icon name={on ? 'check' : 'plus'} size={13} color={on ? t.accent : t.faint} />
                <Txt size={12} color={on ? t.accent : t.sub}>{ttMonthLabel(mo)}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** เลือกโทนสี (ชุดเดียวกันทั้งไฟล์ส่งออกและชีต) พร้อมพรีวิวแถบสี */
function TonePicks({
  label,
  value,
  onChange,
  note,
}: {
  label: string;
  value: ExportTone;
  onChange: (v: ExportTone) => void;
  note?: string;
}) {
  const t = useTokens();
  return (
    <View style={{ gap: 6 }}>
      <Txt size={12} weight="med" color={t.sub}>{label}</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {EXPORT_TONES.map((p) => {
          const on = value === p.id;
          return (
            <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`โทนสี ${p.name}`} onPress={() => onChange(p.id)} style={pressFade({ flex: 1 })}>
              <View
                style={{
                  gap: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 6,
                  borderRadius: 10,
                  borderWidth: 1,
                  alignItems: 'center',
                  borderColor: on ? t.accent : t.line,
                  backgroundColor: on ? t.chip : 'transparent',
                }}>
                <View style={{ flexDirection: 'row', borderRadius: 5, overflow: 'hidden' }}>
                  {p.swatch.map((c) => (
                    <View key={c} style={{ width: 13, height: 13, backgroundColor: c }} />
                  ))}
                </View>
                <Txt size={11.5} weight="bold" color={on ? t.accent : t.sub}>{p.name}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Txt size={11.5} color={t.sub}>
        {EXPORT_PALETTES[value].desc}
        {note ? `\n${note}` : ''}
      </Txt>
    </View>
  );
}

/** first-of-month ISO ของเดือนปัจจุบัน (anchor สำหรับ Time Table) */
function thisMonthAnchor(): string {
  return todayISO().slice(0, 7) + '-01';
}

/** anchor 'YYYY-MM-01' → "ก.ค. 2569" */
function ttMonthLabel(anchor: string): string {
  const [y, m] = anchor.split('-').map(Number);
  return `${MONTH_TH[m - 1]} ${beYear(y)}`;
}

/** แถวติ๊กเลือกเนื้อหาที่จะใส่ในไฟล์ส่งออก */
function CheckRow({ label, sub, on, disabled, onPress }: { label: string; sub: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !!disabled }} accessibilityLabel={label} accessibilityHint={sub} disabled={disabled} onPress={onPress} style={pressFade({ opacity: disabled ? 0.4 : 1 })}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: on ? t.accent : t.line,
          backgroundColor: on ? t.chip : 'transparent',
        }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: on ? GREEN : 'transparent',
            borderWidth: on ? 0 : 1.5,
            borderColor: t.line2,
          }}>
          {on ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Txt size={12.5} weight="bold" color={on ? t.ink : t.sub}>{label}</Txt>
          <Txt size={11.5} color={t.sub} style={{ lineHeight: 16 }}>{sub}</Txt>
        </View>
      </View>
    </Pressable>
  );
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
      {/* เว้นจากปุ่มเชื่อมต่อ + พื้นที่แตะ 36 — ไม่ให้นิ้วพลาดไปโดนปุ่มลบ */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ลบ URL นี้ออกจากรายการ"
        onPress={onRemove}
        hitSlop={6}
        style={pressFade({ width: 36, height: 36, marginLeft: 4, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.chip })}>
        <Icon name="trash" size={15} color={t.warn} />
      </Pressable>
    </View>
  );
}

/** แถบ "กำลังทำงาน" ใต้ปุ่มยืนยัน — งานเขียนข้อมูลชุดใหญ่ใช้เวลา ไม่ให้ดูเหมือนแอปค้าง */
function BusyLine({ text }: { text: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 }}>
      <ActivityIndicator size="small" color={t.sub} />
      <Txt size={12.5} color={t.sub}>
        {text} อย่าเพิ่งปิดแอป
      </Txt>
    </View>
  );
}
