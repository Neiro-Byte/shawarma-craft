import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {RoundedBox} from '@react-three/drei';
import {BufferAttribute,BufferGeometry,Color,DoubleSide,InstancedMesh,Object3D,Shape,Vector2} from 'three';
import type {ExtraId} from './extraMenuCatalog';
import type {PaymentMethod} from './payment';
import {centeredSlot,servingLayout} from './sceneLayout';

export type ServingOrder = {
 id: number;
 withShawarma: boolean;
 shawarmaQuantity: number;
 paymentMethod?: PaymentMethod;
 extras: {id: ExtraId;quantity: number}[];
};

const bottles = {
 water: {body:'#a2c9d2',cap:'#3384ac',label:'#d9f1f6'},
 ayran: {body:'#f4efe1',cap:'#518252',label:'#d0e0ac'},
 cranberry: {body:'#bd4c51',cap:'#902f42',label:'#f6b1a5'},
 blackcurrant: {body:'#6c416b',cap:'#503051',label:'#dbc3e3'},
} as const;
type Drink = keyof typeof bottles;
type Snack = Exclude<ExtraId,Drink>;
const MAX_VISIBLE_SNACKS = 4;
const COMPACT_SNACK_SCALE = .84;
const snackColors = {
 bites: {food:['#e1a456','#cc813e','#b76b33'],crumb:'#f2b96c',paper:'#b69766'},
 cheeseBalls: {food:['#edbb58','#d9a13f','#e8b04b'],crumb:'#af7131',paper:'#b5a178'},
} as const;
const cartonRed = '#c94e35';
const cartonSide = (side:number) => new Float32Array([
 side*.20,.018,-.117, side*.30,.41,-.194, side*.29,.34,.194,
 side*.20,.018,-.117, side*.29,.34,.194, side*.20,.018,.117,
]);
const cartonSides = [cartonSide(-1),cartonSide(1)];
const fries = [
 [-.195,.335,.065,.46,.07,.19],[-.133,.40,-.071,.63,-.09,.12],
 [-.081,.35,.052,.51,.09,.09],[-.036,.43,-.068,.65,-.06,.03],
 [.025,.39,.069,.61,.11,-.04],[.083,.42,-.074,.64,-.10,-.05],
 [.138,.35,.055,.49,.10,-.13],[.183,.385,-.056,.59,-.06,-.17],
 [.02,.353,-.006,.49,.02,.08],
];

function FriesCarton(){
 const sides=useMemo(()=>cartonSides.map(positions=>{
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
 }),[]);
 useEffect(()=>()=>sides.forEach(geometry=>geometry.dispose()),[sides]);
 const [front,back]=useMemo(()=>{
  const front=new Shape();
  front.moveTo(-.20,0);front.lineTo(.20,0);front.lineTo(.29,.326);
  front.quadraticCurveTo(0,.185,-.29,.326);front.closePath();
  const back=new Shape();
  back.moveTo(-.20,0);back.lineTo(.20,0);back.lineTo(.30,.398);
  back.quadraticCurveTo(0,.47,-.30,.398);back.closePath();
  return [front,back];
 },[]);
 return <>
  <mesh position={[0,.018,-.117]} rotation={[-.19,0,0]} castShadow>
   <shapeGeometry args={[back,12]}/><meshStandardMaterial color="#e77655" side={DoubleSide} roughness={.88}/>
  </mesh>
  {sides.map((geometry,index)=><mesh key={index} geometry={geometry} castShadow>
   <meshStandardMaterial color="#a93727" side={DoubleSide} roughness={.86}/>
  </mesh>)}
  <mesh position={[0,.018,0]}>
   <boxGeometry args={[.4,.027,.24]}/><meshStandardMaterial color="#a93727"/>
  </mesh>
  {fries.map(([x,y,z,height,lean,tilt],index)=><RoundedBox key={index}
   args={[.064,height,.061]} radius={.013} smoothness={1}
   position={[x,y,z]} rotation={[lean,index%2*.18,tilt]} castShadow>
   <meshStandardMaterial color={index%3===0?'#eab047':'#f7cb62'} roughness={.82}/>
  </RoundedBox>)}
  <group position={[0,.018,.117]} rotation={[.23,0,0]}>
   <mesh castShadow>
    <shapeGeometry args={[front,12]}/><meshStandardMaterial color={cartonRed} side={DoubleSide} roughness={.83}/>
   </mesh>
   <mesh position={[0,.114,.003]} rotation={[0,0,-.10]}>
    <planeGeometry args={[.21,.048]}/><meshStandardMaterial color="#fff0ce" side={DoubleSide}/>
   </mesh>
  </group>
 </>;
}

function isDrink(id:ExtraId): id is Drink {
 return Object.hasOwn(bottles,id);
}

function DrinkBottle({id}:{id:Drink}) {
 const colors=bottles[id];
 const profile=useMemo(()=>[
  [0,0],[.16,0],[.19,.035],[.19,.49],[.175,.55],[.093,.67],[.093,.735],[0,.735],
 ].map(([radius,height])=>new Vector2(radius,height)),[]);
 return <>
  <mesh castShadow><latheGeometry args={[profile,12]}/><meshStandardMaterial color={colors.body} roughness={.42}/></mesh>
  <mesh position={[0,.74,0]}><cylinderGeometry args={[.106,.106,.08,12]}/><meshStandardMaterial color={colors.cap}/></mesh>
  <mesh position={[0,.305,0]}><cylinderGeometry args={[.194,.194,.205,12]}/><meshStandardMaterial color={colors.label}/></mesh>
  <mesh position={[0,.34,.197]} rotation={[0,0,id==='water'?.35:-.3]}><planeGeometry args={[.11,.037]}/><meshStandardMaterial color={colors.cap}/></mesh>
 </>;
}

function PaperBoat({color}:{color:string}) {
 return <>
  <RoundedBox args={[.61,.10,.42]} radius={.045} smoothness={2} position={[0,.055,0]} castShadow>
   <meshStandardMaterial color={color} roughness={.86}/>
  </RoundedBox>
  <RoundedBox args={[.56,.03,.37]} radius={.012} smoothness={1} position={[0,.105,0]}>
   <meshStandardMaterial color="#fff0d0" roughness={.95}/>
  </RoundedBox>
 </>;
}

function BreadedSnack({id}:{id:'bites'|'cheeseBalls'}) {
 const pieces=useRef<InstancedMesh>(null);
 const crumbs=useRef<InstancedMesh>(null);
 const palette=snackColors[id];
 const count=id==='bites'?5:6;
 useLayoutEffect(()=>{
  const piece=new Object3D(),speck=new Object3D(),color=new Color();
  const base=pieces.current!,coating=crumbs.current!;
  for(let i=0;i<count;i++){
   const angle=i*2.399;
   const radius=i===0?0:.12+(i%2)*.07;
   const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius*.62;
   const y=.19+(i===0?.105:0);
   piece.position.set(x,y,z);
   piece.rotation.set(.22*(i%3),angle,.38*(i%3));
   if(id==='bites')piece.scale.set(.12+(i%3)*.007,.083,.083-(i%2)*.014);
   else piece.scale.setScalar(.088+(i%3)*.008);
   piece.updateMatrix();
   base.setMatrixAt(i,piece.matrix);
   base.setColorAt(i,color.set(palette.food[i%palette.food.length]));

   for(let fleck=0;fleck<7;fleck++){
    const t=fleck*2.399+i,r=.45+.10*(fleck%3);
    const lift=Math.sqrt(1-r*r);
    speck.position.set(Math.cos(t)*r,lift,Math.sin(t)*r).applyMatrix4(piece.matrix);
    speck.scale.setScalar(.009+(fleck%3)*.003);
    speck.updateMatrix();
    coating.setMatrixAt(i*7+fleck,speck.matrix);
   }
  }
  base.instanceMatrix.needsUpdate=true;
  base.instanceColor!.needsUpdate=true;
  coating.instanceMatrix.needsUpdate=true;
  base.computeBoundingSphere();
  coating.computeBoundingSphere();
 },[id,count,palette]);
 return <>
  <PaperBoat color={palette.paper}/>
  <instancedMesh ref={pieces} args={[undefined,undefined,count]} castShadow>
   <icosahedronGeometry args={[1,id==='bites'?1:2]}/>
   <meshStandardMaterial color="#ffffff" roughness={.97}/>
  </instancedMesh>
  <instancedMesh ref={crumbs} args={[undefined,undefined,count*7]}>
   <icosahedronGeometry args={[1,0]}/>
   <meshStandardMaterial color={palette.crumb} roughness={1}/>
  </instancedMesh>
 </>;
}

const wingPoses = [[-.142,.184,-.055,-.38],[.142,.183,.059,2.77],[.008,.26,-.035,.4]];
function WingsPortion(){
 return <>
  <PaperBoat color="#a5a47e"/>
  {wingPoses.map(([x,y,z,angle],index)=><group key={index} position={[x,y,z]} rotation={[0,angle,0]}>
   <mesh scale={[.091,.071,.115]} castShadow>
    <sphereGeometry args={[1,12,8]}/><meshStandardMaterial color={index===1?'#b65e30':'#ad5028'} roughness={.46}/>
   </mesh>
   <mesh position={[.023,-.002,.087]} rotation={[0,.38,-.11]} scale={[.063,.047,.095]} castShadow>
    <sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#bd6333" roughness={.61}/>
   </mesh>
   <mesh position={[.044,-.008,.174]} scale={[.028,.024,.025]}>
    <sphereGeometry args={[1,8,7]}/><meshStandardMaterial color="#e6ca99" roughness={.87}/>
   </mesh>
  </group>)}
 </>;
}

function trayPortions(extras:ServingOrder['extras']){
 const drinks:ExtraId[]=[];
 const snacks:{id:Snack;quantity:number}[]=[];
 for(const {id,quantity} of extras){
  if(quantity<=0)continue;
  if(isDrink(id))drinks.push(id);
  else snacks.push({id,quantity});
 }
 const portions:ExtraId[]=snacks.map(snack=>snack.id);
 const snackQuantity=snacks.reduce((sum,snack)=>sum+snack.quantity,0);
 // One example of every selected snack comes first, then a few repeated portions.
 for(let copy=1;portions.length<Math.min(snackQuantity,MAX_VISIBLE_SNACKS);copy++){
  for(const snack of snacks){
   if(snack.quantity>copy&&portions.length<MAX_VISIBLE_SNACKS)portions.push(snack.id);
  }
 }
 return {ids:[...drinks,...portions],snackScale:snackQuantity>=3?COMPACT_SNACK_SCALE:1};
}

export function ServingShelf() {
 const {shelfWidth,shelfDepth,shelfHeight,shelfX,shelfZ}=servingLayout;
 return <group position={[shelfX,shelfHeight-.10,shelfZ]}>
  <RoundedBox args={[shelfWidth,.20,shelfDepth]} radius={.052} smoothness={2} receiveShadow>
   <meshStandardMaterial color="#b38a5d" roughness={.76}/>
  </RoundedBox>
  <mesh position={[0,.004,shelfDepth/2+.004]}>
   <boxGeometry args={[shelfWidth-.16,.079,.015]}/>
   <meshStandardMaterial color="#5d7657" roughness={.75}/>
  </mesh>
  {[-2.25,2.25].map(x=><mesh key={x} position={[x,-.19,-1.13]}>
   <boxGeometry args={[.14,.19,1.77]}/><meshStandardMaterial color="#657360" metalness={.26} roughness={.63}/>
  </mesh>)}
 </group>;
}

export function ServingTray({order}:{order:ServingOrder}) {
 const {trayWidth,trayDepth,traySurface,extraCenterX,extraSpacingX,extraSpacingZ}=servingLayout;
 const {ids,snackScale}=useMemo(()=>trayPortions(order.extras),[order.extras]);
 const withRoll=order.withShawarma;
 const rowSize=withRoll?2:4;
 const columns=Math.min(ids.length,rowSize);
 const rows=Math.ceil(ids.length/rowSize);
 return <>
  <RoundedBox args={[trayWidth,traySurface,trayDepth]} radius={.039} smoothness={2} position={[0,traySurface/2,0]} castShadow receiveShadow>
   <meshStandardMaterial color="#46644c" roughness={.64}/>
  </RoundedBox>
  <RoundedBox args={[trayWidth-.22,.02,trayDepth-.22]} radius={.008} smoothness={1} position={[0,traySurface+.008,0]} receiveShadow>
   <meshStandardMaterial color="#fff0ce" roughness={.81}/>
  </RoundedBox>
  {[-1,1].map(side=><group key={side}>
   <RoundedBox args={[trayWidth,.11,.085]} radius={.035} smoothness={2} position={[0,.105,side*(trayDepth-.085)/2]}>
    <meshStandardMaterial color="#55755a" roughness={.63}/>
   </RoundedBox>
   <RoundedBox args={[.085,.11,trayDepth-.15]} radius={.035} smoothness={2} position={[side*(trayWidth-.085)/2,.105,0]}>
    <meshStandardMaterial color="#55755a" roughness={.63}/>
   </RoundedBox>
  </group>)}
  {ids.map((id,i)=>{
   const row=Math.floor(i/rowSize);
   const itemsInRow=Math.min(columns,ids.length-row*rowSize);
   const x=withRoll?extraCenterX+centeredSlot(i%rowSize,itemsInRow,extraSpacingX):centeredSlot(i%rowSize,itemsInRow,.92);
   const z=centeredSlot(row,rows,withRoll?extraSpacingZ:.81);
   return <group key={`${id}-${i}`} position={[x,traySurface+.018,z]} scale={isDrink(id)?1:snackScale}>
    {isDrink(id)?<DrinkBottle id={id}/>:id==='fries'?<FriesCarton/>:id==='wings'?<WingsPortion/>:<BreadedSnack id={id}/>}
   </group>;
  })}
 </>;
}
