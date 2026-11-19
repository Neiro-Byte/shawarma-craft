/// <reference types="vite/client" />
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {OrbitControls,RoundedBox} from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import {Food,sauceColors,CHEESE_STRIP_SIZE} from './Food';
import {worldToIngredientSource,ingredientFlightPoint,type Point3} from './ingredientFlight';
import PantryFood from './PantryFood';
import {stationFoodIds,stationSauceIds,stationPage,type StationView} from './pantryStations';
import {ServingShelf,ServingTray,type ServingOrder} from './ServingTray';
import PickupWindow from './PickupWindow';
import ShawarmaInterior from './ShawarmaInterior';
import {useCookPerformance} from './scenePerformance';
import {isSauceId,visualIngredientId,ingredientMetadata,registeredCustomIngredients,type IngredientId} from './domain';
type SceneSound=(kind:string)=>void;
type IngredientPick=(id:IngredientId,origin?:[number,number,number])=>void;
import {ingredients,latestManualBatch,type Batch,type Phase} from './data';
import {roll,fillingTransform,endcap,grillLayout,batchRollLayout,centeredSlot,denseLayers,piecePose,ingredientPieceCount,cheesePose,saucePoint,endPosition,rotisserieLayout,trayLayout,sauceStation,servingLayout,servingCameraDistance} from './sceneLayout';
function findIngredient(id:IngredientId|undefined){return id?ingredients.find(item=>item.id===id)??ingredientMetadata(id):undefined}
const TAU=Math.PI*2;
const sauceBottleScale=1.48;
type LiftSauce=(id:IngredientId,key:number)=>{source:Point3;putBack:()=>void};
const kitchenCamera:[number,number,number]=[4.6,7,9.4];
const kitchenTarget:[number,number,number]=[0,1.02,-.55];
const mobileKitchenCamera:[number,number,number]=[0,7.2,8.6];
const mobileKitchenTarget:[number,number,number]=[0,.85,-1.2];
const trayLiners={chicken:'#626a6c',cheese:'#625e52',onion:'#ddd6c6',pickle:'#ddd6c6',falafel:'#ddd6c6'} as const;
const trayIds:readonly IngredientId[]=['chicken',...stationFoodIds,...stationSauceIds];
const servingView=new THREE.Vector3(.23,.53,.84).normalize();
function aimAtTray(target:THREE.Vector3,tray:THREE.Vector3) {
 return target.set(tray.x,tray.y+.52,tray.z+.14);
}
type WorldProps={
 onUndoLastIngredient?:()=>void;
 batches:Batch[];
 animateRecipe?:boolean;
 recipeBatches?:readonly Batch[][];
 phase:Phase;
 inspect:boolean;
 grill:boolean;
 onStage:(text:string)=>void;
 onSound?:SceneSound;
 onReady:()=>void;
 shawarmaQuantity?:number;
 onIngredientPick?:IngredientPick;
 availableIngredientIds?:readonly IngredientId[];
 stationView?:StationView;
 servingOrder?:ServingOrder;
 onServed?:(id:number)=>void;
};
// Pause local animations while hidden; never pause the shared GSAP ticker/UI.
function watchTimeline(timeline:gsap.core.Timeline){
 const visible=()=>{if(document.hidden)timeline.pause();else timeline.resume()};
 document.addEventListener('visibilitychange',visible);visible();
 return()=>{document.removeEventListener('visibilitychange',visible);timeline.kill()};
}
function breadTexture(toasted=false){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d')!;x.fillStyle='#edca83';x.fillRect(0,0,512,512);let seed=42;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};for(let i=0;i<1100;i++){const px=random()*512,py=random()*512,r=1+random()*10;const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,`rgba(134,65,19,${.08+random()*.3})`);g.addColorStop(1,'rgba(180,100,35,0)');x.fillStyle=g;x.beginPath();x.ellipse(px,py,r,r*.65,random()*6,0,TAU);x.fill();}if(toasted){x.strokeStyle='rgba(105,52,16,.52)';x.lineWidth=9;x.lineCap='round';for(let i=0;i<7;i++){x.beginPath();x.moveTo(12,95+i*50);x.lineTo(500,95+i*50);x.stroke();}}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
function Bread({progress,texture}:{progress:React.RefObject<{value:number}>;texture:THREE.Texture}){
 const {geo,vertices}=useMemo(()=>{
  const geo=new THREE.PlaneGeometry(1,1,64,40);
  const uv=geo.attributes.uv;
  const vertices=Array.from({length:uv.count},(_,i)=>{
   const u=uv.getX(i),v=uv.getY(i),sx=u*2-1,sz=v*2-1;
   const angle=sx*Math.PI*.999;
   return {
    flatX:sx*1.85*Math.sqrt(Math.max(.01,1-sz*sz*.65))*(1+.018*Math.sin(v*41)),
    flatY:.38+.025*Math.sin(u*21)*Math.cos(v*19)+.035*Math.pow(Math.abs(sx),8),
    rolledX:Math.sin(angle)*roll.radius,
    rolledY:roll.centerY-Math.cos(angle)*roll.radius,
    foldEdge:.18*Math.pow(Math.abs(sz),8),
    z:sz*1.5,
    edgeWave:.018*Math.sin(u*43),
   };
  });
  for(const attribute of [geo.attributes.position,geo.attributes.normal]){
   if(attribute instanceof THREE.BufferAttribute)attribute.setUsage(THREE.DynamicDrawUsage);
  }
  return {geo,vertices};
 },[]);
 const previous=useRef(-1);
 useEffect(()=>()=>geo.dispose(),[geo]);
 useFrame(()=>{
  const p=progress.current.value;
  if(previous.current===p)return;
  previous.current=p;
  const open=1-p;
  const sideFold=open*Math.sin(Math.min(1,p*2)*Math.PI*.5);
  const length=1-.15*p;
  const position=geo.attributes.position;
  for(let i=0;i<vertices.length;i++){
   const {flatX,flatY,rolledX,rolledY,foldEdge,z,edgeWave}=vertices[i];
   position.setXYZ(i,THREE.MathUtils.lerp(flatX,rolledX,p),
    THREE.MathUtils.lerp(flatY,rolledY,p)+sideFold*foldEdge,z*(1+edgeWave*open)*length);
  }
  position.needsUpdate=true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
 });
 return <mesh geometry={geo} castShadow receiveShadow><meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={.85}/></mesh>
}
function BatchRoll({texture,colors}:{texture:THREE.Texture;colors:string[]}){
 const filling=useRef<THREE.InstancedMesh>(null);
 useLayoutEffect(()=>{
  if(!filling.current)return;
  const mesh=filling.current;
  const chip=new THREE.Object3D(),color=new THREE.Color();
  for(const [end,side] of [-1,1].entries()){
   colors.forEach((value,i)=>{
    const angle=(i-1)*TAU/Math.max(1,colors.length-1);
    const radius=i===0?0:.235;
    chip.position.set(Math.cos(angle)*radius,Math.sin(angle)*radius,side*(roll.halfLength+.004));
    chip.rotation.z=angle;
    chip.scale.set(.073,.052,.012);
    chip.updateMatrix();
    const index=end*colors.length+i;
    mesh.setMatrixAt(index,chip.matrix);
    mesh.setColorAt(index,color.set(value));
   });
  }
  mesh.instanceMatrix.needsUpdate=true;
  mesh.instanceColor!.needsUpdate=true;
  mesh.computeBoundingSphere();
 },[colors]);
 return <group position={[0,roll.centerY,0]}>
  <mesh rotation={[Math.PI/2,0,0]} castShadow receiveShadow>
   <cylinderGeometry args={[roll.radius,roll.radius,roll.halfLength*2,20]}/>
   <meshStandardMaterial attach="material-0" map={texture} roughness={.85}/>
   <meshStandardMaterial attach="material-1" color="#d2ab68" roughness={.85}/>
   <meshStandardMaterial attach="material-2" color="#d2ab68" roughness={.85}/>
  </mesh>
  {colors.length>0&&<instancedMesh ref={filling} args={[undefined,undefined,colors.length*2]}>
   <icosahedronGeometry args={[1,0]}/>
   <meshStandardMaterial color="#fff" roughness={.88}/>
  </instancedMesh>}
 </group>;
}
function FallingPiece({batch,index,settle,onComplete,onSound}:{batch:Batch;index:number;settle:boolean;onComplete?:()=>void;onSound?:SceneSound}){
 const complete=useRef(onComplete);complete.current=onComplete;
 const playSound=useRef(onSound);playSound.current=onSound;
 const root=useRef<THREE.Group>(null!);
 const started=useRef(false);
 const target=useMemo(()=>piecePose(batch.layer,index),[batch.layer,index]);
 useEffect(()=>{
  const piece=root.current;
  if(settle||batch.settled||started.current){
   piece.position.set(target.x,target.y,target.z);
   piece.rotation.set(0,target.ry,0);
   piece.scale.setScalar(1);
   return;
  }
  started.current=true;
  const landed=()=>{if(index===0)playSound.current?.(batch.id)};
  if(batch.source){
   piece.parent?.updateWorldMatrix(true,false);
   const source=worldToIngredientSource(batch.source,piece.parent?.matrixWorld??new THREE.Matrix4());
   const flight={t:0};
   const angle=index*2.399;
   source[0]+=Math.cos(angle)*.10;
   source[2]+=Math.sin(angle)*.10;
   piece.position.fromArray(source);
   piece.scale.setScalar(1);
   piece.rotation.set(0,index*.5,0);
   const timeline=gsap.timeline({
    delay:batch.id==='chicken'?rotisserieLayout.cutDelay+index*.07:index*.04,
    onComplete:()=>complete.current?.(),
   });
   timeline.to(flight,{
    t:1,duration:.95,ease:'power1.inOut',
    onUpdate:()=>piece.position.fromArray(ingredientFlightPoint(source,[target.x,target.y,target.z],flight.t,.85)),
   },0)
    .to(piece.rotation,{x:0,y:target.ry,z:0,duration:.95},0)
    .call(landed,[],.95);
   return watchTimeline(timeline);
  }
  const slow=batch.id==='lettuce'||batch.id==='beef'||batch.id==='onion';
  piece.position.set(target.x+(slow?.7:0),3.8+index*.13,target.z);
  piece.rotation.set(.8,index*2,slow?.7:.2);
  piece.scale.setScalar(.75);
  const timeline=gsap.timeline({
   delay:index*(batch.id==='cheese'?.025:.075),
   onComplete:()=>complete.current?.(),
  });
  timeline.to(piece.position,{
   x:target.x,y:target.y,z:target.z,duration:slow?1.55:.75,ease:slow?'sine.out':'bounce.out',
  },0)
   .to(piece.rotation,{x:0,y:target.ry,z:0,duration:slow?1.7:.95,ease:'power2.out'},0)
   .to(piece.scale,{x:1,y:1,z:1,duration:.8,ease:'elastic.out(1,.5)'},.25)
   .call(landed,[],slow?1.55:.75);
  return watchTimeline(timeline);
 },[batch.key,batch.id,batch.layer,batch.settled,batch.source,target,index,settle]);
 return <group ref={root}><Food kind={batch.id} variant={index}/></group>;
}
function CheeseRain({batch,settle,onComplete,onSound}:{batch:Batch;settle:boolean;onComplete?:()=>void;onSound?:SceneSound}){
 const complete=useRef(onComplete);complete.current=onComplete;
 const playSound=useRef(onSound);playSound.current=onSound;
 const completed=useRef(false);
 const sounded=useRef(false);
 const ref=useRef<THREE.InstancedMesh>(null!);const elapsedTime=useRef(0);const last=useRef(-1);
 const dummy=useMemo(()=>new THREE.Object3D(),[]);const bounce=useMemo(()=>gsap.parseEase('bounce.out'),[]);
 const source=useRef<[number,number,number]|null>(null);
 useLayoutEffect(()=>{
  elapsedTime.current=0;last.current=-1;completed.current=false;sounded.current=false;
  if(batch.source){ref.current.parent?.updateWorldMatrix(true,false);source.current=worldToIngredientSource(batch.source,ref.current.parent?.matrixWorld??new THREE.Matrix4())}
  else source.current=null;
 },[batch.key]);
 useEffect(()=>{last.current=-1},[batch.layer,settle,batch.settled]);
 useFrame((_,delta)=>{
  if(last.current===Infinity)return;
  elapsedTime.current+=Math.min(delta,.05);const elapsed=elapsedTime.current;
  if(!settle&&!batch.settled&&!sounded.current&&elapsed>=.9){sounded.current=true;playSound.current?.(batch.id)}
  const finished=settle||batch.settled||elapsed>=64*.012+.9;
  last.current=finished?Infinity:elapsed;
  for(let i=0;i<65;i++){
   const t=finished?1:THREE.MathUtils.clamp((elapsed-i*.012)/.9,0,1);
   const pose=cheesePose(batch.layer,i);
   if(source.current){
    const start:Point3=[source.current[0]+Math.cos(i*2.399)*.1,source.current[1],source.current[2]+Math.sin(i*2.399)*.1];
    dummy.position.fromArray(ingredientFlightPoint(start,[pose.x,pose.y,pose.z],t,.85));
   }else dummy.position.set(pose.x,pose.y+(1-bounce(t))*3.5,pose.z);
   dummy.rotation.set(0,pose.ry+(1-t)*4,(1-t)*2);dummy.scale.setScalar(1);dummy.updateMatrix();ref.current.setMatrixAt(i,dummy.matrix);
  }
  ref.current.instanceMatrix.needsUpdate=true;
  if(!settle&&!batch.settled&&!completed.current&&finished){completed.current=true;complete.current?.()}
 });
 return <instancedMesh ref={ref} args={[undefined,undefined,65]} castShadow><boxGeometry args={CHEESE_STRIP_SIZE}/><meshStandardMaterial color="#f4cb54" roughness={.7}/></instancedMesh>
}
function Sauce({batch,settle,onComplete,liftSauce,onSound}:{batch:Batch;settle:boolean;onComplete?:()=>void;liftSauce?:LiftSauce;onSound?:SceneSound}){
 const complete=useRef(onComplete);complete.current=onComplete;
 const playSound=useRef(onSound);playSound.current=onSound;
 const scene=useThree(state=>state.scene);
 const invalidate=useThree(state=>state.invalidate);
 const started=useRef(false);const bottle=useRef<THREE.Group>(null!);const material=useRef<THREE.MeshStandardMaterial>(null!);const stream=useRef<THREE.Mesh>(null!);
 const color=ingredientMetadata(batch.id)?.color??sauceColors[visualIngredientId(batch.id) as keyof typeof sauceColors]??sauceColors.white;
 const geo=useMemo(()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length:100},(_,i)=>new THREE.Vector3(...saucePoint(batch.layer,i/99)))),120,.035,6,false),[batch.layer]);
 useLayoutEffect(()=>{
  const container=bottle.current;
  if(settle||batch.settled||started.current){geo.setDrawRange(0,Infinity);container.visible=false;if(stream.current)stream.current.visible=false;return}
  started.current=true;
  geo.setDrawRange(0,0);
  stream.current.visible=false;
  const shelfBottle=scene.getObjectByName('ingredient-tray-'+batch.id);
  if(shelfBottle)shelfBottle.visible=false;
  const lifted=liftSauce?.(batch.id,batch.key);
  container.parent?.updateWorldMatrix(true,false);
  const origin=batch.source??lifted?.source;
  const source=origin?worldToIngredientSource(origin,container.parent?.matrixWorld??new THREE.Matrix4()):[.8,2.5,-1.5] as Point3;
  container.position.fromArray(source);
  container.rotation.set(0,0,0);
  container.scale.setScalar(sauceBottleScale);
  container.visible=true;
  const first=saucePoint(batch.layer,0),height=1.4+batch.layer*.055+.785*(sauceBottleScale-1);
  const flight={t:0},pour={t:0};
  let returned=false;
  const returnBottle=()=>{
   if(returned)return;
   returned=true;
   container.visible=false;
   if(shelfBottle)shelfBottle.visible=true;
   lifted?.putBack();
   invalidate();
  };
  const tl=gsap.timeline({onComplete:()=>{
   returnBottle();
   complete.current?.();
  }});
  tl.to(flight,{t:1,duration:.45,ease:'sine.inOut',onUpdate:()=>container.position.fromArray(ingredientFlightPoint(source,[first[0],height,first[2]],flight.t,.45))},0)
   .to(container.rotation,{z:Math.PI,duration:.34,ease:'sine.inOut'},.1)
   .set(stream.current,{visible:true},.45)
   .call(()=>playSound.current?.(batch.id),[],.45)
   .to(pour,{t:1,duration:1.5,ease:'none',onUpdate:()=>{
    geo.setDrawRange(0,Math.floor(pour.t*120)*36);
    const point=saucePoint(batch.layer,pour.t);container.position.set(point[0],height,point[2]);
   }},.45)
   .set(stream.current,{visible:false},1.95)
   .to(flight,{t:0,duration:.45,ease:'sine.inOut',onStart:()=>{flight.t=1},onUpdate:()=>{
    const end=saucePoint(batch.layer,1);container.position.fromArray(ingredientFlightPoint(source,[end[0],height,end[2]],flight.t,.45));
   }},1.95)
   .to(container.rotation,{z:0,duration:.4,ease:'sine.inOut'},1.95);
  const stop=watchTimeline(tl);
  return ()=>{
   stop();
   returnBottle();
  };
 },[geo,batch.key,batch.id,batch.layer,batch.settled,batch.source,settle,liftSauce,scene,invalidate]);
 useEffect(()=>()=>geo.dispose(),[geo]);
 return <><mesh geometry={geo} castShadow><meshStandardMaterial color={color} roughness={.38}/></mesh><group ref={bottle} visible={false}><SauceBottle id={batch.id} material={material}/><mesh ref={stream} position={[0,.835,0]} visible={false}><cylinderGeometry args={[.018,.018,.10,8]}/><meshStandardMaterial color={color} roughness={.38}/></mesh></group></>;
}
function Sparkles({celebrate=false,color='#f5bf4e'}:{celebrate?:boolean;color?:string}){
 const ref=useRef<THREE.InstancedMesh>(null!);const start=useRef(performance.now());const dummy=useMemo(()=>new THREE.Object3D(),[]);const count=celebrate?42:12;
 useFrame(()=>{const t=(performance.now()-start.current)/1000;if(t>4){ref.current.visible=false;return;}for(let i=0;i<count;i++){const q=(t*.6+i*.071)%1,angle=i*2.399;const radius=celebrate?1+q*1.8:.5+q*.8;dummy.position.set(Math.cos(angle)*radius,.7+Math.sin(q*Math.PI)*(celebrate?2.3:.5),Math.sin(angle)*radius*.65);dummy.rotation.set(t+i,t*.5,i);dummy.scale.setScalar(Math.sin(q*Math.PI)*(celebrate?.065:.028));dummy.updateMatrix();ref.current.setMatrixAt(i,dummy.matrix)}ref.current.instanceMatrix.needsUpdate=true});
 return <instancedMesh ref={ref} args={[undefined,undefined,count]}><octahedronGeometry args={[1,0]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.3}/></instancedMesh>
}
function SauceBottle({id,material}:{id:IngredientId;material:React.RefObject<THREE.MeshStandardMaterial>}){
 const color=ingredientMetadata(id)?.color??sauceColors[visualIngredientId(id) as keyof typeof sauceColors]??sauceColors.white;
 return <group name={'sauce-bottle-'+id}>
  <RoundedBox args={[.42,.57,.36]} radius={.085} smoothness={2} position={[0,.18,0]} castShadow receiveShadow>
   <meshStandardMaterial ref={material} color={color} emissive="#e8bd42" emissiveIntensity={0} roughness={.46}/>
  </RoundedBox>
  <mesh position={[0,.50,0]} castShadow><cylinderGeometry args={[.10,.16,.14,12]}/><meshStandardMaterial color={color} roughness={.48}/></mesh>
  <mesh position={[0,.59,0]} castShadow><cylinderGeometry args={[.12,.12,.07,12]}/><meshStandardMaterial color="#333b36" roughness={.66}/></mesh>
  <mesh position={[0,.70,0]} castShadow><coneGeometry args={[.065,.17,12]}/><meshStandardMaterial color={id==='hot'?'#b93523':'#f5e5c6'} roughness={.5}/></mesh>
  <RoundedBox args={[.33,.18,.018]} position={[0,.19,.184]} radius={.025} smoothness={2}><meshStandardMaterial color="#fff5db" roughness={.85}/></RoundedBox>
  <mesh position={[0,.19,.20]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.055,.055,.009,12]}/><meshStandardMaterial color={color}/></mesh>
  {id==='hot'&&<group position={[.07,.19,.21]} rotation={[0,0,-.6]}>
   <mesh scale={[.038,.08,.018]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#e12f22"/></mesh>
   <mesh position={[0,.09,0]}><cylinderGeometry args={[.008,.008,.035,6]}/><meshStandardMaterial color="#4d762f"/></mesh>
  </group>}
 </group>;
}
function IngredientTray({id,x,z=trayLayout.z,active,lifted=false,onIngredientPick}:{id:IngredientId;x:number;z?:number;active:boolean;lifted?:boolean;onIngredientPick?:IngredientPick}){
 const gl=useThree(state=>state.gl),invalidate=useThree(state=>state.invalidate);const root=useRef<THREE.Group>(null!),body=useRef<THREE.Group>(null!),material=useRef<THREE.MeshStandardMaterial>(null!);
 const feedback=useRef<gsap.core.Timeline|null>(null);
 const dragged=useRef(false);
 const pointerStart=useRef({x:0,y:0});
 useEffect(()=>{if(!active)gl.domElement.style.cursor='';return()=>{gl.domElement.style.cursor='';feedback.current?.kill();body.current?.scale.set(1,1,1);if(material.current)material.current.emissiveIntensity=0}},[active,gl]);
 return <group ref={root} position={[x,0,z]} visible={!lifted} name={'ingredient-tray-'+id}
  userData={{ingredientId:id,ingredientName:findIngredient(id)?.name}}
  onPointerDown={active?event=>{
   dragged.current=false;
   pointerStart.current={x:event.clientX,y:event.clientY};
  }:undefined}
  onPointerMove={active?event=>{
   if(event.buttons&&Math.hypot(event.clientX-pointerStart.current.x,event.clientY-pointerStart.current.y)>6){
    dragged.current=true;
   }
  }:undefined}
  onPointerCancel={active?()=>{dragged.current=true}:undefined}
  onPointerOver={active?event=>{event.stopPropagation();gl.domElement.style.cursor='pointer'}:undefined}
  onPointerOut={active?()=>{gl.domElement.style.cursor=''}:undefined}
  onClick={active?event=>{
   if(!root.current.visible)return;
   event.stopPropagation();
   if(dragged.current||event.delta>6)return;
   const origin=root.current.getWorldPosition(new THREE.Vector3());
   if(!isSauceId(id)){
    feedback.current?.kill();body.current.scale.set(1,1,1);material.current.emissiveIntensity=0;
    feedback.current=gsap.timeline({onUpdate:invalidate}).to(body.current.scale,{y:.84,duration:.1,repeat:1,yoyo:true},0).to(material.current,{emissiveIntensity:.55,duration:.16,repeat:1,yoyo:true},0);
   }
   onIngredientPick?.(id,[origin.x,origin.y+(isSauceId(id)?0:.055),origin.z]);
  }:undefined}>
  <group ref={body}>
   {isSauceId(id)?<group scale={sauceBottleScale}><SauceBottle id={id} material={material}/></group>:<group scale={[1.16,1.1,1.16]}>
   <RoundedBox args={[trayLayout.width,.15,trayLayout.depth]} radius={.045} smoothness={2} position={[0,-.08,0]} receiveShadow><meshStandardMaterial ref={material} color="#ddd9c5" emissive="#e8bd42" emissiveIntensity={0} metalness={.25} roughness={.55}/></RoundedBox>
   <RoundedBox args={[.88,.025,.78]} radius={.035} smoothness={2} position={[0,.002,0]}>
    <meshStandardMaterial color={trayLiners[id as keyof typeof trayLiners]??(id==='beef'||id==='beans'||id==='mushroom'?'#ddd6c6':'#626a6c')} roughness={.88}/>
   </RoundedBox>
   <PantryFood id={id}/>
   </group>}
  </group>
  {active&&<mesh position={[0,isSauceId(id)?.42:.22,.05]}><boxGeometry args={isSauceId(id)?[1.08,1.32,1.05]:[1.22,.8,1.16]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>}
 </group>;
}
function IngredientTrays({active,onIngredientPick,availableIngredientIds,stationView={foodPage:0,saucePage:0,slots:5},liftedSauces}:{active:boolean;onIngredientPick?:IngredientPick;availableIngredientIds?:readonly IngredientId[];stationView?:StationView;liftedSauces:ReadonlyMap<IngredientId,number>}){
 const shown=stationPage(stationFoodIds,availableIngredientIds,stationView.foodPage,stationView.slots).ids;
 const sauces=stationPage(stationSauceIds,availableIngredientIds,stationView.saucePage,stationView.slots).ids;
 return <group>
  {shown.map((id,i)=><IngredientTray key={id} id={id} x={centeredSlot(i,shown.length,trayLayout.spacing)} active={active&&!!onIngredientPick} onIngredientPick={onIngredientPick}/>)}
  {sauces.map((id,i)=><IngredientTray key={id} id={id} x={centeredSlot(i,sauces.length,1.1)} z={sauceStation.z} lifted={liftedSauces.has(id)} active={active&&!!onIngredientPick&&!liftedSauces.has(id)} onIngredientPick={onIngredientPick}/>)}
 </group>;
}
function KitchenProps({active,onIngredientPick,availableIngredientIds,stationView,chickenCutKey,liftedSauces,onSound}:{active:boolean;onIngredientPick?:IngredientPick;availableIngredientIds?:readonly IngredientId[];stationView?:StationView;chickenCutKey?:number;liftedSauces:ReadonlyMap<IngredientId,number>;onSound?:SceneSound}){return <group>
 <ShawarmaInterior onSound={onSound} active={active} chickenCutKey={chickenCutKey} chickenAvailable={availableIngredientIds===undefined||availableIngredientIds.includes('chicken')} onChickenPick={()=>onIngredientPick?.('chicken',[...rotisserieLayout.cutPoint])}/>
 <mesh position={[0,-.106,0]}>
  <boxGeometry args={[5.4,.098,4.03]}/><meshStandardMaterial color="#76532f"/>
 </mesh>
 <RoundedBox args={[5.7,.28,4.25]} position={[0,.08,0]} radius={.1} castShadow receiveShadow><meshStandardMaterial color="#ba8047" roughness={.85}/></RoundedBox>
 <RoundedBox args={[5.48,.075,4.03]} position={[0,.247,0]} radius={.025} receiveShadow><meshStandardMaterial color="#dba768" roughness={.85}/></RoundedBox>
 {Array.from({length:12},(_,i)=><mesh key={i} position={[-2.45+i*.44,.289,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.009,3.75]}/><meshStandardMaterial color="#a8733d" transparent opacity={.18}/></mesh>)}
 <IngredientTrays active={active} onIngredientPick={onIngredientPick} availableIngredientIds={availableIngredientIds} stationView={stationView} liftedSauces={liftedSauces}/>
 </group>}
function ContactGrill({root,lid,heating,enabled}:{enabled:boolean;root:React.RefObject<THREE.Group>;lid:React.RefObject<THREE.Group>;heating:boolean}){
 return <group ref={root} position={[grillLayout.x,grillLayout.y,grillLayout.z]} visible={enabled}>
 <RoundedBox args={[grillLayout.width,.35,3.4]} radius={.12} position={[0,.18,0]} castShadow><meshStandardMaterial color="#3c4944" metalness={.45} roughness={.35}/></RoundedBox>
 <RoundedBox args={[grillLayout.plateWidth,.12,3.16]} radius={.04} position={[0,.42,0]}><meshStandardMaterial color="#242d2b" metalness={.3} roughness={.6}/></RoundedBox>
 {Array.from({length:12},(_,i)=><RoundedBox key={i} args={[grillLayout.ribWidth,.045,.065]} radius={.015} position={[0,.5,-1.4+i*.25]}><meshStandardMaterial color="#55605a" metalness={.45}/></RoundedBox>)}
 <group ref={lid} position={[0,grillLayout.hingeY,grillLayout.hingeZ]} rotation={[grillLayout.openAngle,0,0]}>
 <RoundedBox args={[grillLayout.width,.24,3.4]} radius={.1} position={[0,.1,1.6]} castShadow><meshStandardMaterial color="#89928b" metalness={.6} roughness={.3}/></RoundedBox>
 <RoundedBox args={[grillLayout.plateWidth,.07,3.15]} radius={.025} position={[0,-.06,1.6]}><meshStandardMaterial color="#29332e" metalness={.45}/></RoundedBox>
 {Array.from({length:12},(_,i)=><RoundedBox key={i} args={[grillLayout.ribWidth,.04,.065]} radius={.01} position={[0,-.11,.2+i*.25]}><meshStandardMaterial color="#657065" metalness={.45}/></RoundedBox>)}
 <RoundedBox args={[2.8,.16,.18]} radius={.06} position={[0,.4,3.3]} castShadow><meshStandardMaterial color="#303c35"/></RoundedBox>
 {[-1.2,1.2].map(x=><RoundedBox key={x} args={[.09,.35,.1]} radius={.025} position={[x,.25,3.3]}><meshStandardMaterial color="#778175" metalness={.5}/></RoundedBox>)}
 </group>
 <mesh position={[1.45,.25,1.71]}><sphereGeometry args={[.055,12,8]}/><meshStandardMaterial color={heating?'#ff903b':'#8ca567'} emissive={heating?'#ff6a10':'#54743e'} emissiveIntensity={heating?2:.2}/></mesh>
 {heating&&<Steam/>}
 </group>
}
function Steam(){const ref=useRef<THREE.InstancedMesh>(null!);const dummy=useMemo(()=>new THREE.Object3D(),[]);useFrame(({clock})=>{for(let i=0;i<9;i++){const q=(clock.elapsedTime*.45+i/9)%1;dummy.position.set(Math.sin(i*2.4)*.8+Math.sin(q*5+i)*.1,1.6+q*1.4,Math.cos(i*2.4)*1.1);dummy.scale.setScalar(Math.sin(q*Math.PI)*.13);dummy.updateMatrix();ref.current.setMatrixAt(i,dummy.matrix)}ref.current.instanceMatrix.needsUpdate=true});return <instancedMesh ref={ref} args={[undefined,undefined,9]}><sphereGeometry args={[1,8,6]}/><meshBasicMaterial color="#fff6df" transparent opacity={.22} depthWrite={false}/></instancedMesh>}
function BreadUndoTarget({enabled,onUndo,children}:{enabled:boolean;onUndo?:()=>void;children:React.ReactNode}){
 const gesture=useRef<{x:number;y:number;pointerId:number;dragged:boolean}|null>(null);
 const canvas=useThree(state=>state.gl.domElement);
 useEffect(()=>{
  gesture.current=null;
  if(!enabled)return;
  const pointers=new Set<number>();
  const down=(event:PointerEvent)=>{
   if(pointers.size===0)gesture.current={x:event.clientX,y:event.clientY,pointerId:event.pointerId,dragged:event.button!==0};
   pointers.add(event.pointerId);
   if(pointers.size>1&&gesture.current)gesture.current.dragged=true;
  };
  const move=(event:PointerEvent)=>{
   const current=gesture.current;
   if(current&&current.pointerId===event.pointerId&&Math.hypot(event.clientX-current.x,event.clientY-current.y)>6)current.dragged=true;
  };
  const up=(event:PointerEvent)=>{move(event);pointers.delete(event.pointerId)};
  const cancel=(event:PointerEvent)=>{pointers.delete(event.pointerId);gesture.current=null};
  canvas.addEventListener('pointerdown',down,true);
  canvas.addEventListener('pointermove',move,true);
  canvas.addEventListener('pointerup',up,true);
  canvas.addEventListener('pointercancel',cancel,true);
  return()=>{
   canvas.removeEventListener('pointerdown',down,true);
   canvas.removeEventListener('pointermove',move,true);
   canvas.removeEventListener('pointerup',up,true);
   canvas.removeEventListener('pointercancel',cancel,true);
   gesture.current=null;
  };
 },[canvas,enabled]);
 return <group name="shawarma-undo-target" onClick={enabled?event=>{
  const current=gesture.current;
  gesture.current=null;
  if(!current||current.dragged||event.delta>6)return;
  event.stopPropagation();
  onUndo?.();
 }:undefined}>{children}</group>;
}
function World({batches,animateRecipe=false,recipeBatches,phase,inspect,grill,onStage,onReady,onSound,shawarmaQuantity=1,onIngredientPick,availableIngredientIds,stationView,servingOrder,onServed,compact,shadowSize,reduceQuality,onCutActiveChange,liftSauce,liftedSauces,onLatestIngredient,onUndoLastIngredient}:WorldProps&{compact:boolean;shadowSize:number;reduceQuality:()=>void;onCutActiveChange?:(active:boolean)=>void;liftSauce:LiftSauce;liftedSauces:ReadonlyMap<IngredientId,number>;onLatestIngredient:(id:IngredientId|undefined)=>void}){
 const dish=useRef<THREE.Group>(null!),filling=useRef<THREE.Group>(null!),grillRoot=useRef<THREE.Group>(null!),lid=useRef<THREE.Group>(null!);const [wrapped,setWrapped]=useState(false),[heating,setHeating]=useState(false),[toasted,setToasted]=useState(false);const callbacks=useRef({onStage,onReady,onServed,onSound});callbacks.current={onStage,onReady,onServed,onSound};const p=useRef({value:0});
 const camera=useThree(state=>state.camera),invalidate=useThree(state=>state.invalidate),size=useThree(state=>state.size);
 const controls=useRef<React.ComponentRef<typeof OrbitControls>>(null);
 const tray=useRef<THREE.Group>(null!);
 const workBatch=useRef<THREE.Group>(null!);
 const orderId=servingOrder?.id;
 const hasServingOrder=orderId!==undefined;
 const finishCookMetrics=useCookPerformance(phase==='folding'&&!hasServingOrder,shawarmaQuantity,compact,reduceQuality);
 const servingQuantity=servingOrder?.shawarmaQuantity??0;
 const batchQuantity=hasServingOrder?servingQuantity:shawarmaQuantity;
 const showWorkBatch=shawarmaQuantity>1&&phase!=='build'&&!hasServingOrder;
 const trayRollCenter=servingOrder?.extras.some(extra=>extra.quantity>0)?servingLayout.rollCenterX:0;
 const trayStartX=servingQuantity>1&&!grill?batchRollLayout.stagingX-trayRollCenter:0;
 const texture=useMemo(()=>breadTexture(toasted),[toasted]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 const [activeRecipeIndex,setActiveRecipeIndex]=useState(0);
 // Snapshots share one detailed model. Parked rolls keep their own recipe colors.
 const rollLayers=useMemo(()=>Array.from({length:Math.max(1,batchQuantity)},(_,i)=>
  denseLayers(recipeBatches?.[i]??batches)),[batchQuantity,recipeBatches,batches]);
 const rollColors=useMemo(()=>rollLayers.map(layers=>layers.map(batch=>
  findIngredient(batch.id)?.color??'#dcb06a')),[rollLayers]);
 const layers=rollLayers[activeRecipeIndex]??rollLayers[0];
 const [arrivedId,setArrivedId]=useState<number>();
 const arrived=hasServingOrder&&orderId===arrivedId;
 const view=useRef({size,inspect});useLayoutEffect(()=>{view.current={size,inspect}},[size,inspect]);
 const mobileBuild=size.width<=650;
 const activeUntil=useRef(0);
 const [recipeCount,setRecipeCount]=useState(1);
 const assemblingRecipe=animateRecipe&&phase==='build'&&!hasServingOrder;
 const animationLayers=useMemo(()=>layers.map(batch=>({
  ...batch,settled:false,
  source:batch.id==='chicken'?[...rotisserieLayout.cutPoint] as [number,number,number]:batch.source,
 })),[layers]);
 const recipeAnimationPending=assemblingRecipe&&recipeCount<=layers.length;
 const visibleLayers=assemblingRecipe?animationLayers.slice(0,recipeCount):layers;
 const advanceRecipe=useCallback((key:number)=>{
  setRecipeCount(current=>layers[current-1]?.key===key?current+1:current);
 },[layers]);
 useEffect(()=>{
  if(assemblingRecipe){activeUntil.current=performance.now()+4500;invalidate()}
 },[assemblingRecipe,recipeCount,invalidate]);
 const latestIngredient=assemblingRecipe
  ?visibleLayers.at(-1)?.id
  :latestManualBatch(batches)?.id;
 useEffect(()=>{onLatestIngredient(latestIngredient)},[latestIngredient,onLatestIngredient]);
 const settledPreview=phase==='build'&&!recipeAnimationPending&&batches.every(batch=>batch.settled);

 useEffect(()=>{activeUntil.current=performance.now()+(phase==='folding'?15000:phase==='ready'?8000:4500);invalidate()},[batches,phase,inspect,invalidate]);
 useLayoutEffect(()=>{if(phase!=='build'||hasServingOrder)return;
 setWrapped(false);setHeating(false);setToasted(false);setActiveRecipeIndex(0);p.current.value=0;
 dish.current.position.set(0,0,0);dish.current.rotation.set(0,0,0);dish.current.scale.setScalar(1);dish.current.visible=true;
 filling.current.position.set(0,0,0);filling.current.scale.set(1,1,1);
 lid.current.rotation.x=grillLayout.openAngle;
 camera.position.set(...(mobileBuild?mobileKitchenCamera:kitchenCamera));
 controls.current?.target.set(...(mobileBuild?mobileKitchenTarget:kitchenTarget));
 controls.current?.update();invalidate();
 },[phase,hasServingOrder,camera,invalidate,mobileBuild]);
 useEffect(()=>{
  if(hasServingOrder||settledPreview)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const tick=()=>{
   timer=undefined;
   if(document.hidden||(phase!=='folding'&&!recipeAnimationPending&&performance.now()>=activeUntil.current))return;
   invalidate();timer=setTimeout(tick,1000/(compact?30:60));
  };
  const visible=()=>{
   if(timer!==undefined){clearTimeout(timer);timer=undefined}
   if(!document.hidden){activeUntil.current=performance.now()+4500;tick()}
  };
  tick();document.addEventListener('visibilitychange',visible);
  return()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',visible)};
 },[compact,invalidate,phase,batches,inspect,hasServingOrder,recipeAnimationPending,settledPreview]);
 useFrame((_,delta)=>{
  if(phase==='ready'&&!hasServingOrder&&shawarmaQuantity===1&&performance.now()<activeUntil.current){
   dish.current.rotation.y+=Math.min(delta,.05)*.22;
  }
 });
 useLayoutEffect(()=>{
  if(phase!=='folding'||hasServingOrder)return;
  const multiple=shawarmaQuantity>1;
  const activeRoll=dish.current;
  const fillingGroup=filling.current;
  const cargo=multiple?workBatch.current:activeRoll;
  const target=controls.current?.target??new THREE.Vector3(...kitchenTarget);
  const viewStart=camera.position.clone(),targetStart=target.clone();
  const focus=new THREE.Vector3(0,.54,0),cameraGoal=new THREE.Vector3();
  const shot={blend:0};
  const foldPause=.36;
  const rollStep=3.24+foldPause;
  const rollBottom=roll.centerY-roll.radius;
  const stagedY=batchRollLayout.boardTop-rollBottom;
  const tl=gsap.timeline({
   onComplete:()=>{finishCookMetrics();callbacks.current.onReady()},
   onUpdate:()=>{
    if(multiple){
     const {width,height}=view.current.size;
     const distance=servingCameraDistance(width,height,false,focus.y>.9?2.65:2.2)+.65;
     cameraGoal.copy(focus).addScaledVector(servingView,distance);
     target.lerpVectors(targetStart,focus,shot.blend);
     camera.position.lerpVectors(viewStart,cameraGoal,shot.blend);
    }
    camera.lookAt(target);
   },
  });

  if(multiple){
   setActiveRecipeIndex(0);
   cargo.position.set(batchRollLayout.stagingX,stagedY,0);
   for(const parked of cargo.children)parked.visible=false;
   tl.to(shot,{blend:1,duration:.38,ease:'sine.inOut'},0);
   for(let i=0;i<shawarmaQuantity;i++){
    const start=i*rollStep;
    const fold=start+foldPause;
    const anotherRoll=i+1<shawarmaQuantity;
    const parked=cargo.children[i];
    const slot=batchRollLayout.stagingX+centeredSlot(i,shawarmaQuantity,batchRollLayout.spacing);
    tl.call(()=>callbacks.current.onSound?.('fold'),[],fold+.22);
    tl.call(()=>callbacks.current.onSound?.('place'),[],fold+2.83);
    tl.call(()=>{setWrapped(false);activeRoll.visible=true;callbacks.current.onStage(`Заворачиваем шаурму ${i+1} из ${shawarmaQuantity}…`)},[],start)
     .set(p.current,{value:0},start)
     .set(activeRoll.position,{x:0,y:0,z:0},start)
     .set(fillingGroup.position,{y:0},start)
     .set(fillingGroup.scale,{x:1,y:1,z:1},start)
     .to(fillingGroup.scale,{x:fillingTransform.x,y:fillingTransform.y,z:fillingTransform.z,duration:1.15,ease:'power2.inOut'},fold+.27)
     .to(fillingGroup.position,{y:fillingTransform.offsetY,duration:1.15,ease:'power2.inOut'},fold+.27)
     .to(p.current,{value:1,duration:1.47,ease:'power2.inOut'},fold+.22)
     .call(()=>setWrapped(true),[],fold+1.69)
     .to(activeRoll.position,{y:.81,duration:.30,ease:'sine.inOut'},fold+1.69)
     .to(activeRoll.position,{x:slot,duration:.59,ease:'sine.inOut'},fold+1.96)
     .to(focus,{x:batchRollLayout.stagingX,duration:.62,ease:'sine.inOut'},fold+1.95)
     .to(activeRoll.position,{y:stagedY,duration:.28,ease:'sine.inOut'},fold+2.55)
     .call(()=>{
      activeRoll.visible=false;
      parked.visible=true;
      // Mount the next filling while the detailed roll is out of view.
      if(anotherRoll)setActiveRecipeIndex(i+1);
     },[],fold+2.83);
    if(anotherRoll)tl.to(focus,{x:0,duration:.38,ease:'sine.inOut'},fold+2.84);
   }
  }else{
   // Retain the original fold and bounce for a single roll.
   tl.call(()=>callbacks.current.onSound?.('fold'),[],.5);
   tl.call(()=>callbacks.current.onSound?.('place'),[],3.8);
   tl.to(fillingGroup.scale,{x:.8,z:.9,duration:.6,ease:'power2.inOut'},0)
    .to(p.current,{value:1,duration:2.5,ease:'power2.inOut'},.5)
    .to(fillingGroup.scale,{x:fillingTransform.x,y:fillingTransform.y,z:fillingTransform.z,duration:1.8,ease:'power2.inOut'},.6)
    .to(fillingGroup.position,{y:fillingTransform.offsetY,duration:1.8,ease:'power2.inOut'},.6)
    .to(camera.position,{x:4.8,y:6.5,z:7.4,duration:2.7,ease:'power2.inOut'},.3)
    .call(()=>setWrapped(true),[],3)
    .to(activeRoll.position,{y:.28,duration:.3,ease:'power2.out'},3)
    .to(activeRoll.position,{y:0,duration:.5,ease:'bounce.out'},3.3);
  }
  if(grill){
   const start=multiple?(shawarmaQuantity-1)*rollStep+foldPause+2.96:3.9;
   const liftedY=grillLayout.transferY;
   const grillY=grillLayout.y+(multiple?batchRollLayout.grillTop-rollBottom+batchRollLayout.grillGap:grillLayout.dishY);
   if(multiple){
    tl.to(focus,{y:1.12,duration:.65,ease:'sine.inOut'},start)
     .to(focus,{x:grillLayout.x,z:grillLayout.z,duration:.8,ease:'power2.inOut'},start+.75)
     .to(focus,{x:0,z:0,duration:.8,ease:'power2.inOut'},start+5.3)
     .to(focus,{y:.54,duration:.8,ease:'sine.inOut'},start+5.9);
   }else{
    const {width,height}=view.current.size;
    const distance=Math.max(9,3.2/(Math.tan(38*Math.PI/360)*(width/height)));
    tl.to(target,{x:grillLayout.x,y:1.5,z:grillLayout.z,duration:1,ease:'power2.inOut'},start)
     .to(target,{x:kitchenTarget[0],y:kitchenTarget[1],z:kitchenTarget[2],duration:1,ease:'power2.inOut'},start+5.7)
     .to(camera.position,{x:grillLayout.x+distance*.3,y:1.5+distance*.55,z:grillLayout.z+distance*.78,duration:1,ease:'power2.inOut'},start)
     .to(camera.position,{x:4.8,y:6.5,z:7.4,duration:1,ease:'power2.inOut'},start+5.7);
   }
   tl.call(()=>callbacks.current.onStage(multiple?'Отправляем всю партию на гриль…':'Отправляем на гриль…'),[],start)
    .to(cargo.position,{y:liftedY,duration:.4,ease:'power2.out'},start+.4)
    .to(cargo.position,{x:grillLayout.x,z:grillLayout.z,duration:.8,ease:'power2.inOut'},start+.75)
    .to(cargo.position,{y:grillY,duration:.4,ease:'power2.in'},start+1.45)
    .call(()=>{callbacks.current.onStage('Поджариваем на гриле…');callbacks.current.onSound?.('grill')},[],start+1.8)
    .to(lid.current.rotation,{x:0,duration:.65,ease:'power2.inOut'},start+1.8)
    .call(()=>setHeating(true),[],start+2.3)
    .call(()=>{setHeating(false);setToasted(true);callbacks.current.onStage('Хрустящая корочка готова!')},[],start+4.3)
    .to(lid.current.rotation,{x:grillLayout.openAngle,duration:.6,ease:'power2.inOut'},start+4.3)
    .to(cargo.position,{y:liftedY,duration:.4},start+4.95)
    .to(cargo.position,{x:0,z:0,duration:.8,ease:'power2.inOut'},start+5.3)
    .to(cargo.position,{y:multiple?stagedY:0,duration:.5,ease:'bounce.out'},start+6.1);
  }
  return watchTimeline(tl);
 },[phase,hasServingOrder,camera,grill,shawarmaQuantity,finishCookMetrics]);
 useEffect(()=>{if(phase==='ready'&&!hasServingOrder&&shawarmaQuantity===1){const tween=gsap.timeline().to(camera.position,{x:inspect?3.7:4.8,y:inspect?4.2:6.5,z:inspect?5.4:7.4,duration:1});return watchTimeline(tween)}},[inspect,phase,camera,hasServingOrder,shawarmaQuantity]);
 useLayoutEffect(()=>{
  const group=tray.current;
  if(orderId===undefined){
   group.position.set(0,0,0);
   setArrivedId(undefined);
   return;
  }
  const {startY,startZ,shelfHeight,shelfX,shelfZ,liftGap}=servingLayout;
  group.position.set(trayStartX,startY,startZ);
  const target=controls.current?.target??new THREE.Vector3(...kitchenTarget);
  const updateCamera=()=>{
   const {size:{width,height},inspect}=view.current;
   aimAtTray(target,group.position);
   camera.position.copy(target).addScaledVector(servingView,servingCameraDistance(width,height,inspect));
   camera.lookAt(target);
   invalidate();
  };
  const tl=gsap.timeline({
   onUpdate:updateCamera,
   onComplete:()=>{
    setArrivedId(orderId);
    callbacks.current.onServed?.(orderId);
   },
  });
  tl.to(group.position,{y:shelfHeight+liftGap,duration:.59,ease:'sine.inOut'},.14)
   .to(group.position,{x:shelfX,z:shelfZ,duration:.83,ease:'sine.inOut'},.73)
   .to(group.position,{y:shelfHeight,duration:.28,ease:'sine.out'},1.56);
  updateCamera();
  return watchTimeline(tl);
 },[orderId,trayStartX,camera,invalidate]);
 useLayoutEffect(()=>{
  if(!arrived||!controls.current)return;
  const target=controls.current.target;
  const nextTarget=aimAtTray(new THREE.Vector3(),tray.current.position);
  const distance=servingCameraDistance(size.width,size.height,inspect);
  const direction=camera.position.clone().sub(target).normalize();
  const nextCamera=nextTarget.clone().addScaledVector(direction,distance);
  if(camera.position.distanceToSquared(nextCamera)<1e-6)return;
  const tl=gsap.timeline({onUpdate:()=>{camera.lookAt(target);invalidate()}});
  tl.to(camera.position,{x:nextCamera.x,y:nextCamera.y,z:nextCamera.z,duration:.4,ease:'sine.inOut'},0);
  return watchTimeline(tl);
 },[arrived,camera,inspect,invalidate,size.width,size.height]);
 const rollOnTray=servingOrder?.withShawarma===true&&servingQuantity===1;
 const rollY=servingLayout.traySurface+.018-(roll.centerY-roll.radius);
 const settleFilling=phase!=='build'||hasServingOrder;
 const [cutFocus,setCutFocus]=useState(false);
 const viewedCut=useRef<number|undefined>(undefined);
 const chickenCutKey=!settleFilling?visibleLayers.find(batch=>batch.id==='chicken'&&!batch.settled)?.key:undefined;
 useEffect(()=>{
  if(chickenCutKey===undefined||viewedCut.current===chickenCutKey)return;
  viewedCut.current=chickenCutKey;
  const target=controls.current?.target;
  if(!target)return;
  setCutFocus(true);onCutActiveChange?.(true);
  const homeCamera=camera.position.clone(),homeTarget=target.clone();
  let finished=false;
  const tl=gsap.timeline({onUpdate:()=>{camera.lookAt(target);invalidate()},onComplete:()=>{finished=true;setCutFocus(false);onCutActiveChange?.(false)}});
  tl.to(camera.position,{x:rotisserieLayout.camera[0],y:rotisserieLayout.camera[1],z:rotisserieLayout.camera[2],duration:.4,ease:'sine.inOut'},0)
   .to(target,{x:rotisserieLayout.cameraTarget[0],y:rotisserieLayout.cameraTarget[1],z:rotisserieLayout.cameraTarget[2],duration:.4,ease:'sine.inOut'},0)
   .to(camera.position,{x:homeCamera.x,y:homeCamera.y,z:homeCamera.z,duration:1.1,ease:'sine.inOut'},.9)
   .to(target,{x:homeTarget.x,y:homeTarget.y,z:homeTarget.z,duration:1.1,ease:'sine.inOut'},.9);
  const stop=watchTimeline(tl);
  return()=>{stop();if(!finished){camera.position.copy(homeCamera);target.copy(homeTarget);camera.lookAt(target);invalidate()}setCutFocus(false);onCutActiveChange?.(false)};
 },[chickenCutKey,camera,invalidate,onCutActiveChange]);
 return <><color attach="background" args={['#c8c1b6']}/><fog attach="fog" args={['#c8c1b6',16,45]}/><ambientLight intensity={.76}/><hemisphereLight args={['#fff1da','#817e72',.72]}/><directionalLight key={shadowSize} position={[-3,8,5]} intensity={2.28} color="#fff7e9" castShadow shadow-mapSize={[shadowSize,shadowSize]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-.0005}/><directionalLight position={[5,4,-3]} intensity={1.12} color="#ffe7bb"/>
 <KitchenProps active={phase==='build'&&!hasServingOrder} onIngredientPick={onIngredientPick} availableIngredientIds={availableIngredientIds} stationView={stationView} chickenCutKey={chickenCutKey} liftedSauces={liftedSauces} onSound={onSound}/>
 <ContactGrill root={grillRoot} lid={lid} heating={heating} enabled={grill}/>
 <ServingShelf/>
 <PickupWindow/>
 {batchQuantity>1&&(phase!=='build'||hasServingOrder)&&
  <RoundedBox args={[batchRollLayout.stagingWidth,.25,batchRollLayout.stagingDepth]} radius={.08} smoothness={2}
   position={[batchRollLayout.stagingX,batchRollLayout.boardTop-.125,0]} receiveShadow castShadow>
   <meshStandardMaterial color="#c79460" roughness={.85}/>
  </RoundedBox>}
 {showWorkBatch&&<group ref={workBatch}>
  {Array.from({length:shawarmaQuantity},(_,i)=><group key={i} visible={false}
   position={[centeredSlot(i,shawarmaQuantity,batchRollLayout.spacing),0,0]}>
   <BatchRoll texture={texture} colors={rollColors[i]}/>
  </group>)}
 </group>}
 <group ref={tray}>
  {servingOrder&&<ServingTray order={servingOrder}/>}
  {servingQuantity>1&&Array.from({length:servingQuantity},(_,i)=><group key={i}
   position={[
    trayRollCenter+centeredSlot(i,servingQuantity,batchRollLayout.spacing),
    rollY,0,
   ]}>
   <BatchRoll texture={texture} colors={rollColors[i]}/>
  </group>)}
  {(!hasServingOrder||rollOnTray)&&<group position={rollOnTray?[trayRollCenter,rollY,0]:[0,0,0]}>
   <group ref={dish}>
    <BreadUndoTarget enabled={phase==='build'&&!hasServingOrder&&!wrapped&&!!onUndoLastIngredient} onUndo={onUndoLastIngredient}>
    <Bread progress={p} texture={texture}/>
    <group ref={filling} visible={!wrapped}>
     {visibleLayers.map(b=><group key={activeRecipeIndex+':'+b.key}>
      {isSauceId(b.id)?<Sauce onSound={onSound} batch={b} settle={settleFilling} liftSauce={liftSauce} onComplete={assemblingRecipe?()=>advanceRecipe(b.key):undefined}/>:b.id==='cheese'?<CheeseRain onSound={onSound} batch={b} settle={settleFilling} onComplete={assemblingRecipe?()=>advanceRecipe(b.key):undefined}/>:
       Array.from({length:ingredientPieceCount(b.id)},(_,i)=><FallingPiece key={i} onSound={onSound} batch={b} index={i} settle={settleFilling} onComplete={assemblingRecipe&&i===ingredientPieceCount(b.id)-1?()=>advanceRecipe(b.key):undefined}/>)}
     </group>)}
    </group>
    {wrapped&&<>
     {phase==='ready'&&!hasServingOrder&&<Sparkles celebrate/>}
     {[-1,1].map(side=><group key={side} position={[0,roll.centerY,side*endcap.z]}>
      <mesh><circleGeometry args={[endcap.radius,32]}/><meshStandardMaterial color="#d2ab68" side={THREE.DoubleSide}/></mesh>
      <group position={[0,0,side*endcap.outward]} rotation={[side*Math.PI/2,0,0]}>
       {layers.map((b,i)=><group key={activeRecipeIndex+':'+b.key} scale={endcap.scale} position={endPosition(i,layers.length)}>
        <Food kind={b.id} variant={i}/>
       </group>)}
      </group>
     </group>)}
    </>}
    </BreadUndoTarget>
   </group>
  </group>}
 </group>
 <OrbitControls ref={controls} makeDefault target={kitchenTarget} enablePan={false} enableDamping minDistance={5} maxDistance={phase==='folding'||hasServingOrder?32:14} minPolarAngle={.35} maxPolarAngle={1.1} minAzimuthAngle={-.65} maxAzimuthAngle={.95} enabled={!cutFocus&&phase!=='folding'&&(!hasServingOrder||arrived)}/></>
}
export default function Scene({onUnavailable,onAvailable,onReady,onServed,preparing,ingredientNames,onUndoLastIngredient,...worldProps}:WorldProps&{onUnavailable?:()=>void;onAvailable?:()=>void;preparing?:boolean;ingredientNames?:ReadonlyMap<IngredientId,string>;onUndoLastIngredient?:()=>void}){
 const unavailable=useRef(onUnavailable);unavailable.current=onUnavailable;
 const available=useRef(onAvailable);available.current=onAvailable;
 const reported=useRef(false);
 const [renderer,setRenderer]=useState<THREE.WebGLRenderer|null>(null);
 const [contextLost,setContextLost]=useState(false);
 const [cutting,setCutting]=useState(false);
 const [latestIngredient,setLatestIngredient]=useState<IngredientId>();
 const latestItem=findIngredient(latestIngredient);
 const [compact,setCompact]=useState(()=>matchMedia('(max-width: 720px)').matches);
 const [strained,setStrained]=useState(false);
 const reduceQuality=useCallback(()=>setStrained(true),[]);
 const shadowSize=compact?(strained?256:512):(strained?512:1024);
 // Use extra pixels when viewing the food. Keep the original budget during cooking.
 const mobileDpr=strained?.9:preparing?1:1.25;
 const maxDpr=compact?mobileDpr:(strained?1.2:1.75);
 const dpr=Math.min(window.devicePixelRatio,maxDpr);
 const qaWebgl=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('qa')==='webgl';
 const [foodPage,setFoodPage]=useState(0);
 const [saucePage,setSaucePage]=useState(0);
 const stationSlots=compact?3:5;
 const foodStation=stationPage(stationFoodIds,worldProps.availableIngredientIds,foodPage,stationSlots);
 const sauceStationPage=stationPage(stationSauceIds,worldProps.availableIngredientIds,saucePage,stationSlots);
 const [liftedSauces,setLiftedSauces]=useState<ReadonlyMap<IngredientId,number>>(()=>new Map());
 const sauceShelf=useRef({available:worldProps.availableIngredientIds,slots:stationSlots});
 sauceShelf.current={available:worldProps.availableIngredientIds,slots:stationSlots};
 const liftSauce=useCallback<LiftSauce>((id,key)=>{
  const {available,slots}=sauceShelf.current;
  const ids=[...stationSauceIds,...registeredCustomIngredients().filter(item=>item.category==='sauce').map(item=>item.id)].filter(item=>available===undefined||available.includes(item));
  const index=ids.indexOf(id);
  const page=Math.max(0,Math.floor(index/slots));
  const items=stationPage(ids,undefined,page,slots).ids;
  const x=index<0?0:centeredSlot(items.indexOf(id),items.length,1.1);

  if(index>=0)setSaucePage(page);
  setLiftedSauces(current=>new Map(current).set(id,key));
  return {source:[x,0,sauceStation.z],putBack:()=>{
   setLiftedSauces(current=>{
    if(current.get(id)!==key)return current;
    const next=new Map(current);
    next.delete(id);
    return next;
   });
  }};
 },[]);
 const [focusedTray,setFocusedTray]=useState<IngredientId>();
 const traySelectionEnabled=worldProps.phase==='build'&&!worldProps.servingOrder&&!contextLost;
 const accessibleTrays=[...trayIds,...registeredCustomIngredients().map(item=>item.id)].filter(id=>
  worldProps.availableIngredientIds===undefined||worldProps.availableIngredientIds.includes(id));
 useEffect(()=>{if(!traySelectionEnabled)setFocusedTray(undefined)},[traySelectionEnabled]);
 const recovery=useRef<WEBGL_lose_context|null>(null);
 const redraw=useRef<()=>void>(()=>{});
 useEffect(()=>{
  const media=matchMedia('(max-width: 720px)');
  const changed=()=>setCompact(media.matches);
  media.addEventListener('change',changed);
  changed();
  return()=>media.removeEventListener('change',changed);
 },[]);
 useLayoutEffect(()=>{
  if(!renderer)return;
  const data=renderer.domElement.dataset;
  data.renderDpr=String(dpr);
  data.shadowMapSize=String(shadowSize);
  data.renderQuality=[compact?'mobile':'desktop',strained?'reduced':'standard'].join('-');
 },[compact,dpr,renderer,shadowSize,strained]);
 useEffect(()=>{
  if(!renderer)return;
  const canvas=renderer.domElement;
  const lost=(event:Event)=>{event.preventDefault();setContextLost(true);if(!reported.current){reported.current=true;unavailable.current?.()}canvas.setAttribute('aria-label','3D временно недоступно. Каталог ингредиентов доступен ниже.')};
  const restored=()=>{recovery.current=renderer.getContext().getExtension('WEBGL_lose_context');reported.current=false;setContextLost(false);canvas.setAttribute('aria-label','Кухня SHAWARMA CRAFT 3D');redraw.current();available.current?.()};
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  return()=>{canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored)};
 },[renderer]);
 return <div className="ingredient-scene" role="group" aria-label="3D-кухня и лотки ингредиентов" style={{position:'relative',width:'100%',height:'100%'}}>
  <Canvas className="kitchen-canvas" frameloop="demand" shadows camera={{position:kitchenCamera,fov:38}} dpr={dpr} gl={{antialias:true,powerPreference:'low-power'}} onCreated={({gl,invalidate})=>{recovery.current=gl.getContext().getExtension('WEBGL_lose_context');redraw.current=invalidate;setRenderer(gl);invalidate();available.current?.()}} fallback="3D недоступно. Каталог ингредиентов остаётся доступен. Для 3D включите WebGL и попробуйте собрать заново.">
   {!contextLost&&<World {...worldProps} onUndoLastIngredient={onUndoLastIngredient} stationView={{foodPage:foodStation.page,saucePage:sauceStationPage.page,slots:stationSlots}} onCutActiveChange={setCutting} onLatestIngredient={setLatestIngredient} liftSauce={liftSauce} liftedSauces={liftedSauces} compact={compact} shadowSize={shadowSize} reduceQuality={reduceQuality} onReady={()=>{if(!reported.current)onReady()}} onServed={id=>{if(!reported.current)onServed?.(id)}}/>}
  </Canvas>
  <div className="scene-last-ingredient" role="status" aria-atomic="true">
   {traySelectionEnabled&&latestItem&&<>
    <span aria-hidden="true">{latestItem.emoji}</span>
    <span><small>Последняя начинка</small><strong>{ingredientNames?.get(latestItem.id)??latestItem.name}</strong></span>
    {onUndoLastIngredient&&<button type="button" onClick={onUndoLastIngredient} aria-label="Отменить добавление последней начинки">↶</button>}
   </>}
  </div>
  {worldProps.onIngredientPick&&traySelectionEnabled&&!cutting&&<nav aria-label="Полки 3D-кухни" className="station-navigation">
   {!worldProps.batches.some(batch=>batch.id==='chicken')&&(worldProps.availableIngredientIds===undefined||worldProps.availableIngredientIds.includes('chicken'))&&<button type="button" className="rotisserie-pick" aria-label="Добавить курицу с вертела" onClick={()=>worldProps.onIngredientPick?.('chicken')}>Срезать мясо с вертела</button>}
   {[{title:'Начинки',data:foodStation,change:setFoodPage},{title:'Соусы',data:sauceStationPage,change:setSaucePage}].map(({title,data,change})=><div key={title}>
    <span>{title} <small>{data.total?`${data.page+1}/${data.pages}`:'нет в наличии'}</small></span>
    <button type="button" aria-label={`Предыдущая полка: ${title}`} disabled={(title==='Соусы'&&liftedSauces.size>0)||data.page===0} onClick={()=>change(data.page-1)}>←</button>
    <button type="button" aria-label={`Следующая полка: ${title}`} disabled={(title==='Соусы'&&liftedSauces.size>0)||data.page===data.pages-1} onClick={()=>change(data.page+1)}>→</button>
   </div>)}
  </nav>}
  {worldProps.onIngredientPick&&accessibleTrays.map(id=><button key={id} type="button"
   disabled={!traySelectionEnabled}
   onFocus={()=>setFocusedTray(id)} onBlur={()=>setFocusedTray(undefined)}
   onClick={()=>{if(traySelectionEnabled)worldProps.onIngredientPick?.(id)}}
   style={focusedTray===id?{
    position:'absolute',zIndex:4,left:8,right:8,bottom:42,minHeight:44,padding:'8px 12px',
    border:'2px solid #405b3d',borderRadius:8,background:'#fff7e9',color:'#293d32',fontSize:14,
   }:{
    position:'absolute',width:1,height:1,padding:0,border:0,overflow:'hidden',
    clipPath:'inset(50%)',whiteSpace:'nowrap',
   }}>
   Добавить {findIngredient(id)?.name??id}
  </button>)}
  {qaWebgl&&renderer&&!contextLost&&<button type="button" disabled={!recovery.current}
   onClick={()=>recovery.current?.loseContext()}
   style={{position:'absolute',zIndex:4,bottom:36,right:12,padding:'6px 10px',borderRadius:8,border:'1px solid #879a6b',background:'#fffdf5',fontSize:11}}>
   Имитировать потерю 3D
  </button>}
  {contextLost&&<div role="alert" style={{position:'absolute',inset:0,zIndex:5,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24,textAlign:'center',background:'#f6f3eaf5',color:'#293d32'}}>
   <strong>3D временно недоступно</strong>
   <p style={{margin:0,maxWidth:340,fontSize:14}}>Каталог ингредиентов остаётся доступен. Попробуйте восстановить сцену. Если это не поможет, перезагрузите страницу — состав вернётся к начальному.</p>
   {recovery.current&&<button type="button" onClick={()=>recovery.current?.restoreContext()} style={{padding:'10px 16px',borderRadius:16,border:'1px solid #879a6b',background:'#e6ebd8'}}>Восстановить 3D</button>}
   <button type="button" onClick={()=>window.location.reload()} style={{padding:'10px 16px',borderRadius:16,border:'1px solid #cbd6b4',background:'#fffdf5'}}>Перезагрузить страницу</button>
  </div>}
 </div>
}
