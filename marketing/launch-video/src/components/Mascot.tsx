import type React from 'react';
import {colors} from '../theme';

export type MascotProps = {
  readonly size?: number;
  /** 0 = eyes open, 1 = closed. */
  readonly blink?: number;
  /** Closes only the right eye (0..1). */
  readonly wink?: number;
  /** <1 squashes (wider, shorter), >1 stretches. Anchored at the bottom. */
  readonly squash?: number;
  /** -1 frown … 0 flat … 1 big smile. */
  readonly smile?: number;
  /** Pupils look left (-1) to right (1). */
  readonly lookX?: number;
  /** Leaf rotation in degrees. */
  readonly leaf?: number;
  /** Rosy cheeks opacity. */
  readonly blush?: number;
  readonly style?: React.CSSProperties;
};

/**
 * "Tamatar": the TwiggyTomato app icon (apps/web/public/icon.svg) rigged with a face.
 * Same 64×64 geometry: red tile, white tomato, green leaf.
 */
export const Mascot = ({
  size = 300,
  blink = 0,
  wink = 0,
  squash = 1,
  smile = 0.6,
  lookX = 0,
  leaf = 0,
  blush = 0.7,
  style,
}: MascotProps) => {
  const eyeRy = (closed: number) => Math.max(0.25, 2.6 * (1 - closed));
  const px = lookX * 1.1;
  const mouthY = 41.5;
  const curve = smile * 4.5;
  return (
    <div
      style={{
        width: size,
        height: size,
        transform: `scale(${1 / Math.sqrt(squash)}, ${squash})`,
        transformOrigin: '50% 100%',
        filter: 'drop-shadow(0 24px 50px rgba(226,55,68,0.55))',
        ...style,
      }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <rect width="64" height="64" rx="14" fill={colors.brand} />
        <rect width="64" height="30" rx="14" fill="rgba(255,255,255,0.12)" />
        <circle cx="32" cy="36" r="16" fill="#fff" />
        <g transform={`rotate(${leaf} 33 20)`}>
          <path d="M32 20c2-6 8-8 12-7-3 3-6 5-12 7z" fill={colors.leaf} />
        </g>
        {/* cheeks */}
        <ellipse cx="23.5" cy="40" rx="2.6" ry="1.6" fill="#ff8a8a" opacity={blush} />
        <ellipse cx="40.5" cy="40" rx="2.6" ry="1.6" fill="#ff8a8a" opacity={blush} />
        {/* eyes */}
        <ellipse cx={26.5 + px} cy="34" rx="2.1" ry={eyeRy(blink)} fill={colors.ink} />
        <ellipse cx={37.5 + px} cy="34" rx="2.1" ry={eyeRy(Math.max(blink, wink))} fill={colors.ink} />
        {blink < 0.5 && (
          <>
            <circle cx={27.2 + px} cy="33" r="0.7" fill="#fff" />
            <circle cx={38.2 + px} cy="33" r={wink > 0.5 ? 0 : 0.7} fill="#fff" />
          </>
        )}
        {/* mouth, centred under the eyes */}
        <path
          d={`M${28 + px * 0.4} ${mouthY - curve * 0.15} Q ${32 + px * 0.4} ${mouthY + curve} ${36 + px * 0.4} ${mouthY - curve * 0.15}`}
          stroke={colors.ink}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
};
