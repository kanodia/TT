import {Interactive, interpolate, useCurrentFrame, useVideoConfig, spring} from 'remotion';
import {Mascot} from '../components/Mascot';
import {blinkAt, useSceneFade, Words} from '../components/motion';
import {colors, fontFamily, glass} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// The spec's core decision questions: open now, how much, how good, how far, what food.
const bubbles = [
  {en: 'Open now?', hi: 'अभी खुला है?', x: 90, y: 300, rot: -6},
  {en: 'How much?', hi: 'कितने का?', x: 640, y: 270, rot: 5},
  {en: 'Any good?', hi: 'अच्छा है?', x: 60, y: 560, rot: 4},
  {en: 'How far?', hi: 'कितनी दूर?', x: 700, y: 540, rot: -5},
  {en: 'Pure veg?', hi: 'शुद्ध शाकाहारी?', x: 330, y: 400, rot: -2},
];

const QuestionsInner = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = useSceneFade(6, 1);
  // Bubbles crowd in on Tamatar near the end.
  const crowd = interpolate(frame, [95, 140], [0, 1], {...clamp});
  const squash = interpolate(frame, [100, 140], [1, 0.78], clamp);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade}}>
      <div style={{position: 'absolute', top: 110, left: 0, right: 0}}>
        <Words text="कहाँ खाएँ?" start={2} size={110} stagger={5} />
      </div>
      {bubbles.map((b, i) => {
        const p = spring({frame: frame - 18 - i * 12, fps, config: {damping: 10, mass: 0.6}});
        const tx = (540 - 170 - b.x) * crowd * 0.45;
        const ty = (720 - b.y) * crowd * 0.35 + Math.sin((frame + i * 20) / 14) * 6;
        return (
          <div
            key={i}
            style={{
              ...glass,
              position: 'absolute',
              left: b.x,
              top: b.y,
              padding: '18px 34px',
              borderRadius: 40,
              fontFamily,
              color: colors.cream,
              scale: String(p),
              rotate: `${b.rot}deg`,
              translate: `${tx}px ${ty}px`,
              opacity: Math.min(1, p),
            }}
          >
            <div style={{fontSize: 52, fontWeight: 800, lineHeight: 1.1}}>{b.en}</div>
            <div style={{fontSize: 36, fontWeight: 600, color: colors.muted}}>{b.hi}</div>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 540 - 130, top: 690}}>
        <Mascot
          size={260}
          squash={squash}
          smile={interpolate(frame, [0, 30], [0.2, -0.7], clamp)}
          lookX={Math.sin(frame / 9) * 0.9}
          blink={blinkAt(frame, [60])}
          blush={0.3}
          style={{rotate: `${Math.sin(frame / 7) * 4}deg`}}
        />
      </div>
    </div>
  );
};

export const Questions = Interactive.create({Component: QuestionsInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
