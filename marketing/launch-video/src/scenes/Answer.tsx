import {Interactive, interpolate, useCurrentFrame} from 'remotion';
import {ease, useSceneFade, useSpring} from '../components/motion';
import {RestaurantCard} from '../components/RestaurantCard';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const AnswerInner = () => {
  const frame = useCurrentFrame();
  const fade = useSceneFade(8, 1);
  const zoom = useSpring(0, 14, 0.8);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
      <RestaurantCard
        reveal={(i) => ease(frame, 18 + i * 16, 14)}
        pulse={interpolate(frame % 40, [0, 20, 40], [0, 1, 0]) * ease(frame, 140, 10)}
        style={{scale: String(0.4 + 0.6 * zoom), rotate: `${(1 - zoom) * -6}deg`, opacity: interpolate(zoom, [0, 0.3], [0, 1], clamp)}}
      />
    </div>
  );
};

export const Answer = Interactive.create({Component: AnswerInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
