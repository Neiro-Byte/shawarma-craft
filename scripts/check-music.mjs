import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const documentListeners=new Map(),windowListeners=new Map();
function listen(target,name,callback){
 if(!target.has(name))target.set(name,[]);
 target.get(name).push(callback);
}
const emit=(target,name)=>target.get(name)?.forEach(callback=>callback());
globalThis.document={hidden:false,addEventListener:(name,callback)=>listen(documentListeners,name,callback)};
globalThis.window={addEventListener:(name,callback)=>listen(windowListeners,name,callback)};
const players=[];
let rejectNext=false,deferNext=false;
class MockAudio {
 constructor(src){this.src=src;this.paused=true;this.plays=0;this.pauses=0;this.loads=0;players.push(this);}
 play(){
  this.plays++;this.paused=false;
  if(deferNext){deferNext=false;return new Promise(resolve=>{this.finishPlay=()=>{this.paused=false;resolve()};});}
  if(rejectNext){rejectNext=false;this.paused=true;return Promise.reject(new Error('Autoplay blocked'));}
  return Promise.resolve();
 }
 pause(){this.pauses++;this.paused=true;}
 removeAttribute(name){if(name==='src')delete this.src;}
 load(){this.loads++;}
}
globalThis.Audio=MockAudio;
async function moduleFrom(path){
 const source=readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/shawarma-craft/'));
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
}
const music=await moduleFrom('../src/music.ts');
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
music.setMusicEnabled(true);
assert.equal(players.length,0,'Page load must not create/autoplay music before interaction');
document.hidden=true;
music.unlockMusic();
assert.equal(players.length,0,'Hidden pages must not load music');
document.hidden=false;
music.unlockMusic();
await flush();
const player=players[0];
assert.equal(players.length,1);
assert.equal(player.src,'/shawarma-craft/audio/music/quiet-bazaar-v1.mp3');
assert.equal(player.loop,true);
assert.equal(player.preload,'none');
assert(player.volume>0&&player.volume<=.35,'Background music stays below full volume');
for(let i=0;i<30;i++)music.unlockMusic();
assert.equal(player.plays,1,'Repeated ingredient taps must not restart playing music');
music.setMusicEnabled(false);
assert.equal(player.paused,true);
music.unlockMusic();
assert.equal(player.plays,1,'General interaction never unmutes explicitly disabled music');
music.setMusicEnabled(true);
await flush();
assert.equal(player.plays,2,'Re-enable resumes the existing player');

// Run the real food-effect module alongside music: each mute path owns only its audio.
const effectSources=[];
let timestamp=1000;
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>timestamp}});
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
function audioNode(source=false){
 const node={gain:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){},start(){},stop(at){if(at!==undefined&&at>1){this.stopAt=at;return}this.stopped=true;this.onended?.();}};
 if(source)effectSources.push(node);
 return node;
}
globalThis.AudioContext=class {
 constructor(){this.state='running';this.sampleRate=8000;this.currentTime=1;this.destination=audioNode();}
 createGain(){return audioNode();} createDynamicsCompressor(){return audioNode();}
 createBiquadFilter(){return audioNode();} createOscillator(){return audioNode(true);}
 createBufferSource(){return audioNode(true);}
 createBuffer(){return {getChannelData:()=>new Float32Array(8000)};}
};
globalThis.fetch=async()=>({ok:false});
const effects=await moduleFrom('../src/sound.ts');
effects.sound('click',true);
assert(effectSources.length>0);
effects.stopSounds();
assert.equal(player.paused,false,'Muting ingredient/order effects must not pause music');
timestamp+=100;
effects.sound('click',true);
music.setMusicEnabled(false);
assert.equal(effectSources.at(-1).stopped,undefined,'Muting music must not stop ingredient/order effects');
const effectCount=effectSources.length;
effects.sound('click',false);
music.setMusicEnabled(true);
await flush();
assert.equal(effectSources.length,effectCount,'Music toggles must not trigger food effects');
assert.equal(player.paused,false,'Music can play while effects are muted');
document.hidden=true;emit(documentListeners,'visibilitychange');
assert.equal(player.paused,true);
assert(effectSources.every(source=>source.stopped),'Backgrounding stops effects too');
document.hidden=false;emit(documentListeners,'visibilitychange');
await flush();
assert.equal(player.paused,false);
assert.equal(effectSources.length,effectCount,'Returning to the page never replays an old effect');
emit(windowListeners,'pagehide');
assert.equal(player.paused,true);
music.unlockMusic();
assert.equal(player.paused,true,'A hidden/bfcached page cannot restart playback');
emit(windowListeners,'pageshow');await flush();
assert.equal(player.paused,false);

music.setMusicEnabled(false);rejectNext=true;music.setMusicEnabled(true);
await flush();
assert.equal(player.paused,true);
const failedPlayCount=player.plays;
music.unlockMusic();await flush();
assert.equal(player.plays,failedPlayCount+1,'A later gesture retries rejected playback');
assert.equal(players.length,1,'Retries reuse one media player');
music.setMusicEnabled(false);deferNext=true;music.setMusicEnabled(true);
const oldFinish=player.finishPlay;
music.setMusicEnabled(false);
oldFinish();await flush();
assert.equal(player.paused,true,'A late play promise cannot defeat the music-off preference');
deferNext=true;music.setMusicEnabled(true);
const unmountedFinish=player.finishPlay;
music.stopMusic();
unmountedFinish();await flush();
assert.equal(player.paused,true);
assert.equal(player.src,undefined);
assert.equal(player.loads,1,'Unmount releases the streaming resource');
music.unlockMusic();
assert.equal(players.length,1,'Unmount does not leave a resumable player');
delete globalThis.Audio;
assert.doesNotThrow(()=>music.setMusicEnabled(true),'Unavailable browser audio must leave ordering usable');

const file=readFileSync(new URL('../public/audio/music/quiet-bazaar-v1.mp3',import.meta.url));
assert(file.length<750000,'The looping music stays small for mobile streaming');
const manifest=JSON.parse(readFileSync(new URL('../public/audio/music/manifest.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(file).digest('hex'),manifest.sha256,'Published music matches its manifest');
console.log('PASS music: gesture-only start, independent music/effects mute, player reuse, background/BFCache, rejection retry, late-play cancellation, release and asset integrity.');
