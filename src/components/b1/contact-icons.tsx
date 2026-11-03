// ช่องทางติดต่อแบบไอคอนย่อของนัดเคส — แถวละคน: ชื่อ + ปุ่มไอคอน (โทร/LINE/อีเมล/Zoom/Meet)
// ใต้แถว (เต็มความกว้าง ไม่ถูกไอคอนบีบ): องค์กร/บริษัท 1 บรรทัด · หมายเหตุ ≤2 บรรทัด — โชว์เมื่อมี
// แตะ = เปิดแอปของช่องทางนั้น (ไม่มีแอป → ลิงก์สำรอง) · กดค้าง = คัดลอกค่า
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { Pressable, View } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import type { Contact } from '@/lib/types';
import { contactMethods, openLink, type ContactMethod } from '@/stores/contacts';
import { useUI } from '@/stores/ui';

/** สีประจำช่องทาง — Zoom กับ Meet ใช้ไอคอนกล้องเหมือนกัน จึงแยกด้วยสี */
const TINT: Record<ContactMethod['key'], string> = {
  phone: '#4C9A6A',
  line: '#06A94D',
  email: '#C27A2C',
  zoom: '#2D7FF0',
  googlemeet: '#1A8C7A',
};

const SIZE = 30;

async function openMethod(m: ContactMethod) {
  const { showToast } = useUI.getState();
  const res = await openLink(m.url, m.fallback);
  if (res === 'fallback') showToast(`ไม่พบแอป ${m.label} — เปิดในเบราว์เซอร์แทน`);
  if (res === 'fail') showToast(`เปิด ${m.label} ไม่ได้ — กดค้างที่ไอคอนเพื่อคัดลอก`);
}

async function copyMethod(m: ContactMethod) {
  await Clipboard.setStringAsync(m.value);
  useUI.getState().showToast(`คัดลอก${m.label}แล้ว ✓`);
}

function MethodBtn({ m, name }: { m: ContactMethod; name: string }) {
  const tint = TINT[m.key];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${m.label} ${name}`}
      accessibilityHint="แตะเพื่อเปิด · กดค้างเพื่อคัดลอก"
      onPress={() => openMethod(m)}
      onLongPress={() => copyMethod(m)}
      hitSlop={4}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint + (pressed ? '38' : '1C'),
      })}>
      <SvgIcon name={m.icon} size={15} color={tint} />
    </Pressable>
  );
}

/** บรรทัดรายละเอียดใต้ชื่อ — ไอคอนเล็กตรงแนวไอคอนคน + ข้อความสีรอง */
function Detail({ icon, text, lines }: { icon: string; text: string; lines: number }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      <View style={{ paddingTop: 2 }}>
        <SvgIcon name={icon} size={12} color={t.muted} />
      </View>
      <Txt size={11.5} color={t.sub} numberOfLines={lines} style={{ flex: 1, lineHeight: 16 }}>
        {text}
      </Txt>
    </View>
  );
}

/** รายชื่อในนัด แถวละคน — คนที่ไม่มีช่องทางเลยแสดงชื่ออย่างเดียว · องค์กร/หมายเหตุโชว์เมื่อมี */
export function ContactIcons({ contacts, dim }: { contacts: Contact[]; dim?: boolean }) {
  const t = useTokens();
  if (!contacts.length) return null;
  return (
    <View style={{ marginTop: 8, gap: 8, opacity: dim ? 0.6 : 1 }}>
      {contacts.map((c) => {
        const methods = contactMethods(c);
        return (
          <View key={c.id} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: SIZE }}>
              <SvgIcon name="user" size={13} color={t.sub} />
              <Txt size={12.5} weight="med" color={t.ink} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {c.name}
              </Txt>
              {methods.length ? (
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {methods.map((m) => (
                    <MethodBtn key={m.key} m={m} name={c.name} />
                  ))}
                </View>
              ) : (
                <Txt size={11.5} color={t.faint}>
                  ไม่มีช่องทางติดต่อ
                </Txt>
              )}
            </View>
            {c.org ? <Detail icon="briefcase" text={c.org} lines={1} /> : null}
            {c.note ? <Detail icon="note" text={c.note} lines={2} /> : null}
          </View>
        );
      })}
    </View>
  );
}
