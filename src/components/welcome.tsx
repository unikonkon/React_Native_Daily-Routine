// หน้าต้อนรับ (เปิดแอปครั้งแรก) — 2 ขั้น: ① เลือกโทนสีที่ชอบ (เปลี่ยนทั้งจอทันที) ② คำแนะนำการใช้ 4 ข้อ (ท่าที่มองไม่เห็นบนจอ)
// เปิดซ้ำได้จาก ตั้งค่า › วิธีใช้เบื้องต้น (เริ่มที่ขั้นคำแนะนำ)
// เป็นแผ่นทับเต็มจอ (ไม่ใช่ Modal) — ไม่ชนกับแผ่นรายละเอียด/แผ่นเลื่อนนัดที่เป็น Modal
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusDot } from '@/components/b1/status-circle';
import { FadeInView } from '@/components/motion';
import { TopGlow } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { ThemeThumb } from '@/components/theme-thumb';
import { Btn, Txt, useThemeName, useTokens } from '@/components/ui';
import { DARK_THEMES, LIGHT_THEMES, THEME_PALETTES, type DarkThemeId, type LightThemeId, type ThemeMeta } from '@/constants/theme';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

export function Welcome() {
  const welcomed = useSettings((s) => s.welcomed);
  const guide = useUI((s) => s.guide);
  // ครั้งแรก = เริ่มที่เลือกโทนสี · เปิดจากหน้าตั้งค่า = เริ่มที่คำแนะนำ
  return !welcomed || guide ? <Body key={guide ? 'guide' : 'first'} first={!welcomed} /> : null;
}

function Body({ first }: { first: boolean }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const mode = useThemeName();
  const themeLight = useSettings((s) => s.themeLight);
  const themeDark = useSettings((s) => s.themeDark);
  const [step, setStep] = useState<1 | 2>(first ? 1 : 2);

  const list: ThemeMeta[] = mode === 'dark' ? DARK_THEMES : LIGHT_THEMES;
  const current = mode === 'dark' ? themeDark : themeLight;
  const pick = (id: string) => {
    if (mode === 'dark') useSettings.getState().setThemeDark(id as DarkThemeId);
    else useSettings.getState().setThemeLight(id as LightThemeId);
  };
  const finish = () => {
    if (!useSettings.getState().welcomed) useSettings.getState().setWelcomed(true);
    useUI.getState().setGuide(false);
  };

  return (
    <FadeInView duration={240} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 500, backgroundColor: t.bg, paddingTop: insets.top }}>
      <TopGlow />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 24, gap: 18 }}>
        {step === 1 ? (
          <FadeInView key="theme" rise={10} duration={260} style={{ gap: 18 }}>
            <View style={{ gap: 6 }}>
              <Txt size={13} weight="bold" color={t.accentInk}>
                ยินดีต้อนรับ
              </Txt>
              <Txt size={26} weight="bold" style={{ lineHeight: 34 }}>
                เลือกโทนสีที่ชอบ
              </Txt>
              <Txt size={14} color={t.sub} style={{ lineHeight: 21 }}>
                แตะเพื่อดูตัวอย่างได้เลย เปลี่ยนภายหลังได้ที่ ตั้งค่า › ธีมและการแสดงผล
              </Txt>
            </View>
            <View accessibilityRole="radiogroup" accessibilityLabel="โทนสี" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {list.map((meta) => {
                const on = meta.id === current;
                return (
                  <Pressable
                    key={meta.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`ธีม${meta.name} — ${meta.mood}`}
                    onPress={() => pick(meta.id)}
                    style={({ pressed }) => ({
                      width: '48%',
                      flexGrow: 1,
                      padding: 10,
                      gap: 8,
                      borderRadius: 18,
                      alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: on ? t.accent : 'transparent',
                      backgroundColor: on ? t.accent + '14' : pressed ? t.track : t.card,
                    })}>
                    <ThemeThumb p={THEME_PALETTES[meta.id]} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      {on ? <SvgIcon name="check" size={13} color={t.accentInk} strokeWidth={3} /> : null}
                      <Txt size={13.5} weight={on ? 'bold' : 'med'} color={on ? t.accentInk : t.ink} numberOfLines={1}>
                        {meta.name}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </FadeInView>
        ) : (
          <FadeInView key="tips" rise={10} duration={260} style={{ gap: 18 }}>
            <View style={{ gap: 6 }}>
              <Txt size={13} weight="bold" color={t.accentInk}>
                {first ? 'เกือบเสร็จแล้ว' : 'วิธีใช้เบื้องต้น'}
              </Txt>
              <Txt size={26} weight="bold" style={{ lineHeight: 34 }}>
                ใช้งานง่าย ๆ 4 อย่าง
              </Txt>
              <Txt size={14} color={t.sub} style={{ lineHeight: 21 }}>
                เปิดดูซ้ำได้ที่ ตั้งค่า › วิธีใช้เบื้องต้น
              </Txt>
            </View>
            <View style={{ gap: 10 }}>
              <Tip art={<StatusDot state="done" size={26} />} title="แตะวงกลมหน้ารายการ = ทำแล้ว" sub="แตะซ้ำเพื่อย้อนกลับ · แตะที่ชื่อรายการเพื่อดูรายละเอียด จดโน้ต หรือเลื่อนนัด" />
              <Tip
                art={
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <SvgIcon name="chevL" size={16} color={t.accentInk} strokeWidth={2.2} />
                    <SvgIcon name="chevR" size={16} color={t.accentInk} strokeWidth={2.2} />
                  </View>
                }
                title="ปัดซ้าย–ขวาที่รายการ = เปลี่ยนวัน"
                sub="หรือแตะวันที่ในแถบ 7 วันด้านบน · ปุ่ม “วันนี้” พากลับมาที่ตอนนี้"
              />
              <Tip art={<SvgIcon name="clock" size={22} color={t.accentInk} strokeWidth={1.8} />} title="ปุ่มนาฬิกามุมขวาบน = ดูเวลาว่าง" sub="ช่วงว่างจะขึ้นเป็นกรอบเส้นประสีเขียว แตะเพื่อเพิ่มกิจกรรมลงเวลานั้นได้ทันที" />
              <Tip art={<SvgIcon name="phone" size={20} color={t.accentInk} strokeWidth={1.8} />} title="กดค้างที่ไอคอนติดต่อ = คัดลอก" sub="แตะครั้งเดียวเพื่อโทรหรือเปิด LINE · กดค้างเพื่อคัดลอกเบอร์หรือไอดี" />
            </View>
          </FadeInView>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: insets.bottom + 18, gap: 14 }}>
        <View accessibilityLabel={`ขั้นที่ ${step} จาก 2`} style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {[1, 2].map((n) => (
            <View key={n} style={{ width: n === step ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: n === step ? t.accent : t.railDash }} />
          ))}
        </View>
        {step === 1 ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="ข้าม" onPress={finish} />
            <Btn style={{ flex: 2 }} label="ถัดไป" onPress={() => setStep(2)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn style={{ flex: 1 }} kind="ghost" label="เลือกโทนสี" onPress={() => setStep(1)} />
            <Btn style={{ flex: 2 }} label={first ? 'เริ่มใช้งาน' : 'เข้าใจแล้ว'} onPress={finish} />
          </View>
        )}
      </View>
    </FadeInView>
  );
}

/** คำแนะนำ 1 ข้อ — ภาพเล็กในวงสีอ่อน + หัวข้อ + คำอธิบาย */
function Tip({ art, title, sub }: { art: React.ReactNode; title: string; sub: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: t.card }}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.accent + '1A', alignItems: 'center', justifyContent: 'center' }}>
        {art}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14.5} weight="bold" style={{ lineHeight: 21 }}>
          {title}
        </Txt>
        <Txt size={12.5} color={t.sub} style={{ lineHeight: 19 }}>
          {sub}
        </Txt>
      </View>
    </View>
  );
}
