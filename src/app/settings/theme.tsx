// 6.x ธีมและการแสดงผล — โหมด (สว่าง / มืด / ตามระบบ) + ชุดสี 8 แบบต่อโหมด
// เลือกธีมโหมดสว่าง 1 แบบ และธีมโหมดมืด 1 แบบ แยกกัน — "ตามระบบ" สลับระหว่างสองธีมนี้ตามเครื่อง
// แตะธีมแล้วทั้งแอปเปลี่ยนทันที (หน้านี้ด้วย) · แตะธีมของอีกโหมด: ถ้าเลือกโหมดเอง = สลับโหมดตาม · ถ้าตามระบบ = จำไว้ + ปุ่ม "ใช้ตอนนี้"
// สีหมวดกิจกรรม / เขียว (ทำแล้ว) / ส้ม-แดง (ค้าง · ลบ) ไม่เปลี่ยนตามธีม — เป็นความหมายของข้อมูล
import React from 'react';
import { Pressable, View, useColorScheme } from 'react-native';

import { StatusDot } from '@/components/b1/status-circle';
import { Screen } from '@/components/screen';
import { SvgIcon } from '@/components/svg-icon';
import { ThemeThumb } from '@/components/theme-thumb';
import { Card, Segmented, Txt, useThemeName, useTokens } from '@/components/ui';
import {
  ATTN,
  CAT_BY_ID,
  DARK_THEMES,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  GREEN,
  LIGHT_THEMES,
  THEME_PALETTES,
  type DarkThemeId,
  type LightThemeId,
  type ThemeMeta,
  type ThemeName,
  type ThemePref,
} from '@/constants/theme';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

const MODE_LABEL: Record<ThemeName, string> = { light: 'สว่าง', dark: 'มืด' };

export default function ThemeScreen() {
  const t = useTokens();
  /** โหมดที่ใช้จริงตอนนี้ */
  const mode = useThemeName();
  const sys: ThemeName = useColorScheme() === 'dark' ? 'dark' : 'light';
  const pref = useSettings((s) => s.theme);
  const themeLight = useSettings((s) => s.themeLight);
  const themeDark = useSettings((s) => s.themeDark);
  const setTheme = useSettings((s) => s.setTheme);
  const setThemeLight = useSettings((s) => s.setThemeLight);
  const setThemeDark = useSettings((s) => s.setThemeDark);
  const showToast = useUI((s) => s.showToast);

  const lightMeta = LIGHT_THEMES.find((x) => x.id === themeLight) ?? LIGHT_THEMES[0];
  const darkMeta = DARK_THEMES.find((x) => x.id === themeDark) ?? DARK_THEMES[0];
  const activeMeta = mode === 'dark' ? darkMeta : lightMeta;
  const isDefault = themeLight === DEFAULT_LIGHT_THEME && themeDark === DEFAULT_DARK_THEME;

  const pick = (m: ThemeName, meta: ThemeMeta) => {
    if (m === 'light') setThemeLight(meta.id as LightThemeId);
    else setThemeDark(meta.id as DarkThemeId);
    if (m === mode) return; // โหมดเดียวกับที่ใช้อยู่ — เห็นผลทันที ไม่ต้องบอกอะไร
    if (pref === 'system') {
      // ตามระบบ: ไม่ยึดโหมดจากผู้ใช้เอง — จำธีมไว้ แล้วให้ทางลัดสลับโหมดถ้าอยากเห็นเลย
      showToast(`ตั้ง “${meta.name}” เป็นธีมโหมด${MODE_LABEL[m]}แล้ว — จะใช้เมื่อเครื่องเป็นโหมด${MODE_LABEL[m]}`, { label: 'ใช้ตอนนี้', run: () => setTheme(m) });
      return;
    }
    setTheme(m);
    showToast(`เปลี่ยนเป็นโหมด${MODE_LABEL[m]} · ธีม${meta.name}`);
  };

  const reset = () => {
    const before = { themeLight, themeDark };
    setThemeLight(DEFAULT_LIGHT_THEME);
    setThemeDark(DEFAULT_DARK_THEME);
    showToast('กลับเป็นธีมเดิมแล้ว (ครีมอุ่น · โกโก้)', {
      label: 'เลิกทำ',
      run: () => {
        setThemeLight(before.themeLight);
        setThemeDark(before.themeDark);
      },
    });
  };

  const modeNote =
    pref === 'system'
      ? `ตอนนี้เครื่องอยู่โหมด${MODE_LABEL[sys]} จึงใช้ธีม “${activeMeta.name}” — เครื่องสลับโหมดเมื่อไร แอปสลับธีมตาม`
      : `ใช้โหมด${MODE_LABEL[mode]}ตลอด ไม่ตามเครื่อง · ธีม “${activeMeta.name}”`;

  return (
    <Screen title="ธีมและการแสดงผล" subtitle="โหมดสว่าง · มืด · ตามระบบ และชุดสีของแต่ละโหมด" variant="sub">
      <LiveSample name={activeMeta.name} mode={mode} />

      <Card style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Txt size={14} weight="bold">
            โหมด
          </Txt>
          <Txt size={11.5} color={t.faint}>
            เลือกว่าแอปจะสว่างหรือมืด
          </Txt>
        </View>
        <Segmented<ThemePref>
          options={[
            { key: 'light', label: 'สว่าง', icon: 'sun' },
            { key: 'dark', label: 'มืด', icon: 'moon' },
            { key: 'system', label: 'ตามระบบ' },
          ]}
          value={pref}
          onChange={setTheme}
        />
        <Txt size={12} color={t.sub} style={{ lineHeight: 18 }}>
          {modeNote}
        </Txt>
      </Card>

      <ThemeGroup
        title="ธีมโหมดสว่าง"
        where={pref === 'dark' ? 'ตอนนี้ใช้โหมดมืดอยู่ — แตะธีมเพื่อสลับมาโหมดสว่าง' : 'ใช้เมื่อแอปอยู่โหมดสว่าง'}
        inUse={mode === 'light'}
        list={LIGHT_THEMES}
        value={themeLight}
        onPick={(meta) => pick('light', meta)}
      />
      <ThemeGroup
        title="ธีมโหมดมืด"
        where={pref === 'light' ? 'ตอนนี้ใช้โหมดสว่างอยู่ — แตะธีมเพื่อสลับมาโหมดมืด' : 'ใช้เมื่อแอปอยู่โหมดมืด'}
        inUse={mode === 'dark'}
        list={DARK_THEMES}
        value={themeDark}
        onPick={(meta) => pick('dark', meta)}
      />

      <View style={{ gap: 10, paddingHorizontal: 2 }}>
        <Txt size={11.5} color={t.faint} style={{ lineHeight: 17 }}>
          สีหมวดกิจกรรม สีเขียว (ทำแล้ว · เวลาว่าง) และสีส้ม/แดง (ค้างบันทึก · ลบ) เหมือนกันทุกธีม เพื่อให้อ่านตารางได้เหมือนเดิม · ไฟล์ที่ส่งออกใช้ชุดสีของตัวเอง ไม่เปลี่ยนตามธีมแอป
        </Txt>
        {!isDefault ? (
          <Pressable accessibilityRole="button" onPress={reset} hitSlop={6} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: pressed ? t.rail : t.track })}>
            <Txt size={12.5} weight="bold" color={t.sub}>
              กลับเป็นธีมเดิม
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

/** ตัวอย่างสดของธีมที่ใช้อยู่ — ใช้ชิ้นส่วนจริง (วงสถานะ · เส้นตอนนี้ · ปุ่มหลัก) ให้เห็นว่าสีเน้นไปอยู่ตรงไหนบ้าง */
function LiveSample({ name, mode }: { name: string; mode: ThemeName }) {
  const t = useTokens();
  const days = ['จ', 'อ', 'พ', 'พฤ', 'ศ'];
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Txt size={14} weight="bold" style={{ flex: 1 }}>
          ใช้อยู่ตอนนี้ · {name}
        </Txt>
        <Txt size={11.5} color={t.faint}>
          โหมด{MODE_LABEL[mode]}
        </Txt>
      </View>
      <View
        accessible
        accessibilityLabel={`ตัวอย่างหน้าตาแอปในธีม ${name}`}
        style={{ borderRadius: 14, backgroundColor: t.bg, padding: 10, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {days.map((d, i) => {
            const today = i === 2;
            return (
              <View key={d} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: today ? t.accent : 'transparent', backgroundColor: today ? t.card : 'transparent' }}>
                <Txt size={11.5} weight={today ? 'bold' : 'med'} color={today ? t.ink : t.sub}>
                  {d}
                </Txt>
                <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: i < 2 ? GREEN : t.rail, overflow: 'hidden' }}>{today ? <View style={{ width: '45%', height: 3, backgroundColor: ATTN }} /> : null}</View>
              </View>
            );
          })}
        </View>
        <View style={{ backgroundColor: t.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 7 }}>
          <SampleRow state="done" title="ตื่นนอน · อาบน้ำ" time="06:30" cat="routine" />
          <SampleRow state="current" title="ประชุมทีม" time="09:00–10:00" cat="work" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: t.primary, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Txt size={10.5} num weight="bold" color="#FFFFFF">
                ตอนนี้ 09:20
              </Txt>
            </View>
            <View style={{ flex: 1, height: 1.5, backgroundColor: t.primary }} />
          </View>
          <SampleRow state="planned" title="โยคะ" time="18:00" cat="ex" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ height: 32, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.primary, justifyContent: 'center' }}>
            <Txt size={12.5} weight="bold" color="#FFFFFF">
              บันทึก
            </Txt>
          </View>
          <View style={{ height: 32, paddingHorizontal: 13, borderRadius: 16, backgroundColor: t.track, justifyContent: 'center' }}>
            <Txt size={12.5} weight="med" color={t.sub}>
              ยกเลิก
            </Txt>
          </View>
          <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: t.accent + '22', justifyContent: 'center' }}>
            <Txt size={12.5} weight="bold" color={t.accentInk}>
              ตัวเลือก
            </Txt>
          </View>
          <Txt size={12.5} weight="bold" color={t.accentInk} style={{ marginLeft: 'auto' }}>
            ดูทั้งหมด ›
          </Txt>
        </View>
      </View>
    </Card>
  );
}

function SampleRow({ state, title, time, cat }: { state: 'done' | 'current' | 'planned'; title: string; time: string; cat: 'routine' | 'work' | 'ex' }) {
  const t = useTokens();
  const done = state === 'done';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <StatusDot state={state} size={18} />
      <Txt size={13} weight={state === 'current' ? 'bold' : 'reg'} color={done ? t.muted : t.ink} numberOfLines={1} style={{ flexShrink: 1, textDecorationLine: done ? 'line-through' : 'none' }}>
        {title}
      </Txt>
      <Txt size={11.5} num color={t.sub} style={{ flex: 1 }}>
        {time}
      </Txt>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CAT_BY_ID[cat].color }} />
    </View>
  );
}

/** กลุ่มธีมของโหมดหนึ่ง — เลือกได้ 1 แบบ (radio) */
function ThemeGroup<K extends LightThemeId | DarkThemeId>({ title, where, inUse, list, value, onPick }: { title: string; where: string; inUse: boolean; list: ThemeMeta<K>[]; value: K; onPick: (meta: ThemeMeta<K>) => void }) {
  const t = useTokens();
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={14} weight="bold">
            {title}
          </Txt>
          <Txt size={11.5} color={t.faint}>
            {where}
          </Txt>
        </View>
        {inUse ? (
          <View style={{ paddingHorizontal: 9, height: 22, borderRadius: 11, justifyContent: 'center', backgroundColor: t.accent + '22' }}>
            <Txt size={11} weight="bold" color={t.accentInk}>
              ใช้อยู่ตอนนี้
            </Txt>
          </View>
        ) : null}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ gap: 8 }}>
        {list.map((meta) => (
          <ThemeRow key={meta.id} meta={meta} selected={meta.id === value} onPress={() => onPick(meta)} />
        ))}
      </View>
    </Card>
  );
}

function ThemeRow({ meta, selected, onPress }: { meta: ThemeMeta; selected: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`ธีม${meta.name} — ${meta.mood}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 8,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: selected ? t.accent : t.line,
        backgroundColor: selected ? t.accent + '12' : pressed ? t.track : t.card2,
      })}>
      <ThemeThumb p={THEME_PALETTES[meta.id]} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14.5} weight={selected ? 'bold' : 'med'} numberOfLines={1}>
          {meta.name}
        </Txt>
        <Txt size={12} color={t.sub} numberOfLines={2}>
          {meta.mood}
        </Txt>
      </View>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? t.primary : 'transparent', borderWidth: selected ? 0 : 1.5, borderColor: t.railDash }}>
        {selected ? <SvgIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
