import type React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fontFamily} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0→1 eased progress over [start, start + dur]. */
export const ease = (frame: number, start: number, dur: number) =>
  interpolate(frame, [start, start + dur], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});

/** Bouncy 0→1 spring starting at `start`. */
export const useSpring = (start: number, damping = 11, mass = 0.7) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - start, fps, config: {damping, mass}});
};

/** Eyes closed (0..1) for a 6-frame blink at each listed frame. */
export const blinkAt = (frame: number, at: number[]) =>
  Math.max(0, ...at.map((b) => interpolate(frame, [b, b + 3, b + 6], [0, 1, 0], clamp)));

/** Gentle idle bob in px. */
export const bob = (frame: number, amp = 8, period = 50) => Math.sin((frame / period) * Math.PI * 2) * amp;

/** Scene-level fade so hard cuts between scenes soften. */
export const useSceneFade = (inDur = 8, outDur = 8) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return Math.min(
    interpolate(frame, [0, inDur], [0, 1], clamp),
    interpolate(frame, [durationInFrames - outDur, durationInFrames], [1, 0], clamp),
  );
};

/** Kinetic type: words spring up one after another. */
export const Words = ({
  text,
  start = 0,
  stagger = 4,
  size = 96,
  weight = 800,
  color = colors.cream,
  style,
}: {
  readonly text: string;
  readonly start?: number;
  readonly stagger?: number;
  readonly size?: number;
  readonly weight?: number;
  readonly color?: string;
  readonly style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div
      style={{
        fontFamily,
        fontSize: size,
        fontWeight: weight,
        color,
        lineHeight: 1.15,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: size * 0.26,
        textAlign: 'center',
        ...style,
      }}
    >
      {text.split(' ').map((w, i) => {
        const p = spring({frame: frame - start - i * stagger, fps, config: {damping: 12, mass: 0.6}});
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: interpolate(p, [0, 0.4], [0, 1], clamp),
              translate: `0 ${(1 - p) * size * 0.6}px`,
              scale: String(0.6 + 0.4 * p),
              filter: `blur(${(1 - Math.min(p, 1)) * 8}px)`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Soft warm background with drifting red and green glows. */
export const Glow = ({frame}: {readonly frame: number}) => {
  const dx = Math.sin(frame / 90) * 60;
  const dy = Math.cos(frame / 110) * 50;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(circle at ${22 + dx / 20}% ${18 + dy / 20}%, rgba(226,55,68,0.45), transparent 45%),
          radial-gradient(circle at ${82 - dx / 25}% ${86 - dy / 25}%, rgba(124,194,66,0.22), transparent 42%),
          radial-gradient(circle at 50% 50%, #2a1414, ${colors.bg} 70%)`,
      }}
    />
  );
};
