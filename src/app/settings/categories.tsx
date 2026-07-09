// 6.2 จัดการหมวดหมู่ — หมวดคงที่ 6 หมวดตาม prototype (แสดงรายการ + ป้าย priority)
import React from 'react';
import { View } from 'react-native';

import { CATS, PRI } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Card, Row, Txt, useTokens } from '@/components/ui';

export default function CategoriesScreen() {
  const t = useTokens();
  return (
    <Screen title="จัดการหมวดหมู่" subtitle="6 หมวด · P1–P6" back>
      <Card>
        {CATS.map((c, i) => (
          <Row
            key={c.id}
            label={c.name}
            sub={c.isCase ? 'มีรายชื่อคน + priority + เลื่อนนัดได้' : undefined}
            last={i === CATS.length - 1}
            right={
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={c.icon} size={17} color={c.color} />
              </View>
            }
          />
        ))}
      </Card>

      <Card>
        <Txt size={12} weight="bold" color={t.faint} style={{ marginBottom: 4 }}>ระดับความสำคัญของเคส (P1–P6)</Txt>
        {PRI.map((p, i) => (
          <Row
            key={p.id}
            label={`${p.id} · ${p.label}`}
            last={i === PRI.length - 1}
            right={<View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: p.color }} />}
          />
        ))}
      </Card>

      <Txt size={11} color={t.faint} style={{ textAlign: 'center' }}>
        หมวดและระดับความสำคัญเป็นชุดมาตรฐานตามดีไซน์ — การแก้ชื่อ/สีจะเพิ่มในรุ่นถัดไป
      </Txt>
    </Screen>
  );
}
