import {RoundedBox} from '@react-three/drei';
import {pickupOpening,servingLayout} from './sceneLayout';

const graphite='#333936';

export default function PickupWindow(){
 const {width,bottom,top,wallZ,recessZ}=pickupOpening;
 const height=top-bottom;
 const midY=(top+bottom)/2;
 const depth=wallZ-recessZ;
 const midZ=(wallZ+recessZ)/2;
 const frameWidth=.095;
 const sillFront=wallZ+.396;

 return <group position={[servingLayout.shelfX,0,0]}>
  <mesh position={[0,midY,recessZ]}>
   <planeGeometry args={[width,height]}/>
   <meshStandardMaterial color="#544b3e" roughness={.94}/>
  </mesh>
  <mesh position={[0,top-.22,recessZ+.006]}>
   <planeGeometry args={[width,.24]}/>
   <meshStandardMaterial color="#73583d" roughness={.91} emissive="#bf6b31" emissiveIntensity={.12}/>
  </mesh>
  {[-1,1].map(side=><group key={side}>
   <mesh position={[side*(width/2+.0325),midY,midZ]}>
    <boxGeometry args={[.065,height,depth]}/>
    <meshStandardMaterial color="#363633" roughness={.86}/>
   </mesh>
   <RoundedBox args={[frameWidth,height,.13]} radius={.012} smoothness={2}
    position={[side*(width/2+frameWidth/2),midY,wallZ+.04]}>
    <meshStandardMaterial color={graphite} metalness={.35} roughness={.58}/>
   </RoundedBox>
   <group position={[side*width*.28,top-.16,recessZ+.19]}>
    <mesh>
     <cylinderGeometry args={[.078,.111,.067,14]}/>
     <meshStandardMaterial color="#413b34" metalness={.32} roughness={.62}/>
    </mesh>
    <mesh position={[0,-.038,.005]}>
     <sphereGeometry args={[.055,12,8,0,Math.PI*2,Math.PI/2,Math.PI/2]}/>
     <meshBasicMaterial color="#ffd38e"/>
    </mesh>
   </group>
  </group>)}
  <mesh position={[0,top+.03,midZ]}>
   <boxGeometry args={[width,.06,depth]}/>
   <meshStandardMaterial color="#3d3932" roughness={.9}/>
  </mesh>
  <mesh position={[0,bottom-.03,midZ]}>
   <boxGeometry args={[width,.06,depth]}/>
   <meshStandardMaterial color="#665d4e" roughness={.89}/>
  </mesh>
  <pointLight color="#ffba77" intensity={.34} distance={1.38} position={[0,top-.19,midZ+.16]}/>
  <RoundedBox args={[width+2*frameWidth,.11,.16]} radius={.018} smoothness={2}
   position={[0,top+.055,wallZ+.04]}>
   <meshStandardMaterial color={graphite} metalness={.33} roughness={.66}/>
  </RoundedBox>
  <RoundedBox args={[width+2*frameWidth,.083,.43]} radius={.014} smoothness={2}
   position={[0,bottom-.0415,sillFront-.215]}>
   <meshStandardMaterial color="#a4a6a1" metalness={.43} roughness={.52}/>
  </RoundedBox>
 </group>;
}
