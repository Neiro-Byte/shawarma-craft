import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const hooks=dataURL('export const useMemo=f=>f();export const useEffect=()=>{};');
const jsx=dataURL('export const Fragment=Symbol.for("fragment");export const jsx=(type,props)=>({type,props});export const jsxs=jsx;');
const roundedBox=dataURL(`export function RoundedBox({args,children,...props}){return {type:'mesh',props:{...props,children:[{type:'boxGeometry',props:{args}},children]}}}`);
const modules=new Map();
function compile(name){
 if(modules.has(name))return modules.get(name);
 const path=name==='Food'?'Food.tsx':name+'.ts';
 const source=readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
 const result=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.ReactJSX,
 }});
 const code=result.outputText.replace(/from ['"]([^'"]+)['"]/g,(_,dependency)=>{
  const uri=dependency==='react'?hooks:dependency==='react/jsx-runtime'?jsx:
   dependency==='@react-three/drei'?roundedBox:dependency==='three'?import.meta.resolve('three'):
   dependency.startsWith('./')?compile(dependency.slice(2)):null;
  assert(uri,'Неизвестная зависимость '+dependency);
  return 'from '+JSON.stringify(uri);
 });
 const url=dataURL(code);modules.set(name,url);return url;
}
const {Food}=await import(compile('Food'));
const {ingredients}=await import(compile('data'));
const {isSauceId}=await import(compile('domain'));
const {extractFoodParts,pantryPiecePoses}=await import(compile('pantryModel'));
const constructors={
 boxGeometry:THREE.BoxGeometry,sphereGeometry:THREE.SphereGeometry,
 cylinderGeometry:THREE.CylinderGeometry,circleGeometry:THREE.CircleGeometry,
 torusGeometry:THREE.TorusGeometry,tubeGeometry:THREE.TubeGeometry,
 icosahedronGeometry:THREE.IcosahedronGeometry,planeGeometry:THREE.PlaneGeometry,
 capsuleGeometry:THREE.CapsuleGeometry,
};
function expand(node){
 while(node&&typeof node.type==='function')node=node.type(node.props);
 return node;
}
function build(node,owner){
 if(!node)return;
 if(Array.isArray(node)){node.forEach(child=>build(child,owner));return}
 node=expand(node);if(!node)return;
 const props=node.props??{};
 const children=[props.children].flat(Infinity).filter(Boolean).map(expand);
 let object;
 if(node.type==='mesh'||node.type==='instancedMesh'){
  const geometryNode=children.find(child=>constructors[child?.type]);
  const geometry=props.geometry??props.args?.[0]??(geometryNode?
   new constructors[geometryNode.type](...(geometryNode.props.args??[])):null);
  assert(geometry,'Неизвестная геометрия '+node.type);
  const materialNode=children.find(child=>child?.type==='meshStandardMaterial');
  const material=props.material??props.args?.[1]??new THREE.MeshStandardMaterial(materialNode?.props??{});
  object=node.type==='instancedMesh'?new THREE.InstancedMesh(geometry,material,props.args[2]):new THREE.Mesh(geometry,material);
 }else object=new THREE.Group();
 if(props.position)object.position.fromArray(props.position);
 if(props.rotation)object.rotation.set(...props.rotation);
 if(typeof props.scale==='number')object.scale.setScalar(props.scale);
 else if(props.scale)object.scale.fromArray(props.scale);
 owner.add(object);
 if(typeof props.ref==='function')props.ref(object);
 else if(props.ref)props.ref.current=object;
 if(!(object instanceof THREE.Mesh))children.forEach(child=>build(child,object));
}
function closeMatrix(actual,expected,label){
 for(let i=0;i<16;i++)assert(Math.abs(actual.elements[i]-expected.elements[i])<1e-8,label+' matrix '+i);
}
function inspect(root){
 const meshes=[];
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert();
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return;
  const matrices=[],colors=[];
  const local=inverse.clone().multiply(object.matrixWorld);
  const count=object instanceof THREE.InstancedMesh?object.count:1;
  for(let i=0;i<count;i++){
   const instance=new THREE.Matrix4();
   if(object instanceof THREE.InstancedMesh)object.getMatrixAt(i,instance);
   matrices.push(local.clone().multiply(instance));
   if(object instanceof THREE.InstancedMesh&&object.instanceColor){const color=new THREE.Color();object.getColorAt(i,color);colors.push(color)}
  }
  meshes.push({object,matrices,colors});
 });
 return meshes;
}
let partsChecked=0,verticesChecked=0;
const outside=[];
const foodIds=ingredients.filter(item=>!isSauceId(item.id)).map(item=>item.id);
assert.equal(foodIds.length,17);
for(const id of foodIds){
 const root=new THREE.Group();
 root.position.set(2,.3,-4);root.rotation.set(.1,.6,-.2);root.scale.set(1.2,.7,1.3);
 build({type:Food,props:{kind:id,variant:0}},root);
 const expected=inspect(root);
 assert(expected.length>0,id+' не создал деталей');
 const parts=extractFoodParts(root);
 assert.equal(parts.length,expected.length,id+' потерял mesh');
 const poses=pantryPiecePoses(id);
 assert(poses.length>0&&poses.every(p=>p.scale===1),id+' уменьшен в лотке');
 const bounds=new THREE.Box3();
 const portionBounds=poses.map(()=>new THREE.Box3());
 for(const [index,part] of parts.entries()){
  const original=expected[index];
  assert.strictEqual(part.geometry,original.object.geometry,id+' заменил геометрию');
  assert.strictEqual(part.material,original.object.material,id+' заменил материал');
  assert.equal(part.matrices.length,original.matrices.length,id+' потерял экземпляры');
  assert.equal(part.colors?.length??0,original.colors.length);
  if(part.geometry.attributes.color){
   assert.strictEqual(part.geometry.attributes.color,original.object.geometry.attributes.color,id+' потерял цвета вершин');
   const materials=Array.isArray(part.material)?part.material:[part.material];
   assert(materials.some(material=>material.vertexColors),id+' отключены цвета вершин');
  }
  part.matrices.forEach((matrix,i)=>{
   closeMatrix(matrix,original.matrices[i],id);
   if(part.colors)assert(part.colors[i].distanceToSquared?
    part.colors[i].distanceToSquared(original.colors[i])<1e-12:
    part.colors[i].equals(original.colors[i]));
  });
  for(const [poseIndex,pose] of poses.entries()){
   const placement=new THREE.Object3D();
   placement.position.fromArray(pose.position);placement.rotation.set(0,pose.rotation,0);placement.scale.setScalar(pose.scale);placement.updateMatrix();
   for(const matrix of part.matrices){
    const transform=placement.matrix.clone().multiply(matrix);
    const vertices=part.geometry.attributes.position;
    for(let i=0;i<vertices.count;i++){
     const point=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(transform);
     assert([point.x,point.y,point.z].every(Number.isFinite),id+' нечисловая вершина');
     bounds.expandByPoint(point);portionBounds[poseIndex].expandByPoint(point);verticesChecked++;
    }
   }
  }
  partsChecked++;
 }
 if(id==='falafel')for(let i=0;i<portionBounds.length;i++)for(let j=i+1;j<portionBounds.length;j++){
  assert(!portionBounds[i].intersectsBox(portionBounds[j]),'Целые шарики фалафеля пересекаются');
 }
 const box={id,min:bounds.min.toArray(),max:bounds.max.toArray(),portions:poses.length,parts:parts.length};
 if(bounds.min.x<-.44||bounds.max.x>.44||bounds.min.z<-.44||bounds.max.z>.44||bounds.min.y<0||bounds.max.y>.4)outside.push(box);
 console.log(JSON.stringify(box));
 const geometries=new Set(parts.map(part=>part.geometry));
 const materials=new Set(parts.flatMap(part=>Array.isArray(part.material)?part.material:[part.material]));
 geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
}
// Actual Food uses per-vertex colors. Cover instance colors and material arrays explicitly.
const fixture=new THREE.Group(),nested=new THREE.Group();
fixture.position.set(-3,2,1);fixture.rotation.y=.7;fixture.scale.set(1.2,.9,1.1);
nested.position.set(.2,.5,-.1);nested.rotation.z=.3;fixture.add(nested);
const geometry=new THREE.BoxGeometry(.1,.2,.3);
const materials=[new THREE.MeshStandardMaterial({color:'#b35731'}),new THREE.MeshStandardMaterial({color:'#efd18e'})];
const mesh=new THREE.InstancedMesh(geometry,materials,3);
mesh.position.set(.1,.2,.3);nested.add(mesh);
for(let i=0;i<3;i++){
 const instance=new THREE.Object3D();instance.position.set(i*.11,.03,-.04);instance.rotation.y=i*.4;instance.scale.set(1,.8,1.1);instance.updateMatrix();
 mesh.setMatrixAt(i,instance.matrix);mesh.setColorAt(i,new THREE.Color(['#b92d25','#25a855','#4068bf'][i]));
}
const fixtureExpected=inspect(fixture)[0];
const originalRaycast=mesh.raycast;fixture.visible=false;
const extracted=extractFoodParts(fixture);
assert.strictEqual(mesh.raycast,originalRaycast,'Pure helper изменил raycast шаблона');
assert.equal(extracted.length,1);
assert.strictEqual(extracted[0].geometry,geometry);
assert.strictEqual(extracted[0].material,materials);
assert.equal(extracted[0].colors.length,3);
extracted[0].matrices.forEach((matrix,i)=>{
 closeMatrix(matrix,fixtureExpected.matrices[i],'fixture');
 assert(extracted[0].colors[i].equals(fixtureExpected.colors[i]));
});
geometry.dispose();materials.forEach(material=>material.dispose());mesh.dispose();
if(outside.length)console.error('Границы лотка ±0.44 по X/Z и [0,0.4] по Y нарушены:',JSON.stringify(outside));
assert.equal(outside.length,0,'Канонические модели выходят за границы лотка; границы теста не расширены.');
console.log(`PASS pantry models: ${foodIds.length} ingredients, ${partsChecked} shared geometry/material parts, ${verticesChecked} transformed vertices; scale=1, nested transforms and instance colors preserved.`);
