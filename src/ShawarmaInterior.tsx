import {useEffect,useMemo} from 'react';
import {RoundedBox} from '@react-three/drei';
import {CanvasTexture,Path,RepeatWrapping,Shape,ShapeGeometry,SRGBColorSpace} from 'three';
import {pickupOpening,servingLayout} from './sceneLayout';
import Rotisserie from './Rotisserie';


function tileTexture(){
 const canvas=document.createElement('canvas');
 canvas.width=256;
 canvas.height=192;
 const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#afa99d';
 ctx.fillRect(0,0,canvas.width,canvas.height);
 const tones=['#f3eee1','#ece6d8','#ede7dc','#e8e0d3'];
 for(let i=0;i<tones.length;i++){
  const x=i%2*128,y=Math.floor(i/2)*96;
  const glaze=ctx.createLinearGradient(x,y,x,y+96);
  glaze.addColorStop(0,'#fff9ed');
  glaze.addColorStop(.12,tones[i]);
  glaze.addColorStop(1,tones[i]);
  ctx.fillStyle=glaze;
  ctx.fillRect(x+1,y+1,126,94);
  ctx.fillStyle='#ffffff32';
  ctx.fillRect(x+3,y+2,122,1);
 }
 const texture=new CanvasTexture(canvas);
 texture.colorSpace=SRGBColorSpace;
 texture.wrapS=texture.wrapT=RepeatWrapping;
 texture.repeat.set(18,5);
 texture.anisotropy=4;
 return texture;
}

function tiledWall(){
 const wall=new Shape();
 wall.moveTo(-11,-.3);
 wall.lineTo(11,-.3);
 wall.lineTo(11,5.7);
 wall.lineTo(-11,5.7);
 wall.closePath();
 const hole=new Path();
 const left=servingLayout.shelfX-pickupOpening.width/2;
 const right=left+pickupOpening.width;
 hole.moveTo(left,pickupOpening.bottom);
 hole.lineTo(left,pickupOpening.top);
 hole.lineTo(right,pickupOpening.top);
 hole.lineTo(right,pickupOpening.bottom);
 hole.closePath();
 wall.holes.push(hole);
 const geometry=new ShapeGeometry(wall);
 const {position,uv}=geometry.attributes;
 for(let i=0;i<position.count;i++)uv.setXY(i,(position.getX(i)+11)/22,(position.getY(i)+.3)/6);
 return geometry;
}


type ShawarmaInteriorProps={
 chickenCutKey?:number;
 chickenAvailable?:boolean;
 onChickenPick?:()=>void;
 active?:boolean;
};
export default function ShawarmaInterior({chickenCutKey,chickenAvailable=true,onChickenPick,active=true}:ShawarmaInteriorProps={}){
 const tiles=useMemo(tileTexture,[]);
 const wall=useMemo(tiledWall,[]);
 useEffect(()=>()=>{tiles.dispose();wall.dispose()},[tiles,wall]);
 return <>
  <mesh position={[0,0,pickupOpening.wallZ]} geometry={wall} receiveShadow>
   <meshStandardMaterial map={tiles} roughness={.64}/>
  </mesh>
  <RoundedBox args={[16.4,.11,7.6]} position={[.2,-.21,-1.5]} radius={.035} smoothness={2} receiveShadow>
   <meshStandardMaterial color="#9ca5a1" metalness={.32} roughness={.49}/>
  </RoundedBox>
  <mesh position={[.2,-.49,2.26]}>
   <boxGeometry args={[16.34,.48,.05]}/>
   <meshStandardMaterial color="#535d55" metalness={.22} roughness={.7}/>
  </mesh>
  <mesh position={[0,-.76,0]} receiveShadow>
   <boxGeometry args={[200,.15,200]}/>
   <meshStandardMaterial color="#878b80" roughness={.9}/>
  </mesh>
  <Rotisserie cutKey={chickenCutKey} active={active} available={chickenAvailable} onPick={onChickenPick}/>
 </>;
}
