import type React from 'react';
import {loadFont} from '@remotion/google-fonts/Baloo2';
// The app's own strings and helpers, so every label on screen matches the product.
import {translate, plural, type Lang, type MessageKey} from '../../../packages/shared/src/i18n';

export const {fontFamily} = loadFont('normal', {
  weights: ['500', '600', '700', '800'],
  subsets: ['latin', 'devanagari'],
});

export const colors = {
  brand: '#e23744',
  leaf: '#7cc242',
  good: '#267e3e',
  bg: '#1a0f0f',
  cream: '#fff6ec',
  muted: 'rgba(255, 246, 236, 0.62)',
  ink: '#1c1c1c',
};

export const glass: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.13), rgba(255,255,255,0.04))',
  border: '1.5px solid rgba(255,255,255,0.2)',
  boxShadow: '0 0 90px rgba(226,55,68,0.32), inset 0 1px 0 rgba(255,255,255,0.25)',
  backdropFilter: 'blur(24px)',
  borderRadius: 36,
};

export const t = (lang: Lang, key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
export const tp = (lang: Lang, base: string, count: number) => plural(lang, base, count);
export type {Lang};

// Fictional listing used on screen (labelled "Sample listing" in the video).
export const sample = {
  name: {en: 'Tamatar Rasoi', hi: 'टमाटर रसोई'},
  rating: 4.3,
  cost: '₹250',
  closes: {en: '10:30 pm', hi: '10:30'},
  walk: 6,
  mustTry: {en: 'Dal Baati Churma', hi: 'दाल बाटी चूरमा'},
};
