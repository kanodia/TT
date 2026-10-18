import type React from 'react';
import {colors, fontFamily, glass, sample, t, type Lang} from '../theme';

/** Flips between the English and Hindi version of a label as p goes 0 → 1. */
const Flip = ({p, en, hi, style}: {readonly p: number; readonly en: React.ReactNode; readonly hi: React.ReactNode; readonly style?: React.CSSProperties}) => (
  <span style={{display: 'inline-block', transform: `perspective(600px) rotateX(${p < 0.5 ? p * 180 : (p - 1) * 180}deg)`, ...style}}>
    {p < 0.5 ? en : hi}
  </span>
);

const Check = ({p}: {readonly p: number}) => (
  <svg width="40" height="40" viewBox="0 0 40 40" style={{flexShrink: 0, scale: String(p)}}>
    <circle cx="20" cy="20" r="18" fill={colors.good} />
    <path d="M12 20.5l5.5 5.5L28.5 14" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="30" strokeDashoffset={30 * (1 - p)} />
  </svg>
);

type Props = {
  /** Reveal progress (0..1) for each of the 7 parts: header, 4 facts, must-try, buttons. */
  readonly reveal: (i: number) => number;
  /** Language flip progress (0 = English, 1 = Hindi) for each part. */
  readonly flip?: (i: number) => number;
  /** 0..1 pulse on the action buttons. */
  readonly pulse?: number;
  readonly style?: React.CSSProperties;
};

export const RestaurantCard = ({reveal, flip = () => 0, pulse = 0, style}: Props) => {
  const L = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => ({
    en: t('en', key, vars),
    hi: t('hi', key, vars),
  });
  const facts: {label: {en: string; hi: string}; tone?: string}[] = [
    {label: L('card.forTwo', {cost: sample.cost})},
    {label: {en: t('en', 'open.closesAt', {time: sample.closes.en}), hi: t('hi', 'open.closesAt', {time: sample.closes.hi})}, tone: '#7ee29a'},
    {label: L('detail.walk', {n: sample.walk})},
    {label: L('card.verified')},
  ];
  const part = (i: number): React.CSSProperties => {
    const p = reveal(i);
    return {opacity: Math.min(1, p * 1.5), translate: `${(1 - p) * -40}px 0`};
  };
  const directions = L('detail.directions');
  const call = L('detail.call');
  const mustTry = L('detail.mustTry');

  return (
    <div style={{...glass, width: 860, overflow: 'hidden', fontFamily, color: colors.cream, ...style}}>
      {/* Cover: no real photo for a sample listing, so an illustrated banner. */}
      <div
        style={{
          height: 230,
          position: 'relative',
          background: 'linear-gradient(120deg, #ff9a3c 0%, #e23744 60%, #a3162a 100%)',
          overflow: 'hidden',
        }}
      >
        <div style={{position: 'absolute', right: -20, bottom: -70, fontSize: 230, fontWeight: 800, color: 'rgba(255,255,255,0.16)', whiteSpace: 'nowrap'}}>
          दाल बाटी
        </div>
        <div style={{position: 'absolute', top: 26, left: 30, padding: '6px 18px', borderRadius: 999, background: 'rgba(0,0,0,0.35)', fontSize: 26, fontWeight: 600}}>
          Sample listing
        </div>
      </div>
      <div style={{padding: '30px 44px 40px'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...part(0)}}>
          <div>
            <Flip p={flip(0)} en={sample.name.en} hi={sample.name.hi} style={{fontSize: 64, fontWeight: 800, lineHeight: 1.1}} />
            <div style={{fontSize: 32, color: colors.muted}}>
              <Flip p={flip(0)} en="Neem Ka Thana" hi="नीम का थाना" />
            </div>
          </div>
          <div style={{background: colors.good, borderRadius: 16, padding: '6px 18px', fontSize: 44, fontWeight: 800}}>
            {sample.rating} ★
          </div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: '22px 24px', marginTop: 30}}>
          {facts.map((f, i) => (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 34, whiteSpace: 'nowrap', fontWeight: 600, color: f.tone ?? colors.cream, ...part(i + 1)}}>
              <Check p={Math.min(1, reveal(i + 1) * 1.2)} />
              <Flip p={flip(i + 1)} en={f.label.en} hi={f.label.hi} />
            </div>
          ))}
        </div>
        <div style={{marginTop: 30, padding: '16px 24px', borderRadius: 22, background: 'rgba(124,194,66,0.16)', border: '1.5px solid rgba(124,194,66,0.45)', fontSize: 36, ...part(5)}}>
          <Flip
            p={flip(5)}
            en={<><b style={{color: colors.leaf}}>{mustTry.en}:</b> {sample.mustTry.en}</>}
            hi={<><b style={{color: colors.leaf}}>{mustTry.hi}:</b> {sample.mustTry.hi}</>}
          />
        </div>
        <div style={{display: 'flex', gap: 22, marginTop: 30, ...part(6)}}>
          {[directions, call].map((b, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '16px 0',
                borderRadius: 999,
                fontSize: 38,
                fontWeight: 700,
                background: i === 0 ? colors.brand : 'transparent',
                border: `2px solid ${i === 0 ? colors.brand : 'rgba(255,255,255,0.4)'}`,
                scale: String(1 + 0.05 * Math.sin(pulse * Math.PI) * (i === 0 ? 1 : 0.6)),
                boxShadow: i === 0 ? `0 0 ${30 + 40 * pulse}px rgba(226,55,68,0.7)` : undefined,
              }}
            >
              <Flip p={flip(6)} en={b.en} hi={b.hi} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
