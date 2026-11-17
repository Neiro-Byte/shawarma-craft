import type {IngredientId} from './domain';

type FoodSound='meat'|'juicy'|'crunch'|'leaf'|'shreds'|'sauce'|'crisp'|'soft'|'grains';
const ingredientSounds:Record<IngredientId,FoodSound>={
 chicken:'meat',beef:'meat',tomato:'juicy',cucumber:'crunch',lettuce:'leaf',
 cheese:'shreds',onion:'crunch',white:'sauce',hot:'sauce',pepper:'crunch',
 cabbage:'leaf',pickle:'juicy',carrot:'shreds',fries:'crisp',falafel:'crisp',
 mushroom:'soft',jalapeno:'crunch',beans:'grains',corn:'grains',cheeseSauce:'sauce',
 bbq:'sauce',tomatoSauce:'sauce',yogurt:'sauce',tahini:'sauce',
};
let context:AudioContext|undefined;
let output:GainNode|undefined;
let noise:AudioBuffer|undefined;
const playing=new Set<AudioScheduledSourceNode>();
let lastSoundAt=0;

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
   rustle(ctx,at,.15,950,.16);tone(ctx,at,270,.09,.07);
   rustle(ctx,at+.045,.1,1750,.09);break;
  case 'crunch':
   [0,.035,.075].forEach((delay,i)=>rustle(ctx,at+delay,.065,2200+i*550,.15-i*.025,1.5));break;
  case 'leaf':
   [0,.07,.15].forEach((delay,i)=>rustle(ctx,at+delay,.13,2600+i*400,.09));break;
  case 'shreds':
   for(let i=0;i<7;i++)rustle(ctx,at+i*.035,.065,1800+(i%3)*450,.055);
   break;
  case 'sauce':
   rustle(ctx,at,.48,720,.11,2);
   for(let i=0;i<5;i++){
    tone(ctx,at+.04+i*.08,210+(i%3)*65,.075,.04);
    rustle(ctx,at+.04+i*.08,.09,1200,.035,2);
   }
   break;
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
  }else if(kind==='fold'){
   rustle(ctx,at,.35,1100,.09);
  }else{
   tone(ctx,at,kind==='remove'?270:420,.06,.05);
  }
 }catch{/* The constructor remains usable when browser audio is unavailable. */}
}

if(typeof document!=='undefined'){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSounds()});
}
