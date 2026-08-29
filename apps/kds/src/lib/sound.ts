// A short synthesized bell — no audio asset to ship, loud enough on a
// kitchen tablet to be noticed. Shared pattern with the restaurant app's
// "new order" chime, tuned differently so the two are distinguishable.
export function playReadyBell() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    [660, 990, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.001, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.35, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.13);
    });
  } catch {
    // Audio not available (e.g. autoplay policy) — non-critical, ignore.
  }
}
