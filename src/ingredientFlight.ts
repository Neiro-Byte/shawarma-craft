import {Matrix4,Vector3} from 'three';
export type Point3=readonly [number,number,number];
export function worldToIngredientSource(world:Point3,matrixWorld:Matrix4):[number,number,number]{
 return new Vector3(...world).applyMatrix4(matrixWorld.clone().invert()).toArray() as [number,number,number];
}
export function ingredientFlightPoint(start:Point3,target:Point3,t:number,lift=1.1):[number,number,number]{
 const progress=Math.max(0,Math.min(1,t));
 return [start[0]+(target[0]-start[0])*progress,start[1]+(target[1]-start[1])*progress+Math.sin(progress*Math.PI)*lift,start[2]+(target[2]-start[2])*progress];
}
