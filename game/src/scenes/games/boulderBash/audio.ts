const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

// Pre-generated noise buffer for percussive sounds
const noiseBuffer = (() => {
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
})();

// Pool of reusable filter and gain nodes
type FilterNode = BiquadFilterNode;
type Gain = GainNode;
const poolSize = 4;
const filterPool: FilterNode[] = [];
const gainPool: Gain[] = [];
let nextFilterIndex = 0;
for (let i = 0; i < poolSize; i++) {
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1000;
  const gainNode = audioCtx.createGain();
  filter.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  filterPool.push(filter);
  gainPool.push(gainNode);
}

export function playPadSound(index: number, pitchShift: boolean = false) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  // Create noise source for drum-like sound
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  // reuse pooled filter and gain nodes
  const indexPool = nextFilterIndex;
  nextFilterIndex = (nextFilterIndex + 1) % poolSize;
  const filter = filterPool[indexPool];
  const gainNode = gainPool[indexPool];
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(1, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
  noiseSource.connect(filter);
  noiseSource.start(now);
  noiseSource.stop(now + 0.2);
  noiseSource.onended = () => {
    noiseSource.disconnect();
  };
}

export function playAlienPadSound(index: number, pitchShift: boolean = false) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;

  // Create oscillator for the laser tone
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth'; // sharp tone, you can try 'square' or 'triangle' too

  // Start frequency high, then sweep down fast
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);

  // Gain envelope for quick attack and decay
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.2, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(gainNode).connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.3);
}

export function playExplosionSound() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;

  // --- Low boom oscillator ---
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, now); // Deep bass
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  osc.connect(oscGain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.6);

  // --- White noise burst for explosion texture ---
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.4, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  noise.connect(noiseGain).connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.4);
}
