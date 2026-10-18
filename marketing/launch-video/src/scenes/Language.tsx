import {Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Mascot} from '../components/Mascot';
import {ease, useSceneFade} from '../components/motion';
import {RestaurantCard} from '../components/RestaurantCard';
import {colors, fontFamily} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const Toggle = ({p}: {readonly p: number}) => (
  <div style={{position: 'relative', display: 'flex', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.25)', fontFamily, fontSize: 34, fontWeight: 800, color: colors.cream}}>
    <div style={{position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', borderRadius: 999, background: colors.brand, translate: `${p * 100}% 0`}} />
    <div style={{position: 'relative', padding: '6px 34px'}}>EN</div>
    <div style={{position: 'relative', padding: '6px 34px'}}>हिंदी</div>
  </div>
);

const LanguageInner = () => {
  const frame = useCurrentFrame();
  const fade = useSceneFade(1, 8);
  const toggle = ease(frame, 30, 12);
  const show = ease(frame, 4, 14);
  const wink = interpolate(frame, [100, 104, 116, 120], [0, 1, 1, 0], clamp);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 26}}>
      {/* Card continues from the Answer scene, then shrinks to make room for the toggle. */}
      <RestaurantCard reveal={() => 1} flip={(i) => ease(frame, 40 + i * 5, 12)} style={{scale: String(1 - 0.1 * show), translate: `0 ${show * 50}px`}} />
      <div style={{position: 'absolute', top: 34, display: 'flex', alignItems: 'center', gap: 24, opacity: show, translate: `0 ${(1 - show) * -30}px`}}>
        <Toggle p={toggle} />
        <Mascot size={96} smile={1} wink={wink} blush={0.9} style={{scale: String(0.6 + 0.4 * ease(frame, 60, 12))}} />
      </div>
    </div>
  );
};

export const Language = Interactive.create({Component: LanguageInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
