import { createAudioPlayer, AudioPlayer } from 'expo-audio';

let player: AudioPlayer | null = null;

/** Soft stone-on-board sound. Failures (e.g. web autoplay policy) are ignored. */
export function playStone() {
  try {
    player ??= createAudioPlayer(require('../../assets/stone.wav'));
    player.volume = 0.6;
    player.seekTo(0);
    player.play();
  } catch {}
}
