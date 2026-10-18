import {Interactive, interpolate, useCurrentFrame} from 'remotion';
import {ease, useSceneFade, Words} from '../components/motion';
import {colors, fontFamily} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// Coordinates from the seed (apps/api/prisma/seed.ts), projected north-up.
const project = (lat: number, lng: number) => ({x: 140 + ((lng - 75.45) / 0.9) * 800, y: 960 - ((lat - 27.35) / 0.75) * 660});
const home = {en: 'Neem Ka Thana', hi: 'नीम का थाना', ...project(27.735, 75.78)};
const towns = [
  {en: 'Khetri', hi: 'खेतड़ी', ...project(28.0, 75.79)},
  {en: 'Patan', hi: 'पाटन', ...project(27.8, 75.98)},
  {en: 'Kotputli', hi: 'कोटपूतली', ...project(27.7, 76.2)},
  {en: 'Shrimadhopur', hi: 'श्रीमाधोपुर', ...project(27.47, 75.6)},
];

const Label = ({en, hi, big, below, p}: {readonly en: string; readonly hi: string; readonly big?: boolean; readonly below?: boolean; readonly p: number}) => (
  <div style={{position: 'absolute', left: '50%', ...(big ? {top: 44} : below ? {top: 26} : {bottom: 30}), translate: `-50% ${(1 - p) * 20}px`, opacity: p, whiteSpace: 'nowrap', textAlign: 'center', fontFamily, color: colors.cream}}>
    <div style={{fontSize: big ? 50 : 36, fontWeight: 800, lineHeight: 1}}>{en}</div>
    <div style={{fontSize: big ? 34 : 26, fontWeight: 600, color: colors.muted}}>{hi}</div>
  </div>
);

const TownsInner = () => {
  const frame = useCurrentFrame();
  const fade = useSceneFade(8, 8);
  const homeP = ease(frame, 8, 14);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade}}>
      {/* faint map grid */}
      <svg width="1080" height="1080" style={{position: 'absolute', inset: 0, opacity: 0.18}}>
        {Array.from({length: 12}, (_, i) => (
          <g key={i} stroke="#fff" strokeWidth="1">
            <line x1={i * 100} y1="0" x2={i * 100} y2="1080" />
            <line x1="0" y1={i * 100} x2="1080" y2={i * 100} />
          </g>
        ))}
      </svg>
      <svg width="1080" height="1080" style={{position: 'absolute', inset: 0}}>
        {towns.map((tw, i) => {
          const p = ease(frame, 30 + i * 12, 16);
          const len = Math.hypot(tw.x - home.x, tw.y - home.y);
          return (
            <line key={i} x1={home.x} y1={home.y} x2={tw.x} y2={tw.y} stroke={colors.brand} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${len}`} strokeDashoffset={len * (1 - p)} opacity={0.7} />
          );
        })}
      </svg>
      {towns.map((tw, i) => {
        const p = ease(frame, 40 + i * 12, 12);
        return (
          <div key={i} style={{position: 'absolute', left: tw.x, top: tw.y}}>
            <div style={{position: 'absolute', left: -14, top: -14, width: 28, height: 28, borderRadius: 99, background: colors.leaf, scale: String(p), boxShadow: `0 0 30px ${colors.leaf}`}} />
            <Label en={tw.en} hi={tw.hi} p={p} below={tw.en === 'Shrimadhopur'} />
          </div>
        );
      })}
      <div style={{position: 'absolute', left: home.x, top: home.y}}>
        {[0, 1].map((k) => {
          const r = interpolate((frame + k * 25) % 50, [0, 50], [0, 1], clamp);
          return <div key={k} style={{position: 'absolute', left: -60, top: -60, width: 120, height: 120, borderRadius: 999, border: `4px solid ${colors.brand}`, scale: String(0.3 + r), opacity: (1 - r) * homeP}} />;
        })}
        <div style={{position: 'absolute', left: -24, top: -24, width: 48, height: 48, borderRadius: 99, background: colors.brand, border: '6px solid #fff', scale: String(homeP), boxShadow: `0 0 50px ${colors.brand}`}} />
        <Label en={home.en} hi={home.hi} big p={homeP} />
      </div>
      <div style={{position: 'absolute', top: 90, left: 0, right: 0}}>
        <Words text="Starting in Neem Ka Thana" start={4} size={76} stagger={3} />
        <Words text="and nearby towns" start={36} size={52} weight={600} color={colors.muted} stagger={3} style={{marginTop: 4}} />
      </div>
    </div>
  );
};

export const Towns = Interactive.create({Component: TownsInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
