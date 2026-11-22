// Tiny WebAudio sound effects for Sunken Vault: short oscillator blips, no audio
// files, no network. Everything is lazy (the context starts on the first user gesture)
// and guarded, so a browser without audio — or a headless run — simply stays silent.
// Every function is safe to call before any gesture and after a mute: it either
// plays or does nothing, and never throws. The ink burst is a low bubbly blurt,
// the pickup a bright coin chime.

function createAudio() {
  let context = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  }

  function tone(freq, dur, type, gain, when) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const start = ctx.currentTime + (when || 0);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  return {
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    click() {
      tone(660, 0.07, 'square', 0.05);
    },
    pickup() {
      tone(1046, 0.09, 'sine', 0.12);
      tone(1568, 0.12, 'sine', 0.1, 0.07);
    },
    spotted() {
      tone(220, 0.16, 'sawtooth', 0.1);
      tone(185, 0.2, 'sawtooth', 0.1, 0.1);
    },
    caught() {
      tone(160, 0.25, 'sawtooth', 0.14);
      tone(110, 0.35, 'sawtooth', 0.14, 0.15);
    },
    lockdown() {
      tone(440, 0.18, 'square', 0.09);
      tone(440, 0.18, 'square', 0.09, 0.22);
      tone(440, 0.3, 'square', 0.09, 0.44);
    },
    ink() {
      tone(320, 0.1, 'sine', 0.1);
      tone(240, 0.12, 'sine', 0.1, 0.07);
      tone(170, 0.16, 'sine', 0.1, 0.15);
      tone(120, 0.2, 'sine', 0.08, 0.26);
    },
    clear() {
      tone(523, 0.12, 'sine', 0.12);
      tone(659, 0.12, 'sine', 0.12, 0.1);
      tone(784, 0.2, 'sine', 0.12, 0.2);
    },
    win() {
      tone(523, 0.14, 'triangle', 0.12);
      tone(659, 0.14, 'triangle', 0.12, 0.12);
      tone(784, 0.14, 'triangle', 0.12, 0.24);
      tone(1046, 0.3, 'triangle', 0.14, 0.36);
    },
  };
}

export const audio = typeof window === 'undefined' ? null : createAudio();
