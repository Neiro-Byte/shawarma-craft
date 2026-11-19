import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

// Exercise scheduling and lifecycle against the real module without an audio device.
// A future stop(time) schedules completion, it does not disconnect a node immediately.
const sources = [];
const listeners = new Map();
let timestamp = 1000;
let contexts = 0;
let buffers = 0;
let resumes = 0;
let currentContext;

function parameter() {
  return {
    value: 0,
    events: [],
    setValueAtTime(value, at) { this.events.push(['set', value, at]); },
    linearRampToValueAtTime(value, at) { this.events.push(['linear', value, at]); },
    exponentialRampToValueAtTime(value, at) { this.events.push(['exponential', value, at]); },
    setTargetAtTime(value, at, duration) { this.events.push(['target', value, at, duration]); },
    cancelScheduledValues() {},
  };
}

function node(type) {
  const value = {
    type,
    connections: [],
    disconnected: false,
    gain: parameter(), frequency: parameter(), Q: parameter(),
    threshold: parameter(), knee: parameter(), ratio: parameter(),
    attack: parameter(), release: parameter(), playbackRate: parameter(),
    connect(next) { this.connections.push(next); return next; },
    disconnect() { this.disconnected = true; },
  };
  if (type === 'oscillator' || type === 'buffer') {
    value.started = false;
    value.ended = false;
    value.start = function(at = 0, offset, duration) {
      assert(Number.isFinite(at) && at >= 0);
      if (duration !== undefined) assert(duration > 0 && Number.isFinite(duration));
      this.started = true;
      this.startAt = at;
      this.offset = offset;
      this.duration = duration;
    };
    value.stop = function(at) {
      if (at !== undefined && at > currentContext.currentTime) {
        this.stopAt = at;
        return;
      }
      if (!this.ended) {
        this.ended = true;
        this.onended?.();
      }
    };
    sources.push(value);
  }
  return value;
}

class MockAudioContext {
  constructor() {
    contexts++;
    this.state = 'suspended';
    this.sampleRate = 48000;
    this.currentTime = 1;
    this.destination = node('destination');
    currentContext = this;
  }
  createGain() { return node('gain'); }
  createBiquadFilter() { return node('filter'); }
  createDynamicsCompressor() { return node('compressor'); }
  createOscillator() { return node('oscillator'); }
  createBufferSource() { return node('buffer'); }
  createBuffer(channels, length, rate) {
    buffers++;
    assert.equal(channels, 1);
    assert(length <= rate * 3, 'The shared noise buffer stays small');
    return { getChannelData: () => new Float32Array(length) };
  }
  resume() { resumes++; this.state = 'running'; return Promise.resolve(); }
}

globalThis.document = {
  hidden: false,
  addEventListener(name, callback) { listeners.set(name, callback); },
};
globalThis.AudioContext = MockAudioContext;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => timestamp } });

const requests = [];
let releaseRecordings;
const recordingGate = new Promise(resolve => { releaseRecordings = resolve; });
let sauceAttempts = 0;
globalThis.fetch = async url => {
  requests.push(url);
  await recordingGate;
  if (url.endsWith('/sauce.mp3') && ++sauceAttempts === 1) return { ok: false };
  return { ok: true, arrayBuffer: async () => ({ recording: url.split('/').at(-1), duration: .7 }) };
};
MockAudioContext.prototype.decodeAudioData = async function(data) { return data; };

const domainText = readFileSync(new URL('../src/domain.ts', import.meta.url), 'utf8');
const domainCode = ts.transpileModule(domainText, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const domainUrl = 'data:text/javascript;base64,' + Buffer.from(domainCode).toString('base64');
const domain = await import(domainUrl);
const sourceText = readFileSync(new URL('../src/sound.ts', import.meta.url), 'utf8')
 .replaceAll('import.meta.env.BASE_URL', JSON.stringify('/shawarma-craft/'))
 .replace("from './domain'", "from '" + domainUrl + "'");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const sounds = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const active = () => sources.filter(source => source.started && !source.ended);
function play(kind) {
  timestamp += 60;
  sounds.sound(kind, true);
}

sounds.sound('cucumber', false);
assert.equal(contexts, 0, 'Muted interaction must not allocate audio resources');
document.hidden = true;
sounds.sound('cucumber', true);
assert.equal(contexts, 0, 'Hidden tabs must not allocate audio resources');
document.hidden = false;
sounds.unlockAudio(false);
assert.equal(contexts, 0);
sounds.unlockAudio(true);
assert.equal(contexts, 1);
assert(resumes > 0, 'Audio must unlock during the user gesture');
assert.equal(active().length, 0, 'Unlocking must not produce sound');

const ids = domainText.match(/export type CoreIngredientId\s*=\s*([^;]+);/)[1].match(/'[^']+'/g).map(id => id.slice(1, -1));
for (const kind of [...ids, 'cut', 'fold', 'grill', 'place', 'bread', 'ready', 'remove']) {
  const before = sources.length;
  play(kind);
  const created = sources.slice(before);
  assert(created.length > 0, `Missing sound for ${kind}`);
  assert(created.every(source => source.started && Number.isFinite(source.stopAt)), `${kind} has a bounded lifetime`);
  if (kind === 'grill') assert(Math.max(...created.map(source => source.stopAt)) - currentContext.currentTime <= 2.6);
  sounds.stopSounds();
  assert.equal(active().length, 0, `Stopping must cancel ${kind}`);
  assert(created.every(source => source.disconnected), `Finished ${kind} nodes must disconnect`);
}
const soundProfiles = new Map();
for (const kind of ['cucumber', 'tomato', 'onion', 'cabbage', 'fries']) {
  const before = sources.length;
  play(kind);
  const profile = sources.slice(before).map(source => ({
    frequency: source.frequency.events.map(event => event.slice(0, 2)),
    filter: source.connections[0]?.frequency.events.map(event => event.slice(0, 2)),
    duration: source.duration,
    delay: source.startAt - currentContext.currentTime,
  }));
  soundProfiles.set(kind, JSON.stringify(profile));
  sounds.stopSounds();
}
assert.equal(new Set(soundProfiles.values()).size, 5, 'Vegetables and fries must not share one generic scheduled texture');
assert.equal(buffers, 1, 'Ingredient changes reuse the shared noise buffer');
assert.equal(contexts, 1, 'Ingredient changes reuse one audio context');

for (let index = 0; index < 60; index++) play(ids[index % ids.length]);
assert(active().length <= 64, 'Rapid taps must retain a bounded number of audio sources');
document.hidden = true;
listeners.get('visibilitychange')();
assert.equal(active().length, 0, 'Backgrounding must immediately cancel scheduled sounds');

document.hidden = false;
const beforeLoad = sources.length;
releaseRecordings();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(sources.length, beforeLoad, 'Loading after mute/stop must never replay old events');
assert.equal(requests.length, 15, 'Every recording is fetched once, including repeated gestures');
assert(requests.every(url => url.startsWith('/shawarma-craft/audio/asmr-v2/')), 'Audio honors the published subdirectory');
const expectedRecordings = {
 cucumber: 'cucumber.mp3', pickle: 'cucumber.mp3', tomato: 'tomato.mp3', onion: 'onion.mp3',
 cabbage: 'cabbage.mp3', lettuce: 'leaf.mp3', carrot: 'carrot.mp3', pepper: 'vegetable.mp3',
 jalapeno: 'vegetable.mp3', mushroom: 'vegetable.mp3', chicken: 'meat-land.mp3', beef: 'meat-land.mp3', cut: 'meat-cut.mp3',
 fries: 'fries.mp3', falafel: 'fries.mp3', fold: 'fold.mp3', bread: 'bread.mp3', grill: 'grill.mp3', remove: 'remove.mp3',
};
for (const [kind, file] of Object.entries(expectedRecordings)) {
 const before = sources.length;
 play(kind);
 const created = sources.slice(before);
 assert.equal(created.length, 1, `${kind} plays exactly one recording without synthetic overlap`);
 assert.equal(created[0].buffer.recording, file, `${kind} uses the corresponding food recording`);
 assert.equal(created[0].loop, undefined, 'Short food clips do not loop');
 assert(created[0].duration <= 1.6);
 sounds.stopSounds();
}
let before = sources.length;
play('white');
assert(sources.length - before > 1, 'A failed download immediately uses fallback audio');
sounds.stopSounds();
timestamp += 31000;
sounds.unlockAudio(true);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(requests.length, 16, 'Only the failed recording retries after the backoff');
for (const kind of ['white', 'hot', 'bbq', 'cheeseSauce', 'tomatoSauce', 'yogurt', 'tahini']) {
 before = sources.length;
 play(kind);
 assert.equal(sources.length, before + 1);
 assert.equal(sources.at(-1).buffer.recording, 'sauce.mp3', `${kind} uses bottle squeeze`);
 sounds.stopSounds();
}
domain.registerIngredientVisuals([
 {id:'custom-chicken-test',name:'Индейка',emoji:'🍗',color:'#c99955',note:'Тест',category:'protein',visualId:'chicken'},
 {id:'custom-sauce-test',name:'Соус',emoji:'🥛',color:'#eee',note:'Тест',category:'sauce',visualId:'white'},
]);
for (const [id, recording] of [['custom-chicken-test','meat-land.mp3'],['custom-sauce-test','sauce.mp3'],['custom-unknown-test','tomato.mp3']]) {
 before = sources.length;
 play(id);
 assert.equal(sources.length, before + 1);
 assert.equal(sources.at(-1).buffer.recording, recording, 'Custom products use their selected visual/audio family');
 sounds.stopSounds();
}
domain.registerIngredientVisuals([]);
// Cancellation is an explicit new action even when it follows a landing within 35 ms.
play('cucumber');
sounds.stopSounds();
before = sources.length;
sounds.sound('remove', true);
assert.equal(sources.length, before + 1, 'Immediate undo must not be throttled after cancellation');
assert.equal(sources.at(-1).buffer.recording, 'remove.mp3');
sounds.stopSounds();
play('cucumber');
document.hidden = true;
listeners.get('visibilitychange')();
assert.equal(active().length, 0, 'Backgrounding also cancels recorded samples');
document.hidden = false;
currentContext.state = 'closed';
delete globalThis.AudioContext;
assert.doesNotThrow(() => play('ready'), 'Unavailable browser audio must leave the constructor usable');

const manifest = JSON.parse(readFileSync(new URL('../public/audio/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.length, 15);
let totalBytes = 0;
for (const clip of manifest) {
 const data = readFileSync(new URL('../public/audio/' + clip.file, import.meta.url));
 totalBytes += data.length;
 assert.equal(data.length, clip.bytes, 'Shipped audio size matches its provenance manifest');
 assert.equal(createHash('sha256').update(data).digest('hex'), clip.sha256, 'Shipped audio matches the processed recording');
 assert.equal(clip.license, 'CC0-1.0');
 assert(clip.duration > 0 && clip.duration <= 2.5);
 assert(clip.file.startsWith('asmr-v2/'), 'New sound bank cannot reuse stale cached samples');
}
assert(totalBytes < 200000, 'ASMR assets must remain small enough for mobile loading');
console.log('PASS sound: ASMR bank integrity/size, real recording/product mapping, subdirectory loading, failed-download fallback/retry, no stale playback, gesture unlock, bounded resources and mute/background cleanup.');
