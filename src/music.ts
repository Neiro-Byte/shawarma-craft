// Music has its own player and lifecycle; muting food/order effects never touches it.
let enabled=false;
let interacted=false;
let player:HTMLAudioElement|undefined;
let starting:number|undefined;
let attempt=0;
let pageHidden=false;

const hidden=()=>pageHidden||(typeof document!=='undefined'&&document.hidden);

function pause(){
 starting=undefined;
 player?.pause();
}

function play(){
 if(!enabled||!interacted||hidden())return;
 try{
  if(!player){
   player=new Audio(`${import.meta.env.BASE_URL}audio/music/quiet-bazaar-v1.mp3`);
   player.loop=true;
   player.preload='none';
   player.volume=.3;
  }
  if(!player.paused||starting!==undefined)return;
  const current=player;
  const id=++attempt;
  starting=id;
  void Promise.resolve(current.play()).then(()=>{
   // A previous play promise can settle after mute, navigation, or unmount.
   if(current!==player||!enabled||hidden())current.pause();
  }).catch(()=>{
   // A browser can deny autoplay or an offline request; the next gesture retries.
  }).finally(()=>{if(starting===id)starting=undefined});
 }catch{
  starting=undefined;
 }
}

export function setMusicEnabled(value:boolean):void{
 enabled=value;
 if(value)play();else pause();
}

export function unlockMusic():void{
 interacted=true;
 play();
}

export function stopMusic():void{
 enabled=false;
 interacted=false;
 pause();
 if(player){
  player.removeAttribute('src');
  player.load();
  player=undefined;
 }
}

if(typeof document!=='undefined'){
 document.addEventListener('visibilitychange',()=>{if(hidden())pause();else play()});
}
if(typeof window!=='undefined'){
 window.addEventListener('pagehide',()=>{pageHidden=true;pause()});
 window.addEventListener('pageshow',()=>{pageHidden=false;play()});
}
