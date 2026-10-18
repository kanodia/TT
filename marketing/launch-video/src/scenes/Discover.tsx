import {Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Mascot} from '../components/Mascot';
import {blinkAt, bob, ease, useSceneFade, useSpring} from '../components/motion';
import {colors, fontFamily, glass, t, tp} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// Real home-screen chips; each tap narrows the count.
const chips = [
  {key: 'filters.open_now', at: 40},
  {key: 'list.pureVeg', at: 70},
  {key: 'list.rating4', at: 100},
  {key: 'filters.cost.u300', at: 130},
] as const;
const counts = [28, 17, 12, 9, 6];

const rows = [
  {w: 0.78, c: '#ff9a3c', r: '4.5'},
  {w: 0.62, c: '#e23744', r: '4.3'},
  {w: 0.7, c: '#7cc242', r: '4.1'},
];

const DiscoverInner = () => {
  const frame = useCurrentFrame();
  const fade = useSceneFade(8, 8);
  const enter = useSpring(0, 14, 0.8);
  const active = chips.filter((c) => frame >= c.at).length;
  const n = counts[active];
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade, fontFamily, color: colors.cream}}>
      <div
        style={{
          ...glass,
          position: 'absolute',
          left: 260,
          top: 70,
          width: 640,
          height: 940,
          borderRadius: 64,
          padding: '48px 40px',
          translate: `0 ${(1 - enter) * 500}px`,
          rotate: `${(1 - enter) * 8}deg`,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 30, fontWeight: 600, color: colors.muted}}>
          <svg width="26" height="32" viewBox="0 0 24 30"><path d="M12 0C5.4 0 0 5.3 0 11.8 0 20.6 12 30 12 30s12-9.4 12-18.2C24 5.3 18.6 0 12 0zm0 16a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" fill={colors.brand} /></svg>
          Neem Ka Thana ▾
        </div>
        <div style={{fontSize: 50, fontWeight: 800, lineHeight: 1.1, marginTop: 18}}>{t('en', 'home.mood')}</div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 30}}>
          {chips.map((c, i) => {
            const on = ease(frame, c.at, 8);
            const tap = interpolate(frame, [c.at - 4, c.at, c.at + 6], [1, 0.9, 1], clamp);
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  padding: '10px 24px',
                  borderRadius: 999,
                  fontSize: 32,
                  fontWeight: 700,
                  border: `2px solid ${on > 0.5 ? colors.brand : 'rgba(255,255,255,0.3)'}`,
                  background: `rgba(226,55,68,${on})`,
                  scale: String(tap),
                }}
              >
                {t('en', c.key)}
                <div
                  style={{
                    position: 'absolute',
                    inset: -6,
                    borderRadius: 999,
                    border: `3px solid ${colors.cream}`,
                    opacity: interpolate(frame, [c.at, c.at + 14], [0.8, 0], clamp),
                    scale: String(interpolate(frame, [c.at, c.at + 14], [1, 1.25], clamp)),
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{marginTop: 34, fontSize: 36, fontWeight: 700}}>
          <span key={n} style={{color: colors.brand, display: 'inline-block', scale: String(interpolate(frame - (chips[active - 1]?.at ?? -99), [0, 6, 12], [1.4, 1.4, 1], clamp))}}>
            {n}
          </span>{' '}
          {tp('en', 'home.nearby', n).replace(String(n), '').trim()}
        </div>
        {rows.map((r, i) => {
          const shuffle = Math.sin((frame - (chips[active - 1]?.at ?? 0)) / 3 + i) * interpolate(frame - (chips[active - 1]?.at ?? -99), [0, 10], [12, 0], clamp);
          return (
            <div key={i} style={{display: 'flex', gap: 20, alignItems: 'center', marginTop: 24, translate: `${shuffle}px 0`}}>
              <div style={{width: 130, height: 110, borderRadius: 24, background: `linear-gradient(135deg, ${r.c}, #3a1a1a)`}} />
              <div style={{flex: 1}}>
                <div style={{height: 26, width: `${r.w * 100}%`, borderRadius: 12, background: 'rgba(255,255,255,0.75)'}} />
                <div style={{height: 20, width: '55%', borderRadius: 10, background: 'rgba(255,255,255,0.3)', marginTop: 14}} />
              </div>
              <div style={{background: colors.good, borderRadius: 12, padding: '2px 12px', fontSize: 28, fontWeight: 800}}>{r.r}</div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 40, top: 800, translate: `0 ${bob(frame, 6)}px`, opacity: ease(frame, 18, 12)}}>
        <Mascot size={190} smile={0.4 + active * 0.15} lookX={0.9} blink={blinkAt(frame, [55, 150])} />
      </div>
    </div>
  );
};

export const Discover = Interactive.create({Component: DiscoverInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
