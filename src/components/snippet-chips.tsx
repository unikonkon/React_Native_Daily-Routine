// ชิปโน้ตสำเร็จรูป — ใช้ร่วมแผ่นรายละเอียดและฟอร์มเพิ่ม/แก้ไข (จำนวน/ลำดับ/ปักหมุด/ซ่อน ตั้งที่ ตั้งค่า › จัดการโน้ต)
// แตะชิป = แทรกข้อความลงช่องโน้ต (คนเรียกเป็นคนแทรก) + นับการใช้ · เกินจำนวนที่ตั้งไว้กด "ทั้งหมด" · "จัดการ ›" ไปหน้าจัดการโน้ต
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { SvgIcon } from '@/components/svg-icon';
import { Txt, useTokens } from '@/components/ui';
import type { CatId } from '@/constants/theme';
import { snippetsFor } from '@/lib/notes';
import { useSettings } from '@/stores/settings';

export function SnippetChips({ cat, limit, onPick, onManage }: { cat: CatId; limit: number; onPick: (text: string) => void; onManage?: () => void }) {
  const t = useTokens();
  const snippets = useSettings((s) => s.noteSnippets);
  const countSnippet = useSettings((s) => s.countSnippet);
  const [all, setAll] = useState(false);
  if (limit <= 0) return null;
  const list = snippetsFor(cat, snippets);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, limit);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {shown.map((sn) => (
        <Pressable
          key={sn.id}
          accessibilityRole="button"
          accessibilityLabel={`แทรกโน้ตสำเร็จรูป ${sn.text}`}
          onPress={() => {
            onPick(sn.text);
            countSnippet(sn.id);
          }}
          style={({ pressed }) => ({ maxWidth: '100%', minHeight: 32, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: pressed ? t.rail : t.track })}>
          <SvgIcon name={sn.pinned ? 'pin' : 'plus'} size={11} color={t.sub} strokeWidth={2.6} />
          <Txt size={12.5} weight="med" color={t.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
            {sn.text.replace(/\s*\n\s*/g, ' · ')}
          </Txt>
        </Pressable>
      ))}
      {list.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={4} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 11, borderRadius: 16, justifyContent: 'center', backgroundColor: pressed ? t.rail : 'transparent' })}>
          <Txt size={12.5} weight="bold" color={t.accentInk}>
            {all ? 'ย่อ' : `ทั้งหมด (${list.length})`}
          </Txt>
        </Pressable>
      ) : null}
      {onManage ? (
        <Pressable accessibilityRole="button" accessibilityLabel="จัดการโน้ตสำเร็จรูป" onPress={onManage} hitSlop={4} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 9, borderRadius: 16, justifyContent: 'center', backgroundColor: pressed ? t.rail : 'transparent' })}>
          <Txt size={12.5} color={t.faint}>
            จัดการ ›
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
