import {Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Mascot} from '../components/Mascot';
import {blinkAt, ease, useSceneFade, useSpring, Words} from '../components/motion';
import {colors, fontFamily} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const Wordmark = ({size = 120, p = 1}: {readonly size?: number; readonly p?: number}) => {
  const letters = 'TwiggyTomato'.split('');
  return (
    <div style={{fontFamily, fontSize: size, fontWeight: 800, letterSpacing: -2, display: 'flex'}}>
      {letters.map((l, i) => {
        const q = Math.min(1, Math.max(0, p * letters.length * 1.4 - i));
        return (
          <span key={i} style={{color: i < 6 ? colors.cream : colors.brand, opacity: q, translate: `0 ${(1 - q) * 40}px`, display: 'inline-block'}}>
            {l}
          </span>
        );
      })}
    </div>
  );
};

const RevealInner = () => {
  const frame = useCurrentFrame();
  const fade = useSceneFade(1, 8);
  const pop = useSpring(0, 8, 0.7);
  const stretch = interpolate(frame, [0, 6, 14, 22], [0.7, 1.2, 0.94, 1], clamp);
  const ring = ease(frame, 0, 30);
  // Mascot slides left to make room for the wordmark.
  const slide = ease(frame, 26, 22);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade}}>
      <div
        style={{
          position: 'absolute',
          left: 540 - 400,
          top: 400 - 400,
          width: 800,
          height: 800,
          borderRadius: '50%',
          border: `6px solid ${colors.brand}`,
          scale: String(0.3 + ring * 1.4),
          opacity: 1 - ring,
        }}
      />
      <div style={{position: 'absolute', left: 540 - 140 - slide * 380, top: 260 + slide * 40, scale: String(pop * (1 - slide * 0.35))}}>
        <Mascot size={280} squash={stretch} smile={1} blink={blinkAt(frame, [70])} leaf={Math.sin(frame / 4) * 10 * (1 - ring)} />
      </div>
      <div style={{position: 'absolute', left: 290, top: 362, opacity: slide}}>
        <Wordmark size={100} p={ease(frame, 34, 30)} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 640}}>
        <Words text="Where to eat, decided in 2 minutes." start={62} size={64} weight={700} stagger={3} />
        <Words text="कहाँ खाएँ? 2 मिनट में तय।" start={78} size={52} weight={600} color={colors.muted} stagger={3} style={{marginTop: 16}} />
      </div>
    </div>
  );
};

export const Reveal = Interactive.create({Component: RevealInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
