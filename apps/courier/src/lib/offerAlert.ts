interface OfferAlertDependencies {
  primeAudio: () => Promise<boolean>;
  ring: () => void;
  setRepeating: (fn: () => void, intervalMs: number) => number;
  clearRepeating: (id: number) => void;
  vibrate?: () => void;
  stopVibration?: () => void;
}

export function createOfferAlertController(deps: OfferAlertDependencies) {
  let ready = false;
  let timerId: number | null = null;

  const pulse = () => {
    deps.ring();
    deps.vibrate?.();
  };

  return {
    async prime() {
      ready = await deps.primeAudio();
      return ready;
    },
    isReady() {
      return ready;
    },
    isRunning() {
      return timerId !== null;
    },
    start() {
      if (!ready) return false;
      if (timerId !== null) return true;
      pulse();
      timerId = deps.setRepeating(pulse, 1200);
      return true;
    },
    stop() {
      if (timerId !== null) {
        deps.clearRepeating(timerId);
        timerId = null;
      }
      deps.stopVibration?.();
    },
  };
}

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

async function primeBrowserAudio() {
  const context = getAudioContext();
  if (!context) return false;

  const resumePromise = context.state === "suspended" ? context.resume() : Promise.resolve();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + 0.03);

  try {
    await resumePromise;
    return context.state === "running";
  } catch {
    return false;
  }
}

function playTone(context: AudioContext, frequency: number, startAt: number, duration: number, gainValue: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function ringBrowserAlert() {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  playTone(context, 880, now, 0.22, 0.28);
  playTone(context, 1175, now + 0.28, 0.24, 0.3);
}

function vibrateBrowser() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate([320, 120, 320]);
  }
}

function stopBrowserVibration() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(0);
  }
}

const browserController = createOfferAlertController({
  primeAudio: primeBrowserAudio,
  ring: ringBrowserAlert,
  setRepeating: (fn, intervalMs) => window.setInterval(fn, intervalMs),
  clearRepeating: (id) => window.clearInterval(id),
  vibrate: vibrateBrowser,
  stopVibration: stopBrowserVibration,
});

export function primeOfferAlert() {
  return browserController.prime();
}

export function isOfferAlertReady() {
  return browserController.isReady();
}

export function startOfferAlert() {
  return browserController.start();
}

export function stopOfferAlert() {
  browserController.stop();
}
