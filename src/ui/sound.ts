import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

let player: AudioPlayer | null = null;

const ignore = () => {};

/** Soft stone-on-board sound. Failures (e.g. web autoplay policy) are ignored. */
export function playStone() {
  try {
    // (require() is how bundlers import an asset)
    player ??= createAudioPlayer(require('../../assets/stone.wav'));
    player.volume = 0.6;
    // seekTo is async; a rejection can't be caught by this try/catch
    player.seekTo(0).catch(ignore);
    player.play();
  } catch {
    // no audio available: the game works fine silently
  }
}
