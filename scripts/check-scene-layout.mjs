// Checks final-state vertices against a cylinder/plate envelope, not expected poses.
// React hooks are evaluated once; RoundedBox uses a conservative enclosing box.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../',import.meta.url));
const dataUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const stubs={
 react:dataUrl('export const useMemo=f=>f(); export const useEffect=()=>{};'),
 'react/jsx-runtime':dataUrl('export const Fragment=Symbol.for("fragment"); export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'),
 '@react-three/drei':dataUrl(`export function RoundedBox({args,children,...props}){return {type:'mesh',props:{...props,children:[{type:'boxGeometry',props:{args}},children]}}}`),
 three:pathToFileURL(require.resolve('three')).href,
};
function compile(path,imports={}){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
 return dataUrl(outputText.replace(/from (["'])(.*?)\1/g,(_,q,name)=>{assert(imports[name],`Unknown import: ${name}`);return 'from '+JSON.stringify(imports[name])}));
}
const domainUrl=compile('src/domain.ts');
const model={...await import(domainUrl),...await import(compile('src/sceneLayout.ts',{'./domain':domainUrl})),...await import(compile('src/Food.tsx',{...stubs,'./domain':domainUrl}))};
const {Food,roll,fillingTransform:f,endcap,grillLayout,batchRollLayout,servingLayout,centeredSlot,denseLayers,piecePose,cheesePose,saucePoint,endPosition,trayLayout,sauceStation,MAX_FILLINGS,SAUCE_IDS,ingredientPieceCount}=model;
const constructors={sphereGeometry:THREE.SphereGeometry,cylinderGeometry:THREE.CylinderGeometry,circleGeometry:THREE.CircleGeometry,boxGeometry:THREE.BoxGeometry,torusGeometry:THREE.TorusGeometry,tubeGeometry:THREE.TubeGeometry,icosahedronGeometry:THREE.IcosahedronGeometry};
const geometries=[];
function expand(node){return node&&typeof node.type==='function'?expand(node.type(node.props)):node}
function childrenOf(n){return [n?.props?.children].flat(Infinity).filter(Boolean).map(expand)}
function transform(p={}){
 const o=new THREE.Object3D();if(p.position)o.position.fromArray(p.position);if(p.rotation)o.rotation.fromArray(p.rotation);
 if(typeof p.scale==='number')o.scale.setScalar(p.scale);else if(p.scale)o.scale.fromArray(p.scale);o.updateMatrix();return o.matrix;
}
function vertices(node,parent=new THREE.Matrix4()){
 if(Array.isArray(node))return node.flatMap(n=>vertices(n,parent));node=expand(node);if(!node)return [];
 const p=node.props??{},matrix=parent.clone().multiply(transform(p)),kids=childrenOf(node);
 if(node.type==='mesh'||node.type==='instancedMesh'){
  const gnode=kids.find(k=>constructors[k?.type]);const geometry=p.geometry??p.args?.[0]??(gnode?new constructors[gnode.type](...(gnode.props.args??[])):null);
  assert(geometry,`Unsupported geometry in ${node.type}`);geometries.push(geometry);
  const matrices=[];
  if(node.type==='instancedMesh'){
   const instance=new THREE.InstancedMesh(geometry,undefined,p.args[2]);p.ref?.(instance);
   for(let i=0;i<instance.count;i++){const m=new THREE.Matrix4();instance.getMatrixAt(i,m);matrices.push(matrix.clone().multiply(m))}
   instance.dispose();
  }else matrices.push(matrix);
  return matrices.flatMap(m=>{const a=geometry.attributes.position;return Array.from({length:a.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(m))});
 }
 return kids.flatMap(k=>vertices(k,matrix));
}
const ids=[...readFileSync(new URL('../src/domain.ts',import.meta.url),'utf8').matchAll(/'([^']+)'/g)].map(m=>m[1]);
const foodIds=[...new Set(ids.slice(0,24))];assert.equal(foodIds.length,24);
assert.equal(typeof ingredientPieceCount,'function','Missing sceneLayout.ingredientPieceCount');
assert.equal(ingredientPieceCount('chicken'),16,'Expected 16 chicken pieces');
assert.equal(ingredientPieceCount('lettuce'),7);
for(const id of foodIds.filter(id=>id!=='chicken'&&id!=='lettuce'))assert.equal(ingredientPieceCount(id),9);
const cache=new Map();
function food(kind,variant){const key=kind+variant;if(!cache.has(key))cache.set(key,vertices({type:Food,props:{kind,variant}}));return cache.get(key)}
let radial=0,longitudinal=0,endRadial=0,endLength=0,checks=0;
function inside(points,matrix,label,end=false){
 for(const local of points){const p=local.clone().applyMatrix4(matrix),r=Math.hypot(p.x,p.y-roll.centerY),z=Math.abs(p.z);
  assert(r<=roll.radius-1e-6,`${label}: radial ${r} > ${roll.radius}`);
  assert(z<=roll.halfLength-1e-6,`${label}: end ${z} > ${roll.halfLength}`);
  if(end){endRadial=Math.max(endRadial,r);endLength=Math.max(endLength,z)}else{radial=Math.max(radial,r);longitudinal=Math.max(longitudinal,z)}checks++;
 }
}
const compact=transform({position:[0,f.offsetY,0],scale:[f.x,f.y,f.z]});
for(let count=1;count<=MAX_FILLINGS;count++){
 for(let layer=0;layer<count;layer++)for(const id of foodIds){
  if(!SAUCE_IDS.has(id)&&id!=='cheese')for(let index=0;index<ingredientPieceCount(id);index++){
   const p=piecePose(layer,index),matrix=compact.clone().multiply(transform({position:[p.x,p.y,p.z],rotation:[0,p.ry,0]}));inside(food(id,index),matrix,`${count}/${layer}/${id}/${index}`);
  }
  for(const side of [-1,1]){
   const matrix=transform({position:[0,roll.centerY,side*endcap.z]}).multiply(transform({position:[0,0,side*endcap.outward],rotation:[side*Math.PI/2,0,0]})).multiply(transform({position:endPosition(layer,count),scale:endcap.scale}));
   inside(food(id,layer),matrix,`end ${count}/${layer}/${id}`,true);
  }
 }
 // Every sauce's actual triangulated TubeGeometry, including its radius.
 for(let layer=0;layer<count;layer++){
  const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length:100},(_,i)=>new THREE.Vector3(...saucePoint(layer,i/99)))),120,.035,6,false);geometries.push(g);
  inside(Array.from({length:g.attributes.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,i)),compact,`sauce ${count}/${layer}`);
  const cheese=new THREE.BoxGeometry(.025,.023,.16);geometries.push(cheese);
  for(let i=0;i<65;i++){const p=cheesePose(layer,i);inside(Array.from({length:cheese.attributes.position.count},(_,j)=>new THREE.Vector3().fromBufferAttribute(cheese.attributes.position,j)),compact.clone().multiply(transform({position:[p.x,p.y,p.z],rotation:[0,p.ry,0]})),`cheese ${count}/${layer}/${i}`)}
 }
 // Removal from every slot, followed by a new item with deliberately stale layer.
 const original=Array.from({length:count},(_,layer)=>({key:layer,layer}));
 for(let removed=0;removed<count;removed++){
  const edited=denseLayers([...original.filter((_,i)=>i!==removed),{key:100,layer:99}]);
  assert.equal(edited.length,count);assert.deepEqual(edited.map(x=>x.layer),Array.from({length:count},(_,i)=>i));
 }
}
// Independently audited plate AABBs from ContactGrill (including ridge thickness).
const lowerTop=.5+.045/2,upperBottom=grillLayout.hingeY-.11-.04/2;
const dishBottom=grillLayout.dishY+roll.centerY-roll.radius;
const dishTop=grillLayout.dishY+roll.centerY+roll.radius;
assert(dishBottom>=lowerTop+.005,'Roll penetrates lower ridges');
assert(dishTop<=upperBottom-.005,'Roll penetrates closed upper ridges');
assert(roll.radius<grillLayout.ribWidth/2&&roll.halfLength<3.15/2,'Roll outside plate footprint');
// The multi-roll mode closes the lid once with the whole batch inside.
const batchRadius=roll.radius;
const batchHalfLength=roll.halfLength+.02;
assert(batchHalfLength<3.15/2,'Batch roll extends beyond the grill plate');
const batchBottom=batchRollLayout.grillTop+batchRollLayout.grillGap;
assert(batchBottom>=lowerTop+.005,'Batch placement penetrates the lower grill');
assert(batchBottom+2*batchRadius<=upperBottom-.005,'Batch roll extends into the closed lid');
// Bound the underside of the open lid at the rear end of a roll in transit.
const openAngle=-grillLayout.openAngle;
const openLidAtRearTip=grillLayout.y+grillLayout.hingeY
 - .13/Math.cos(openAngle)+(-batchHalfLength-grillLayout.hingeZ)*Math.tan(openAngle);
const transferBottom=grillLayout.transferY+roll.centerY-roll.radius;
assert(transferBottom>grillLayout.y+lowerTop+.005,'Moving rolls intersect the lower plate');
assert(transferBottom+2*roll.radius<openLidAtRearTip-.005,'Moving rolls intersect the open lid');
for(const quantity of [2,3]){
 const slots=Array.from({length:quantity},(_,item)=>centeredSlot(item,quantity,batchRollLayout.spacing));
 for(const [index,slot] of slots.entries()){
  assert(Math.abs(slot)+batchRadius<grillLayout.ribWidth/2,`Roll ${index+1} of ${quantity} extends beyond the grill plate`);
  if(index>0)assert(slot-slots[index-1]>2*batchRadius,`Adjacent rolls overlap in a batch of ${quantity}`);
 }
}
// Board and grill are disjoint in plan, for any lid angle around its X hinge.
const board={minX:-2.85,maxX:2.85,minZ:-2.125,maxZ:2.125};
const grillMinX=grillLayout.x-grillLayout.width/2,boardGap=grillMinX-board.maxX;
assert(boardGap>=.2,'Grill intersects board or has insufficient separation');
const outerSlot=centeredSlot(2,3,batchRollLayout.spacing);
const batchHalfWidth=outerSlot+batchRadius;
const trayInnerHalfWidth=servingLayout.trayWidth/2-.11;
const trayInnerHalfDepth=servingLayout.trayDepth/2-.11;
assert(batchHalfWidth<batchRollLayout.stagingWidth/2&&batchHalfLength<batchRollLayout.stagingDepth/2,'Full-size rolls overhang the staging board');
assert(batchRollLayout.stagingX+batchRollLayout.stagingWidth/2<board.minX,'Staging board overlaps work board');
assert(Math.abs(servingLayout.rollCenterX)+batchHalfWidth<trayInnerHalfWidth&&batchHalfLength<trayInnerHalfDepth,'Full-size rolls overhang the serving tray');
const extraHalfWidth=.31,extraHalfDepth=.22;
const leftExtra=servingLayout.extraCenterX-servingLayout.extraSpacingX/2-extraHalfWidth;
assert(servingLayout.rollCenterX+batchHalfWidth<leftExtra,'Extras overlap the shawarma on the tray');
assert(servingLayout.extraCenterX+servingLayout.extraSpacingX/2+extraHalfWidth<trayInnerHalfWidth,'Extras overhang a tray edge');
assert(1.5*servingLayout.extraSpacingZ+extraHalfDepth<trayInnerHalfDepth,'Four rows of extras exceed the tray depth');
assert(servingLayout.shelfWidth>servingLayout.trayWidth&&servingLayout.shelfDepth>servingLayout.trayDepth,'Tray does not fit on serving shelf');

// Include the enlarged tray hitbox and its forward offset.
const trayHalfX=.61,trayHalfZ=.63;
for(let i=0;i<trayLayout.xs.length;i++){
 const x=trayLayout.xs[i];assert(trayLayout.z+trayHalfZ<board.minZ-.15,'Tray intersects board');
 const grillMinZ=grillLayout.z-1.6-Math.hypot(.22,.1);
 assert(x+trayHalfX<grillMinX-.1||trayLayout.z+trayHalfZ<grillMinZ-.1,'Tray intersects grill');
 if(i)assert(x-trayLayout.xs[i-1]>2*trayHalfX,'Tray envelopes overlap');
}
// The enlarged bottle hitboxes form a separate row behind the trays.
const sauceHalfX=.54,sauceHalfZ=.58;
assert(sauceStation.z+sauceHalfZ<trayLayout.z-.5,'Sauce row intersects food trays');
assert(sauceStation.z-.45> -5.3-.001,'Sauce bowls intersect rear wall');
for(let i=0;i<sauceStation.xs.length;i++){
 const x=sauceStation.xs[i];assert(sauceStation.z+sauceHalfZ<board.minZ,'Sauce row intersects board');
 assert(sauceStation.z+sauceHalfZ<grillLayout.z-1.6-Math.hypot(.22,.1),'Sauce row intersects grill');
 if(i)assert(x-sauceStation.xs[i-1]>2*sauceHalfX,'Sauce bowls overlap');
}
assert(Math.abs(grillLayout.y+.18-.35/2-(-.155))<1e-6,'Grill base does not rest on counter');
for(const g of new Set(geometries))g.dispose();
console.log(JSON.stringify({result:'PASS',chickenPieces:ingredientPieceCount('chicken'),layers:'1..10',ingredientModels:foodIds.length,vertexChecks:checks,minimumMargins:{grillBoard:boardGap,trayBoard:board.minZ-(trayLayout.z+trayHalfZ),fillingRadial:roll.radius-radial,fillingAxial:roll.halfLength-longitudinal,endRadial:roll.radius-endRadial,endAxial:roll.halfLength-endLength,lowerGrill:dishBottom-lowerTop,closedLid:upperBottom-dishTop},scope:'final poses only; RoundedBox enclosed by boxes; no transition/collision simulation'},null,2));
