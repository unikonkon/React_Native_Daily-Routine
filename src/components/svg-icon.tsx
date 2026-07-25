// ไอคอน SVG (react-native-svg) สไตล์เส้น (Feather) — วาดเองไม่พึ่งฟอนต์ไอคอน
// ใช้กับแผ่นรายละเอียดเคส (activity-sheet) ให้ไอคอนทั้งหมดเป็น SVG ล้วน
import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

interface StrokeProps {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
}

const ICONS: Record<string, (p: StrokeProps) => React.ReactNode> = {
  // ---------- หมวดกิจกรรม ----------
  sun: (p) => (
    <>
      <Circle cx={12} cy={12} r={5} {...p} />
      <Line x1={12} y1={1} x2={12} y2={3} {...p} />
      <Line x1={12} y1={21} x2={12} y2={23} {...p} />
      <Line x1={4.22} y1={4.22} x2={5.64} y2={5.64} {...p} />
      <Line x1={18.36} y1={18.36} x2={19.78} y2={19.78} {...p} />
      <Line x1={1} y1={12} x2={3} y2={12} {...p} />
      <Line x1={21} y1={12} x2={23} y2={12} {...p} />
      <Line x1={4.22} y1={19.78} x2={5.64} y2={18.36} {...p} />
      <Line x1={18.36} y1={5.64} x2={19.78} y2={4.22} {...p} />
    </>
  ),
  briefcase: (p) => (
    <>
      <Rect x={2} y={7} width={20} height={14} rx={2} ry={2} {...p} />
      <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" {...p} />
    </>
  ),
  dumbbell: (p) => (
    <>
      <Line x1={9} y1={12} x2={15} y2={12} {...p} />
      <Rect x={2.5} y={8} width={2.5} height={8} rx={1} {...p} />
      <Rect x={5.5} y={9.5} width={2.5} height={5} rx={1} {...p} />
      <Rect x={16} y={9.5} width={2.5} height={5} rx={1} {...p} />
      <Rect x={19} y={8} width={2.5} height={8} rx={1} {...p} />
    </>
  ),
  book: (p) => (
    <>
      <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" {...p} />
      <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" {...p} />
    </>
  ),
  moon: (p) => <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...p} />,

  // ---------- การกระทำ / ทั่วไป ----------
  check: (p) => <Polyline points="20 6 9 17 4 12" {...p} />,
  x: (p) => (
    <>
      <Line x1={18} y1={6} x2={6} y2={18} {...p} />
      <Line x1={6} y1={6} x2={18} y2={18} {...p} />
    </>
  ),
  edit: (p) => <Path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" {...p} />,
  trash: (p) => (
    <>
      <Polyline points="3 6 5 6 21 6" {...p} />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...p} />
      <Line x1={10} y1={11} x2={10} y2={17} {...p} />
      <Line x1={14} y1={11} x2={14} y2={17} {...p} />
    </>
  ),
  restore: (p) => (
    <>
      <Polyline points="1 4 1 10 7 10" {...p} />
      <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" {...p} />
    </>
  ),
  skip: (p) => (
    <>
      <Polygon points="5 4 15 12 5 20 5 4" {...p} />
      <Line x1={19} y1={5} x2={19} y2={19} {...p} />
    </>
  ),
  user: (p) => (
    <>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...p} />
      <Circle cx={12} cy={7} r={4} {...p} />
    </>
  ),
  users: (p) => (
    <>
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" {...p} />
      <Circle cx={9} cy={7} r={4} {...p} />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" {...p} />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...p} />
    </>
  ),
  copy: (p) => (
    <>
      <Rect x={9} y={9} width={13} height={13} rx={2} ry={2} {...p} />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" {...p} />
    </>
  ),
  extLink: (p) => (
    <>
      <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" {...p} />
      <Polyline points="15 3 21 3 21 9" {...p} />
      <Line x1={10} y1={14} x2={21} y2={3} {...p} />
    </>
  ),
  clipboard: (p) => (
    <>
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" {...p} />
      <Rect x={8} y={2} width={8} height={4} rx={1} ry={1} {...p} />
    </>
  ),

  // ---------- ช่องทางติดต่อ (แทน emoji) ----------
  phone: (p) => (
    <Path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
      {...p}
    />
  ),
  line: (p) => (
    <Path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
      {...p}
    />
  ),
  mail: (p) => (
    <>
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" {...p} />
      <Polyline points="22,6 12,13 2,6" {...p} />
    </>
  ),
  video: (p) => (
    <>
      <Path d="M23 7l-7 5 7 5V7z" {...p} />
      <Rect x={1} y={5} width={15} height={14} rx={2} ry={2} {...p} />
    </>
  ),
  mappin: (p) => (
    <>
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" {...p} />
      <Circle cx={12} cy={10} r={3} {...p} />
    </>
  ),
  note: (p) => (
    <>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...p} />
      <Polyline points="14 2 14 8 20 8" {...p} />
      <Line x1={16} y1={13} x2={8} y2={13} {...p} />
      <Line x1={16} y1={17} x2={8} y2={17} {...p} />
      <Polyline points="10 9 9 9 8 9" {...p} />
    </>
  ),
};

export function SvgIcon({ name, size = 20, color, strokeWidth = 2 }: { name: string; size?: number; color: string; strokeWidth?: number }) {
  const p: StrokeProps = { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  const render = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {render ? render(p) : null}
    </Svg>
  );
}
