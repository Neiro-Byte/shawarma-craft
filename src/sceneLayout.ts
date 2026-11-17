import {MAX_FILLINGS,type IngredientId} from './domain';

// Final-state layout only. Animation trajectories are intentionally separate.
export const roll = {radius:.48,centerY:.87,halfLength:1.275} as const;
export const fillingTransform = {x:.34,y:.48,z:.83,offsetY:.56} as const;
export const endcap = {z:1.235,radius:.478,outward:.006,spread:.27,scale:[.55,.12,.55] as [number,number,number]} as const;
export const grillLayout = {
 x:5,y:-.16,z:-.2,dishY:.15,hingeY:1.65,hingeZ:-1.6,
 width:3.78,plateWidth:3.58,ribWidth:3.48,openAngle:-1.05,transferY:.36,
} as const;
export const batchRollLayout = {
 spacing:1.08,stagingX:-4.67,stagingWidth:3.60,stagingDepth:2.82,
 boardTop:.2845,grillTop:.5225,grillGap:.012,
} as const;
export const trayLayout = {xs:[-2.48,-1.24,0,1.24,2.48],spacing:1.24,z:-3.25,width:1,depth:.9} as const;

export const sauceStation = {z:-4.85,xs:[-3.3,-2.2,-1.1,0,1.1,2.2,3.3]} as const;

export const servingLayout = {
 trayWidth:5.48,trayDepth:2.96,traySurface:.085,
 startY:.298,startZ:.25,shelfWidth:5.77,shelfDepth:3.1,shelfHeight:2.55,shelfX:-.85,shelfZ:-3.29,
 rollCenterX:-.80,extraCenterX:1.88,extraSpacingX:.78,extraSpacingZ:.63,liftGap:.16,
} as const;
export const pickupOpening = {width:3.35,bottom:2.60,top:4.85,wallZ:-5.296,recessZ:-5.94} as const;

export function servingCameraDistance(width:number,height:number,inspect:boolean,halfWidth=inspect?2.98:3.18) {
 const aspect=Math.max(width,1)/Math.max(height,1);
 const horizontal=Math.tan(38*Math.PI/360)*aspect;
 return Math.max(inspect?6.65:7.6,halfWidth/horizontal+1.45);
}

export function centeredSlot(index:number,quantity:number,spacing:number) {
 return (index-(quantity-1)/2)*spacing;
}

export function denseLayers<T>(batches:readonly T[]) {
 return batches.slice(0,MAX_FILLINGS).map((b,layer)=>({...b,layer}));
}
export function piecePose(layer:number,index:number){
 const s=index*2.399+layer*.9;
 return {x:Math.cos(s)*(.18+(index%3)*.20),z:Math.sin(s)*(1.05-(index%2)*.15),y:.44+layer*.055,ry:s};
}
export function cheesePose(layer:number,index:number){
 const a=index*2.399;
 return {x:Math.cos(a)*(.1+(index%7)*.085),y:.49+layer*.055,z:Math.sin(a)*(1.05-(index%5)*.12),ry:a};
}
export function saucePoint(layer:number,t:number):[number,number,number]{
 return [Math.sin(t*Math.PI*9)*.56,.52+layer*.055,t*2.3-1.15];
}
export function endPosition(index:number,count:number):[number,number,number]{
 return [Math.cos(index*Math.PI*2/count)*endcap.spread,0,Math.sin(index*Math.PI*2/count)*endcap.spread];
}

export const rotisserieLayout={position:[-4.52,-.15,-4.02] as [number,number,number],cutPoint:[-4.52,1.20,-3.43] as [number,number,number],camera:[-7.2,3.25,.4] as [number,number,number],cameraTarget:[-4.52,1.1,-3.6] as [number,number,number],cutDelay:.55,cutDuration:2.7} as const;

export function ingredientPieceCount(id:IngredientId){return id==='chicken'?16:id==='lettuce'?7:9}
