// เชื่อมต่อ Google Sheets — คู่มือติดตั้ง Apps Script ทีละขั้น + รูปประกอบจริง + ปุ่มคัดลอกโค้ด + วาง URL
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Btn, Card, Chip, Txt, useTokens } from '@/components/ui';
import { ACCENT, FONT, GREEN } from '@/constants/theme';
import { APPS_SCRIPT_CODE, isSheetsUrl } from '@/lib/sheets';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

// รูปประกอบขั้นตอน (แคปจากหน้าจอจริง UI ภาษาไทย) — ratio = กว้าง/สูง ของไฟล์จริง
const SHOTS = {
  sheet: { src: require('../../../assets/google-apps-script/sheets-setup-1.png'), ratio: 1467 / 357 },
  share: { src: require('../../../assets/google-apps-script/sheets-setup-2.png'), ratio: 2914 / 1506 },
  menu: { src: require('../../../assets/google-apps-script/sheets-setup-3.png'), ratio: 1484 / 888 },
  code: { src: require('../../../assets/google-apps-script/sheets-setup-4.png'), ratio: 2912 / 1336 },
  webapp: { src: require('../../../assets/google-apps-script/sheets-setup-5.png'), ratio: 1534 / 1198 },
  anyone: { src: require('../../../assets/google-apps-script/sheets-setup-6.png'), ratio: 1518 / 1204 },
  allow: { src: require('../../../assets/google-apps-script/sheets-setup-7.png'), ratio: 1902 / 1450 },
  url: { src: require('../../../assets/google-apps-script/sheets-setup-8.png'), ratio: 1526 / 1194 },
} as const;

export default function SheetsSetupScreen() {
  const t = useTokens();
  const router = useRouter();
  const showToast = useUI((s) => s.showToast);
  const sheetsUrl = useSettings((s) => s.sheetsUrl);
  const sheetsUrls = useSettings((s) => s.sheetsUrls);
  const setSheetsUrl = useSettings((s) => s.setSheetsUrl);

  // เติม URL ปัจจุบัน หรือ URL ล่าสุดในรายการที่บันทึกไว้ (จำไว้แม้ยกเลิกการเชื่อมต่อไปแล้ว)
  const [urlDraft, setUrlDraft] = useState(sheetsUrl || sheetsUrls[0] || '');
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await Clipboard.setStringAsync(APPS_SCRIPT_CODE);
    setCopied(true);
    showToast('คัดลอกโค้ดแล้ว ✓ ไปวางใน Apps Script ได้เลย');
  };

  const pasteUrl = async () => {
    const s = (await Clipboard.getStringAsync()).trim();
    if (!s) return showToast('คลิปบอร์ดว่าง — คัดลอก URL จาก Apps Script ก่อน');
    setUrlDraft(s);
  };

  const saveUrl = () => {
    const url = urlDraft.trim();
    if (!isSheetsUrl(url)) return showToast('URL ไม่ถูกต้อง — ต้องเป็นลิงก์ script.google.com ลงท้าย /exec');
    setSheetsUrl(url);
    showToast('เชื่อมต่อแล้ว ✓ กลับไปกดส่งได้เลย');
    router.back();
  };

  return (
    <Screen title="ต่อ Google Sheets" subtitle="ติดตั้งครั้งเดียว · ทีละขั้น" back>
      {sheetsUrl ? (
        <Card tone="card2" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="check" size={18} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Txt size={13} weight="bold">เชื่อมต่ออยู่แล้ว</Txt>
            <Txt size={11} color={t.faint} numberOfLines={1}>{sheetsUrl}</Txt>
          </View>
        </Card>
      ) : null}

      <Step n={1} title="สร้าง / เปิดชีตปลายทาง">
        <Txt size={13} color={t.sub}>
          ไปที่ Google Sheets แล้วสร้างชีตใหม่ (สเปรดชีตเปล่า) หรือเปิดชีตเดิมที่ต้องการให้ข้อมูลไปลง
        </Txt>
        <Shot {...SHOTS.sheet} caption="ชีตเปล่าที่เพิ่งสร้าง — ตั้งชื่อไฟล์ได้ตามสะดวก" />
        <Shot
          {...SHOTS.share}
          caption="(ไม่บังคับ) ปุ่มแชร์ไว้เปิดให้คนอื่นดูชีตเท่านั้น — การส่งข้อมูลจากแอปไม่ต้องแชร์"
        />
        <Btn
          kind="ghost"
          icon="share"
          label="เปิด Google Sheets"
          onPress={() => Linking.openURL('https://docs.google.com/spreadsheets/u/0/')}
        />
      </Step>

      <Step n={2} title="เปิด Apps Script">
        <Txt size={13} color={t.sub}>
          ในชีตนั้น ไปที่เมนูบน <Txt size={13} weight="bold">ส่วนขยาย → Apps Script</Txt> (อังกฤษ: Extensions → Apps
          Script) จะเปิดแท็บใหม่เป็นหน้าแก้โค้ด — ลบโค้ดเดิมในไฟล์ รหัส.gs (Code.gs) ทิ้งทั้งหมด
        </Txt>
        <Shot {...SHOTS.menu} caption="เมนู ส่วนขยาย → Apps Script" />
      </Step>

      <Step n={3} title="วางโค้ดแล้วกดบันทึก">
        <Txt size={13} color={t.sub}>
          กดปุ่มคัดลอกด้านล่าง แล้วไปวางแทนที่ใน รหัส.gs จากนั้นกดไอคอน 💾 บันทึก
        </Txt>
        <View
          style={{
            backgroundColor: t.card2,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.line,
            padding: 12,
            maxHeight: 180,
            overflow: 'hidden',
          }}>
          <Txt size={10} color={t.faint} numberOfLines={12}>{APPS_SCRIPT_CODE}</Txt>
          <Txt size={10} color={t.faint}>… (ปุ่มด้านล่างคัดลอกให้ครบทั้งไฟล์)</Txt>
        </View>
        <Btn
          kind={copied ? 'green' : 'primary'}
          icon={copied ? 'check' : 'download'}
          label={copied ? 'คัดลอกแล้ว ✓ (กดซ้ำได้)' : 'คัดลอกโค้ดทั้งหมด'}
          onPress={copyCode}
        />
        <Shot {...SHOTS.code} caption="โค้ดที่วางเสร็จใน รหัส.gs — บันทึกแล้วไปต่อที่ปุ่มน้ำเงินมุมขวาบน" />
      </Step>

      <Step n={4} title="Deploy เป็นเว็บแอป">
        <Bullet>
          กดปุ่มน้ำเงิน <Txt size={13} weight="bold">การทำให้ใช้งานได้</Txt> (Deploy) มุมขวาบน → เลือก{' '}
          <Txt size={13} weight="bold">การทำให้ใช้งานได้รายการใหม่</Txt>
        </Bullet>
        <Bullet>กดไอคอนฟันเฟือง ⚙️ ข้าง “เลือกประเภท” → เลือก <Txt size={13} weight="bold">เว็บแอป</Txt></Bullet>
        <Shot {...SHOTS.webapp} caption="เลือกประเภท → เว็บแอป (Web app)" />
        <Bullet>ดำเนินการในฐานะ: <Txt size={13} weight="bold">ฉัน (อีเมลของคุณ)</Txt></Bullet>
        <Bullet>
          ผู้ที่มีสิทธิ์เข้าถึง: <Txt size={13} weight="bold" color={ACCENT}>ทุกคน</Txt> — จุดที่พลาดบ่อยที่สุด!
          ต้องเป็น “ทุกคน” เท่านั้น ไม่ใช่ “ทุกคนที่มีบัญชี Google”
        </Bullet>
        <Bullet>กด <Txt size={13} weight="bold">การทำให้ใช้งานได้</Txt> (ปุ่มน้ำเงินมุมขวาล่าง)</Bullet>
        <Shot {...SHOTS.anyone} caption="ตั้ง ผู้ที่มีสิทธิ์เข้าถึง = ทุกคน แล้วกดปุ่มการทำให้ใช้งานได้" />
      </Step>

      <Step n={5} title="อนุญาตสิทธิ์ (มีจอเตือน — ปกติ)">
        <Bullet>กด <Txt size={13} weight="bold">ให้สิทธิ์เข้าถึง</Txt> → เลือกบัญชี Google ของคุณ</Bullet>
        <Bullet>
          หน้า “ต้องการเข้าถึงบัญชี Google ของคุณ” เป็นเรื่องปกติ — สคริปต์ขอสิทธิ์แก้ชีตของเราเอง ถ้าเจอจอเตือน
          “Google hasn’t verified this app” ให้กด <Txt size={13} weight="bold">Advanced → Go to … (unsafe)</Txt>
        </Bullet>
        <Bullet>กด <Txt size={13} weight="bold">อนุญาต (Allow)</Txt> ด้านล่างสุด</Bullet>
        <Shot {...SHOTS.allow} caption="กด ให้สิทธิ์เข้าถึง แล้วยืนยันในหน้า Sign in with Google" />
      </Step>

      <Step n={6} title="คัดลอก URL มาวางที่นี่" last>
        <Shot {...SHOTS.url} caption="หน้าสรุป: กด คัดลอก ใต้ URL ในกรอบ เว็บแอป (ลงท้าย /exec)" />
        <Txt size={13} color={t.sub}>
          หน้าสรุปจะแสดง <Txt size={13} weight="bold">Web app URL</Txt> (ลงท้าย /exec) — กด Copy
          แล้วกลับมาวางในช่องนี้
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={urlDraft}
            onChangeText={setUrlDraft}
            placeholder="https://script.google.com/macros/s/…/exec"
            placeholderTextColor={t.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              backgroundColor: t.card2,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: t.line,
              padding: 12,
              color: t.ink,
              fontFamily: FONT.ui,
              fontSize: 13,
            }}
          />
          <View style={{ gap: 6 }}>
            <Chip small icon="download" label="วาง" onPress={pasteUrl} />
            {urlDraft ? <Chip small icon="x" label="ลบ" onPress={() => setUrlDraft('')} /> : null}
          </View>
        </View>
        <Btn label={sheetsUrl ? 'บันทึก URL ใหม่' : 'บันทึก & เชื่อมต่อ'} onPress={saveUrl} />
      </Step>

      <Card tone="card2" style={{ gap: 6 }}>
        <Txt size={12} weight="bold" color={t.sub}>ถ้าติดปัญหา</Txt>
        <Txt size={12} color={t.faint}>• ส่งไม่สำเร็จ → เช็คว่า Who has access = Anyone และ URL ลงท้าย /exec (ไม่ใช่ /dev)</Txt>
        <Txt size={12} color={t.faint}>
          • ทดสอบเร็ว ๆ: เปิด URL /exec ใน browser แบบไม่ล็อกอิน (หน้าต่างไม่ระบุตัวตน) — ถ้าเห็น {'{"ok":true}'} =
          สิทธิ์ถูกต้อง ถ้าเด้งหน้า login = ยังไม่ได้ตั้ง Anyone
        </Txt>
        <Txt size={12} color={t.faint}>
          • บัญชีองค์กร (Google Workspace) บางที่ถูกแอดมินบล็อกตัวเลือก Anyone — ถ้าไม่มีให้เลือก ให้สร้างชีตด้วยบัญชี
          Gmail ส่วนตัวแทน
        </Txt>
        <Txt size={12} color={t.faint}>
          • แก้โค้ดสคริปต์ทีหลัง → Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy (URL เดิมใช้ต่อได้)
        </Txt>
        <Txt size={12} color={t.faint}>
          • ข้อมูลแท็บของแอปถูกเขียนทับทุกครั้งที่ส่ง — โน้ตส่วนตัวให้สร้างแท็บแยก สคริปต์จะไม่แตะ
        </Txt>
      </Card>
    </Screen>
  );
}

/** การ์ดขั้นตอน: วงเลขหมายเลข + หัวข้อ + เนื้อหา */
function Step({ n, title, last, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: last ? GREEN : ACCENT,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Txt size={14} num weight="bold" color="#FFFFFF">{n}</Txt>
        </View>
        <Txt size={15} weight="bold" style={{ flex: 1 }}>{title}</Txt>
      </View>
      {children}
    </Card>
  );
}

/** รูปประกอบขั้นตอน: เต็มความกว้างการ์ด ขอบมน + คำบรรยายใต้รูป */
function Shot({ src, ratio, caption }: { src: number; ratio: number; caption?: string }) {
  const t = useTokens();
  return (
    <View style={{ gap: 5 }}>
      <Image
        source={src}
        contentFit="cover"
        transition={150}
        style={{
          width: '100%',
          aspectRatio: ratio,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: t.card2,
        }}
      />
      {caption ? <Txt size={11} color={t.faint}>{caption}</Txt> : null}
    </View>
  );
}

/** แถวหัวข้อย่อยมีจุดนำ */
function Bullet({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Txt size={13} color={t.faint}>•</Txt>
      <Txt size={13} color={t.sub} style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}
