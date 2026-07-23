// ไอคอนชุดเดียวทั้งแอป — Feather (เส้น stroke ใกล้เคียง prototype) + เสริมจาก MaterialCommunityIcons
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';

const FEATHER: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  sun: 'sun',
  briefcase: 'briefcase',
  users: 'users',
  book: 'book-open',
  moon: 'moon',
  calendar: 'calendar',
  plus: 'plus',
  bars: 'bar-chart-2',
  bars2: 'bar-chart',
  sliders: 'sliders',
  clock: 'clock',
  bell: 'bell',
  check: 'check',
  trash: 'trash-2',
  edit: 'edit-2',
  chevR: 'chevron-right',
  chevL: 'chevron-left',
  chevD: 'chevron-down',
  mappin: 'map-pin',
  video: 'video',
  repeat: 'repeat',
  x: 'x',
  arrowR: 'arrow-right',
  skip: 'skip-forward',
  restore: 'rotate-ccw',
  share: 'share',
  download: 'download',
  cloud: 'upload-cloud',
  user: 'user',
  grid: 'grid',
};

export function Icon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  if (name === 'dumbbell') return <MaterialCommunityIcons name="dumbbell" size={size} color={color} />;
  return <Feather name={FEATHER[name] ?? 'circle'} size={size} color={color} />;
}
