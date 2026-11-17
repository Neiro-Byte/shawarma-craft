import {isSauceId,type IngredientId} from './domain';
let ctx:AudioContext|undefined;
export function sound(kind:string,enabled:boolean){
 if(!enabled||document.hidden)return;
 try {ctx??=new AudioContext();void ctx.resume().catch(()=>{});const now=ctx.currentTime;
 const notes=kind==='ready'?[523,659,784,1046]:kind==='fold'?[180,240,320]:kind==='cheese'?[880,1100,1320]:isSauceId(kind as IngredientId)?[330,440]:[440+Math.random()*160];
 notes.forEach((frequency,i)=>{const o=ctx!.createOscillator(),g=ctx!.createGain();o.type=kind==='fold'?'sine':'triangle';o.frequency.setValueAtTime(frequency,now+i*.09);o.frequency.exponentialRampToValueAtTime(frequency*.7,now+i*.09+.16);g.gain.setValueAtTime(0,now+i*.09);g.gain.linearRampToValueAtTime(.045,now+i*.09+.01);g.gain.exponentialRampToValueAtTime(.001,now+i*.09+.22);o.connect(g);g.connect(ctx!.destination);o.start(now+i*.09);o.stop(now+i*.09+.24);o.onended=()=>{o.disconnect();g.disconnect()};});}catch{/* Silent mode is supported. */}
}
