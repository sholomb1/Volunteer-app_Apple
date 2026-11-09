/** Nov 5 client: "it lets you listen to more than one recording in one shot" — starting one recording
 * or voicemail pauses any other one that is playing. Use as onPlay={onlyThisAudio}. */
export function onlyThisAudio(e: { currentTarget: HTMLAudioElement }): void {
  const me = e.currentTarget;
  document.querySelectorAll('audio').forEach((a) => { if (a !== me && !a.paused) a.pause(); });
}
