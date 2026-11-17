import {useLayoutEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {Food} from './Food';
import {isSauceId,type IngredientId} from './domain';

import {extractFoodParts,pantryPiecePoses,type FoodPart} from './pantryModel';

// Both the tray and the flying ingredient use Food. Instancing copies its actual
// geometry, material and local transforms instead of maintaining a second model.
export default function PantryFood({id}:{id:IngredientId}){
 const source=useRef<THREE.Group>(null);
 const [parts,setParts]=useState<FoodPart[]>([]);
 useLayoutEffect(()=>{
  if(!source.current||isSauceId(id)){setParts([]);return}
  const root=source.current;
  const next=extractFoodParts(root);
  root.traverse(object=>{if(object instanceof THREE.Mesh)object.raycast=()=>{}});
  setParts(next);
 },[id]);
 if(isSauceId(id))return null;
 const poses=pantryPiecePoses(id);
 return <group name={'canonical-pantry-food-'+id} userData={{ingredientId:id,model:'Food'}}>
  <group ref={source} visible={false} name={'food-template-'+id}><Food kind={id} variant={0}/></group>
  {parts.map((part,index)=><instancedMesh key={id+':'+index} args={[part.geometry,part.material,poses.length*part.matrices.length]}
   dispose={null} castShadow receiveShadow ref={mesh=>{
    if(!mesh)return;
    const pose=new THREE.Object3D();let slot=0;
    for(const item of poses){
     pose.position.fromArray(item.position);pose.rotation.set(0,item.rotation,0);pose.scale.setScalar(item.scale);pose.updateMatrix();
     part.matrices.forEach((matrix,i)=>{
      mesh.setMatrixAt(slot,pose.matrix.clone().multiply(matrix));
      if(part.colors)mesh.setColorAt(slot,part.colors[i]);
      slot++;
     });
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingBox();mesh.computeBoundingSphere();
   }}/>) }
 </group>;
}
