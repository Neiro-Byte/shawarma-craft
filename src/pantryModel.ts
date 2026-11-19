import * as THREE from 'three';
import {visualIngredientId,type IngredientId} from './domain';
export type FoodPart={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];matrices:THREE.Matrix4[];colors:THREE.Color[]|null};
export function pantryPiecePoses(input:IngredientId){
 const id=visualIngredientId(input);
 if(id==='falafel')return [[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]].map(([x,z])=>({position:[x,.035,z] as [number,number,number],rotation:0,scale:1}));
 const count=id==='corn'?44:id==='beans'?30:id==='cheese'?14:id==='carrot'||id==='cabbage'?12:id==='beef'?12:id==='chicken'?9:7;
 return Array.from({length:count},(_,i)=>{
  const angle=i*2.3999632297,radius=.16*Math.sqrt((i+.5)/count);
  return {position:[Math.cos(angle)*radius,.035+(i%3)*.025,Math.sin(angle)*radius] as [number,number,number],rotation:angle,scale:1};
 });
}
export function extractFoodParts(root:THREE.Object3D):FoodPart[]{
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert();
 const parts:FoodPart[]=[];
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return;
  const local=inverse.clone().multiply(object.matrixWorld);
  const matrices:THREE.Matrix4[]=[];
  let colors:THREE.Color[]|null=null;
  if(object instanceof THREE.InstancedMesh){
   if(object.instanceColor)colors=[];
   for(let i=0;i<object.count;i++){
    const matrix=new THREE.Matrix4();object.getMatrixAt(i,matrix);matrices.push(local.clone().multiply(matrix));
    if(colors){const color=new THREE.Color();object.getColorAt(i,color);colors.push(color)}
   }
  }else matrices.push(local);
  parts.push({geometry:object.geometry,material:object.material,matrices,colors});
 });
 return parts;
}
