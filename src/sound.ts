import type {IngredientId} from './domain';

type FoodSound='meat'|'juicy'|'cucumber'|'onion'|'crunch'|'leaf'|'cabbage'|'shreds'|'sauce'|'fries'|'crisp'|'soft'|'grains';
const ingredientSounds:Record<IngredientId,FoodSound>={
 chicken:'meat',beef:'meat',tomato:'juicy',cucumber:'cucumber',lettuce:'leaf',
 cheese:'shreds',onion:'onion',white:'sauce',hot:'sauce',pepper:'crunch',
 cabbage:'cabbage',pickle:'juicy',carrot:'shreds',fries:'fries',falafel:'crisp',
 mushroom:'soft',jalapeno:'crunch',beans:'grains',corn:'grains',cheeseSauce:'sauce',
 bbq:'sauce',tomatoSauce:'sauce',yogurt:'sauce',tahini:'sauce',
};
let context:AudioContext|undefined;
let output:GainNode|undefined;
let noise:AudioBuffer|undefined;
const playing=new Set<AudioScheduledSourceNode>();
let lastSoundAt=-Infinity;

function audio(){
 if(context&&context.state!=='closed')return context;
 context=new AudioContext();
 output=context.createGain();
 output.gain.value=.45;
 const limiter=context.createDynamicsCompressor();
 limiter.threshold.value=-18;
 limiter.knee.value=12;
 limiter.ratio.value=8;
 output.connect(limiter);
 limiter.connect(context.destination);
 noise=context.createBuffer(1,context.sampleRate,context.sampleRate);
 const samples=noise.getChannelData(0);
 for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
 return context;
}

function track(source:AudioScheduledSourceNode,nodes:AudioNode[]){
 // A fixed bound also covers rapid taps while previous sounds are still playing.
 if(playing.size>=48){
  const oldest=playing.values().next().value;
  if(oldest){try{oldest.stop()}catch{/* It may have ended between callbacks. */}playing.delete(oldest)}
 }
 playing.add(source);
 source.onended=()=>{
  playing.delete(source);
  source.disconnect();
  nodes.forEach(node=>node.disconnect());
 };
}

function rustle(ctx:AudioContext,at:number,duration:number,frequency:number,volume:number,q=.8){
 const source=ctx.createBufferSource();
 source.buffer=noise!;
 source.loop=true;
 const filter=ctx.createBiquadFilter();
 filter.type='bandpass';
 filter.frequency.setValueAtTime(frequency,at);
 filter.frequency.exponentialRampToValueAtTime(frequency*.65,at+duration);
 filter.Q.value=q;
 const gain=ctx.createGain();
 gain.gain.setValueAtTime(0,at);
 gain.gain.linearRampToValueAtTime(volume,at+.008);
 gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
 source.connect(filter);filter.connect(gain);gain.connect(output!);
 track(source,[filter,gain]);
 source.start(at,Math.random()*.15,duration);
 source.stop(at+duration+.01);
}

function tone(ctx:AudioContext,at:number,frequency:number,duration:number,volume:number){
 const source=ctx.createOscillator();
 const gain=ctx.createGain();
 source.type='sine';
 source.frequency.setValueAtTime(frequency,at);
 source.frequency.exponentialRampToValueAtTime(frequency*.65,at+duration);
 gain.gain.setValueAtTime(0,at);
 gain.gain.linearRampToValueAtTime(volume,at+.008);
 gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
 source.connect(gain);gain.connect(output!);
 track(source,[gain]);
 source.start(at);source.stop(at+duration+.01);
}

function food(ctx:AudioContext,kind:FoodSound,at:number){
 switch(kind){
  case 'meat':
   rustle(ctx,at,.17,430,.18);tone(ctx,at,135,.12,.12);
   rustle(ctx,at+.065,.1,850,.08);break;
  case 'juicy':
   rustle(ctx,at,.19,780,.15);
   tone(ctx,at+.015,245,.11,.065);
   rustle(ctx,at+.045,.12,1550,.11,1.3);
   tone(ctx,at+.1,370,.045,.025);break;
  case 'cucumber':
   rustle(ctx,at,.035,4100,.19,1.7);
   rustle(ctx,at+.026,.075,2850,.14,1.1);
   rustle(ctx,at+.095,.08,1800,.065);break;
  case 'onion':
   rustle(ctx,at,.025,3600,.105,1.8);
   rustle(ctx,at+.035,.045,3000,.075,1.5);break;
  case 'crunch':
   [0,.035,.075].forEach((delay,i)=>rustle(ctx,at+delay,.065,2200+i*550,.15-i*.025,1.5));break;
  case 'leaf':
   [0,.07,.15].forEach((delay,i)=>rustle(ctx,at+delay,.13,2600+i*400,.09));break;
  case 'cabbage':
   rustle(ctx,at,.21,1150,.14,.9);
   [0,.055,.115,.19].forEach((delay,i)=>rustle(ctx,at+delay,.07,2200+i*180,.095,1.2));break;
  case 'shreds':
   for(let i=0;i<7;i++)rustle(ctx,at+i*.035,.065,1800+(i%3)*450,.055);
   break;
  case 'sauce':
   // One soft squeeze followed by a continuous wet stream and small air bubbles.
   rustle(ctx,at,.13,430,.1,1.6);
   rustle(ctx,at+.07,1.02,820,.085,1.7);
   for(let i=0;i<5;i++){
    const bubbleAt=at+.12+i*.18;
    tone(ctx,bubbleAt,190+(i%3)*65,.09,.045);
    rustle(ctx,bubbleAt,.085,1300,.04,2);
   }
   tone(ctx,at+1.08,310,.07,.025);break;
  case 'fries':
   rustle(ctx,at,.055,1550,.17,1.5);
   rustle(ctx,at+.04,.075,2200,.09,1.2);
   tone(ctx,at,120,.065,.05);break;
  case 'crisp':
   rustle(ctx,at,.12,3100,.13,1.5);tone(ctx,at,160,.08,.08);
   rustle(ctx,at+.065,.09,1800,.1);break;
  case 'soft':
   rustle(ctx,at,.13,520,.13);tone(ctx,at,120,.1,.09);break;
  case 'grains':
   for(let i=0;i<6;i++){
    tone(ctx,at+i*.038,190+(i%3)*90,.045,.045);
    rustle(ctx,at+i*.038,.04,1300,.045);
   }
   break;
 }
}

export function stopSounds(){
 for(const source of playing){
  try{source.stop()}catch{/* The source may have just finished. */}
 }
 playing.clear();
}

export function unlockAudio(enabled:boolean):void{
 if(!enabled||document.hidden)return;
 try{
  const ctx=audio();
  if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
 }catch{/* Browsers can disable audio while leaving the constructor available. */}
}

export function sound(kind:string,enabled:boolean){
 if(!enabled||document.hidden)return;
 const timestamp=performance.now();
 if(timestamp-lastSoundAt<35)return;
 lastSoundAt=timestamp;
 try{
  const ctx=audio();
  if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
  // Bound overlapping sounds during rapid taps on a phone.
  if(playing.size>24)stopSounds();
  const at=ctx.currentTime;
  if(Object.hasOwn(ingredientSounds,kind)){
   food(ctx,ingredientSounds[kind as IngredientId],at);
  }else if(kind==='ready'){
   [523,659,784].forEach((frequency,i)=>tone(ctx,at+i*.08,frequency,.17,.075));
  }else if(kind==='cut'){
   // The short high band suggests the blade, the lower bands suggest the crust.
   rustle(ctx,at,.19,4700,.065,2.3);
   tone(ctx,at,1650,.045,.016);
   rustle(ctx,at+.035,.24,1650,.105,1.2);
   rustle(ctx,at+.08,.26,650,.07);
  }else if(kind==='fold'){
   rustle(ctx,at,.22,1500,.095);
   rustle(ctx,at+.22,.21,1150,.09);
   tone(ctx,at+.22,125,.08,.035);
   rustle(ctx,at+.5,.58,850,.09,1.1);
   rustle(ctx,at+.88,.2,1800,.05);
  }else if(kind==='grill'){
   rustle(ctx,at,2.5,2300,.105,.65);
   for(let i=0;i<8;i++)rustle(ctx,at+.12+i*.28,.045,3200+(i%3)*450,.045,1.4);
  }else if(kind==='place'){
   tone(ctx,at,105,.12,.075);
   rustle(ctx,at,.17,700,.08);
   rustle(ctx,at+.045,.23,1800,.045);
  }else if(kind==='bread'){
   rustle(ctx,at,.25,1450,.09);
   tone(ctx,at+.16,115,.085,.05);
  }else{
   tone(ctx,at,kind==='remove'?270:420,.06,.05);
  }
 }catch{/* The constructor remains usable when browser audio is unavailable. */}
}

if(typeof document!=='undefined'){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSounds()});
}
