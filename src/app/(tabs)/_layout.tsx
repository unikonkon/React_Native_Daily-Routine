// Routing 4 แท็บ — แถบแท็บย้ายขึ้นไปอยู่ใน header ของ Screen แล้ว (src/components/screen.tsx)
// ที่นี่เหลือแค่ประกาศ route + ซ่อนแถบล่างของ expo-router
import { Tabs } from 'expo-router';

import { TABS } from '@/components/screen';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      tabBar={() => null}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}
