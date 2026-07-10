// Tab bar 4 แท็บแบบกระจกฝ้า (APP_STRUCTURE.md §1)
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// โครง props ขั้นต่ำที่ tab bar ใช้ (เลี่ยง dependency ตรงกับ @react-navigation/bottom-tabs)
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

import { Icon } from '@/components/icon';
import { TABBAR_H } from '@/components/screen';
import { Txt, useTokens } from '@/components/ui';
import { ACCENT } from '@/constants/theme';
import { useSettings } from '@/stores/settings';

const TABS = [
  { name: 'index', label: 'วันนี้', icon: 'calendar' },
  { name: 'add', label: 'เพิ่ม', icon: 'plus' },
  { name: 'summary', label: 'สรุป', icon: 'bars' },
  { name: 'settings', label: 'ตั้งค่า', icon: 'sliders' },
];

function TabBar({ state, navigation }: TabBarProps) {
  const t = useTokens();
  const theme = useSettings((s) => s.theme);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <BlurView
        intensity={40}
        tint={theme === 'dark' ? 'dark' : 'light'}
        style={{
          height: TABBAR_H + insets.bottom,
          backgroundColor: t.glass,
          borderTopWidth: 1,
          borderTopColor: t.line,
          flexDirection: 'row',
          paddingBottom: insets.bottom,
        }}>
        {TABS.map((tab, i) => {
          const active = state.index === i;
          const color = active ? ACCENT : t.faint;
          return (
            <Pressable
              key={tab.name}
              onPress={() => navigation.navigate(state.routes[i].name)}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <Icon name={tab.icon} size={22} color={color} />
              <Txt size={11} weight={active ? 'bold' : 'med'} color={color}>
                {tab.label}
              </Txt>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar state={p.state} navigation={p.navigation} />}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}
