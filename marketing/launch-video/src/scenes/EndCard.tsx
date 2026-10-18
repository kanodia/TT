import {Interactive, useCurrentFrame} from 'remotion';
import {Mascot} from '../components/Mascot';
import {blinkAt, bob, ease, useSceneFade, useSpring, Words} from '../components/motion';
import {colors, fontFamily, t} from '../theme';
import {Wordmark} from './Reveal';

export const ComingSoon = ({p = 1}: {readonly p?: number}) => (
  <div style={{display: 'inline-flex', alignItems: 'center', gap: 14, padding: '12px 32px', borderRadius: 999, background: colors.brand, fontFamily, fontSize: 40, fontWeight: 800, color: '#fff', scale: String(p), boxShadow: '0 0 60px rgba(226,55,68,0.6)'}}>
    Coming soon · Neem Ka Thana
  </div>
);

const EndCardInner = () => {
  const frame = useCurrentFrame();
  const fade = useSceneFade(8, 1);
  const drop = useSpring(0, 9, 0.7);
  const pill = useSpring(52, 10, 0.6);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 110}}>
      <div style={{scale: String(drop), translate: `0 ${bob(frame, 6)}px`}}>
        <Mascot size={230} smile={1} blink={blinkAt(frame, [80])} leaf={Math.sin(frame / 8) * 6} />
      </div>
      <div style={{marginTop: 30}}>
        <Wordmark size={110} p={ease(frame, 10, 26)} />
      </div>
      <Words text={t('hi', 'home.mood')} start={30} size={68} stagger={3} style={{marginTop: 10}} />
      <div style={{marginTop: 40}}>
        <ComingSoon p={pill} />
      </div>
      <div style={{position: 'absolute', bottom: 90, left: 80, right: 80, textAlign: 'center', fontFamily, fontSize: 32, fontWeight: 600, color: colors.muted, opacity: ease(frame, 66, 14)}}>
        {t('en', 'home.ownerTitle')} <span style={{color: colors.leaf}}>List it free.</span>
      </div>
    </div>
  );
};

export const EndCard = Interactive.create({Component: EndCardInner, layout: 'absolute-fill', schema: {...Interactive.backgroundSchema}});
