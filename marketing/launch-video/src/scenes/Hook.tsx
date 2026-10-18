import {Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Mascot} from '../components/Mascot';
import {blinkAt, bob, ease, useSceneFade, useSpring, Words} from '../components/motion';
import {colors} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const HookInner = () => {
  const frame = useCurrentFrame();
  const fade = useSceneFade(1, 6);
  const drop = useSpring(2, 9, 0.8);
  // Squash on landing, then settle.
  const squash = interpolate(frame, [10, 14, 20, 26], [1.12, 0.72, 1.06, 1], clamp);
  const look = interpolate(frame, [48, 56, 66, 74, 84, 90], [0, -1, -1, 1, 1, 0], clamp);
  const smile = interpolate(frame, [0, 30, 90, 110], [0.2, 0.2, 0.9, 0.9], clamp);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 210}}>
      <div style={{translate: `0 ${(1 - drop) * -700 + (frame > 30 ? bob(frame - 30, 6) : 0)}px`}}>
        <Mascot size={330} squash={frame < 30 ? squash : 1} blink={blinkAt(frame, [38, 96])} lookX={look} smile={smile} leaf={Math.sin(frame / 6) * 8 * (1 - ease(frame, 20, 40))} />
      </div>
      <div style={{marginTop: 70}}>
        <Words text="भूख लगी है?" start={30} size={128} stagger={6} />
      </div>
      <div style={{marginTop: 18, opacity: ease(frame, 58, 10)}}>
        <Words text="Hungry in Neem Ka Thana?" start={58} size={64} weight={700} color={colors.muted} stagger={3} />
      </div>
    </div>
  );
};

export const Hook = Interactive.create({Component: HookInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
