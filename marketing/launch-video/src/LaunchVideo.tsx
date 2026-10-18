import {AbsoluteFill, Track, useCurrentFrame} from 'remotion';
import {Glow} from './components/motion';
import {Mascot} from './components/Mascot';
import {Answer} from './scenes/Answer';
import {Discover} from './scenes/Discover';
import {ComingSoon, EndCard} from './scenes/EndCard';
import {Hook} from './scenes/Hook';
import {Language} from './scenes/Language';
import {Questions} from './scenes/Questions';
import {Reveal, Wordmark} from './scenes/Reveal';
import {Towns} from './scenes/Towns';
import {colors, fontFamily, t} from './theme';

export const LaunchVideo = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: colors.bg}}>
      <Glow frame={frame} />
      <Track name="Scenes">
        <Hook name="Hook" durationInFrames={120} />
        <Questions name="Questions" from={120} durationInFrames={150} />
        <Reveal name="Reveal" from={270} durationInFrames={120} />
        <Discover name="Discover" from={390} durationInFrames={210} />
        <Answer name="Answer" from={600} durationInFrames={210} />
        <Language name="Language" from={810} durationInFrames={150} />
        <Towns name="Towns" from={960} durationInFrames={120} />
        <EndCard name="End card" from={1080} durationInFrames={120} />
      </Track>
    </AbsoluteFill>
  );
};

/** 1500×500 header banner, built from the end card. */
export const Banner = () => (
  <AbsoluteFill style={{backgroundColor: colors.bg}}>
    <Glow frame={0} />
    <AbsoluteFill style={{flexDirection: 'row', alignItems: 'center', padding: '0 110px', gap: 70}}>
      <Mascot size={290} smile={1} />
      <div style={{fontFamily, color: colors.cream}}>
        <Wordmark size={112} />
        <div style={{fontSize: 46, fontWeight: 700, marginTop: -6}}>Where to eat, decided in 2 minutes.</div>
        <div style={{fontSize: 38, fontWeight: 600, color: colors.muted}}>{t('hi', 'home.mood')}</div>
        <div style={{marginTop: 22}}>
          <ComingSoon />
        </div>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);
