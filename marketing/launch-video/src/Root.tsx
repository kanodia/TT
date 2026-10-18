import {Composition, Folder, Still} from 'remotion';
import {Banner, LaunchVideo} from './LaunchVideo';
import {Answer} from './scenes/Answer';
import {Discover} from './scenes/Discover';
import {EndCard} from './scenes/EndCard';
import {Hook} from './scenes/Hook';
import {Language} from './scenes/Language';
import {Questions} from './scenes/Questions';
import {Reveal} from './scenes/Reveal';
import {Towns} from './scenes/Towns';

export const RemotionRoot = () => (
  <>
    <Composition id="LaunchVideo" component={LaunchVideo} width={1080} height={1080} fps={30} durationInFrames={1200} />
    <Still id="Banner" component={Banner} width={1500} height={500} />
    <Folder name="Scenes">
      <Composition id="Hook" component={Hook} width={1080} height={1080} fps={30} durationInFrames={120} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
      <Composition id="Questions" component={Questions} width={1080} height={1080} fps={30} durationInFrames={150} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
      <Composition id="Reveal" component={Reveal} width={1080} height={1080} fps={30} durationInFrames={120} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
      <Composition id="Discover" component={Discover} width={1080} height={1080} fps={30} durationInFrames={210} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
      <Composition id="Answer" component={Answer} width={1080} height={1080} fps={30} durationInFrames={210} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
      <Composition id="Language" component={Language} width={1080} height={1080} fps={30} durationInFrames={150} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
      <Composition id="Towns" component={Towns} width={1080} height={1080} fps={30} durationInFrames={120} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
      <Composition id="EndCard" component={EndCard} width={1080} height={1080} fps={30} durationInFrames={120} defaultProps={{style: {backgroundColor: '#1a0f0f'}}} />
    </Folder>
  </>
);
