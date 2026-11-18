import {useEffect,useMemo,useRef,useState} from 'react';
import {useThree} from '@react-three/fiber';
import {RoundedBox,useCursor} from '@react-three/drei';
import {Color,ExtrudeGeometry,Float32BufferAttribute,type Group,LatheGeometry,Shape,ShapeGeometry,Vector2} from 'three';
import gsap from 'gsap';
import {rotisserieLayout} from './sceneLayout';

const metal='#929b98';
const charcoal='#454c48';
const meatLayers=[
 [0,.34],[.245,.34],[.35,.43],[.38,.58],[.41,.65],[.39,.71],
 [.445,.82],[.42,.89],[.472,1.02],[.45,1.10],[.49,1.24],[.46,1.30],
 [.495,1.43],[.47,1.51],[.487,1.63],[.46,1.72],[.405,1.84],
 [.43,1.89],[.365,2.02],[.31,2.07],[0,2.1],
].map(([radius,height])=>new Vector2(radius,height));


export type RotisserieProps={
 cutKey?:number;
 active:boolean;
 available:boolean;
 onPick?:()=>void;
 onSound?:(kind:string)=>void;
};
export default function Rotisserie({cutKey,active,available,onPick,onSound}:RotisserieProps){
 const knifeGeometry=useMemo(()=>{
  const profile=new Shape();
  profile.moveTo(.07,.3);
  profile.lineTo(-.09,.3);
  profile.lineTo(-.09,-.12);
  profile.quadraticCurveTo(-.08,-.3,.07,-.39);
  profile.closePath();
  const blade=new ExtrudeGeometry(profile,{
   depth:.018,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,curveSegments:10,
  });
  blade.translate(0,0,-.009);
  const bevel=new Shape();
  bevel.moveTo(-.09,.28);
  bevel.lineTo(-.09,-.12);
  bevel.quadraticCurveTo(-.08,-.3,.07,-.39);
  bevel.quadraticCurveTo(-.055,-.285,-.065,-.115);
  bevel.lineTo(-.065,.28);
  bevel.closePath();
  return {blade,edge:new ShapeGeometry(bevel,10)};
 },[]);
 useEffect(()=>()=>{knifeGeometry.blade.dispose();knifeGeometry.edge.dispose()},[knifeGeometry]);
 const meatGeometry=useMemo(()=>{
  const geometry=new LatheGeometry(meatLayers,23);
  const vertices=geometry.attributes.position;
  const colors:number[]=[];
  const golden=new Color('#edb460'),crust=new Color('#87431f'),color=new Color();
  for(let i=0;i<vertices.count;i++){
   const y=vertices.getY(i);
   const layer=meatLayers.findIndex(point=>Math.abs(point.y-y)<.0001);
   const grain=Math.sin(vertices.getX(i)*71+vertices.getZ(i)*93+y*13);
   const toasted=(layer%2===0 ? .56 : .17)+grain*.09;
   color.copy(golden).lerp(crust,toasted);
   colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  return geometry;
 },[]);
 useEffect(()=>()=>meatGeometry.dispose(),[meatGeometry]);
 const playSound=useRef(onSound);playSound.current=onSound;
 const meat=useRef<Group>(null);
 const knife=useRef<Group>(null);
 const lastCut=useRef<number|undefined>(undefined);
 const pointerStart=useRef<{x:number;y:number;id:number}|null>(null);
 const dragged=useRef(false);
 const invalidate=useThree(state=>state.invalidate);
 const [hovered,setHovered]=useState(false);
 const pickable=active&&available&&!!onPick;
 useCursor(hovered&&pickable);
 useEffect(()=>{
  if(!pickable)setHovered(false);
  return ()=>{
   pointerStart.current=null;
   dragged.current=true;
   setHovered(false);
  };
 },[pickable]);
 useEffect(()=>{
  if(cutKey===undefined||!Number.isFinite(cutKey)||cutKey===lastCut.current)return;
  lastCut.current=cutKey;
  if(!available||!meat.current||!knife.current)return;
  const body=meat.current,blade=knife.current;
  const startRotation=body.rotation.y;
  blade.visible=true;
  blade.position.set(0,2.05,.59);
  blade.rotation.set(0,0,-.12);
  const timeline=gsap.timeline({
   onUpdate:invalidate,
   onComplete:()=>{blade.visible=false;invalidate()},
  });
  timeline.to(body.rotation,{y:startRotation+.32,duration:.35,ease:'sine.inOut'},0);
  // The first downward pass reaches the pickup point around 0.55 seconds.
  for(let stroke=0;stroke<3;stroke++){
   const start=.15+stroke*.52;
   timeline.call(()=>playSound.current?.('cut'),[],start);
   timeline.to(blade.position,{y:.9,duration:.4,ease:'sine.inOut'},start)
    .to(blade.rotation,{z:.04,duration:.4,ease:'sine.inOut'},start)
    .to(blade.position,{y:2.05,duration:.12,ease:'sine.out'},start+.4);
  }
  timeline.to(blade.position,{x:.22,duration:.09},1.71);
  const visibility=()=>{if(document.hidden)timeline.pause();else timeline.resume()};
  document.addEventListener('visibilitychange',visibility);
  visibility();
  invalidate();
  return ()=>{
   document.removeEventListener('visibilitychange',visibility);
   timeline.kill();
   blade.visible=false;
   invalidate();
  };
 },[cutKey,available,invalidate]);
 return <group position={rotisserieLayout.position}
  userData={{ingredientId:'chicken',label:'Курица на вертеле',available}}
  onPointerDown={event=>{
   if(!pickable)return;
   dragged.current=false;
   pointerStart.current={x:event.clientX,y:event.clientY,id:event.pointerId};
  }}
  onPointerMove={event=>{
   const start=pointerStart.current;
   if(!start||start.id!==event.pointerId)return;
   if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)dragged.current=true;
  }}
  onPointerCancel={()=>{
   dragged.current=true;
   pointerStart.current=null;
   setHovered(false);
  }}
  onClick={event=>{
   event.stopPropagation();
   const start=pointerStart.current;
   const moved=!!start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>6;
   pointerStart.current=null;
   if(!pickable||dragged.current||moved||event.delta>6)return;
   onPick?.();
  }}
  onPointerOver={event=>{event.stopPropagation();if(pickable)setHovered(true)}}
  onPointerOut={()=>setHovered(false)}>
  <RoundedBox args={[1.28,.14,1.12]} radius={.04} smoothness={2} position={[0,.07,.06]} receiveShadow>
   <meshStandardMaterial color={metal} metalness={.52} roughness={.44}/>
  </RoundedBox>
  <RoundedBox args={[1.03,2.2,.19]} radius={.045} smoothness={2} position={[0,1.27,-.45]}>
   <meshStandardMaterial color={charcoal} metalness={.38} roughness={.53}/>
  </RoundedBox>
  {[.66,1.22,1.78].map(y=><RoundedBox key={y} args={[.82,.47,.04]} radius={.035} smoothness={1} position={[0,y,-.337]}>
   <meshStandardMaterial color={available?'#a45326':'#625a50'} emissive="#b34a20" emissiveIntensity={available?.45:.05} roughness={.84}/>
  </RoundedBox>)}
  <RoundedBox args={[1.25,.19,1.01]} radius={.045} smoothness={2} position={[0,2.45,-.025]}>
   <meshStandardMaterial color={metal} metalness={.55} roughness={.4}/>
  </RoundedBox>
  <mesh position={[0,1.28,.087]}>
   <cylinderGeometry args={[.032,.032,2.35,10]}/>
   <meshStandardMaterial color="#b4bcb8" metalness={.64} roughness={.31}/>
  </mesh>
  <group ref={meat} position={[0,.06,.087]}>
  <mesh geometry={meatGeometry} castShadow>
   <meshStandardMaterial vertexColors color={available?'#ffffff':'#aaa8a2'} roughness={.8} flatShading/>
  </mesh>
  </group>
  <group ref={knife} visible={false}>
   <mesh geometry={knifeGeometry.blade} castShadow>
    <meshStandardMaterial color="#ccd3d4" metalness={.55} roughness={.28}/>
   </mesh>
   <mesh geometry={knifeGeometry.edge} position={[0,0,.012]}>
    <meshStandardMaterial color="#e3e8e8" metalness={.55} roughness={.2}/>
   </mesh>
   <mesh position={[0,.298,0]}>
    <boxGeometry args={[.14,.045,.08]}/>
    <meshStandardMaterial color="#ccd3d4" metalness={.55} roughness={.28}/>
   </mesh>
   <RoundedBox args={[.12,.27,.075]} radius={.025} smoothness={2} position={[0,.425,0]} castShadow>
    <meshStandardMaterial color="#343532" roughness={.7}/>
   </RoundedBox>
   {[.37,.48].map(y=><mesh key={y} position={[0,y,0]} rotation={[Math.PI/2,0,0]}>
    <cylinderGeometry args={[.014,.014,.083,10]}/>
    <meshStandardMaterial color="#ccd3d4" metalness={.55} roughness={.28}/>
   </mesh>)}
  </group>
  <mesh position={[0,.17,.087]}>
   <cylinderGeometry args={[.39,.35,.065,22]}/>
   <meshStandardMaterial color={metal} metalness={.54} roughness={.46}/>
  </mesh>
  <RoundedBox args={[1.64,.23,1.28]} radius={.04} smoothness={2} position={[0,2.88,.05]}>
   <meshStandardMaterial color={metal} metalness={.5} roughness={.43}/>
  </RoundedBox>
  <mesh position={[0,2.745,.05]}>
   <boxGeometry args={[1.31,.04,.79]}/>
   <meshStandardMaterial color={charcoal} metalness={.4} roughness={.65}/>
  </mesh>
 </group>;
}
