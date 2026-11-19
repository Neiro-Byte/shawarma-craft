import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {Box3,Euler,Group,Matrix4,Quaternion,Ray,Vector3} from 'three';

const helperURL=new URL('../src/ingredientFlight.ts',import.meta.url);
assert(existsSync(helperURL),'Нет src/ingredientFlight.ts. Тест требует реальные exports ingredientFlightPoint и worldToIngredientSource.');
const modules=new Map();
function compile(url){
 const key=url.href;
 if(modules.has(key))return modules.get(key);
 const source=readFileSync(url,'utf8');
 const {outputText}=ts.transpileModule(source,{
  fileName:fileURLToPath(url),
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
 });
 const code=outputText
  .replace(/from ['"](\.\.?\/[^'"]+)['"]/g,(_,dependency)=>{
   const path=dependency.endsWith('.ts')?dependency:dependency+'.ts';
   return `from '${compile(new URL(path,url))}'`;
  })
  .replace(/from ['"]three['"]/g,`from '${import.meta.resolve('three')}'`);
 const result='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
 modules.set(key,result);
 return result;
}
const {ingredientFlightPoint,worldToIngredientSource}=await import(compile(helperURL));
const {piecePose,cheesePose,saucePoint,trayLayout,sauceStation,rotisserieLayout,ingredientPieceCount,servingLayout}=await import(compile(new URL('../src/sceneLayout.ts',import.meta.url)));
const {MAX_FILLINGS,ingredientMetadata,visualIngredientId}=await import(compile(new URL('../src/domain.ts',import.meta.url)));
assert.equal(MAX_FILLINGS,10);
assert.equal(typeof ingredientPieceCount,'function','Нет export ingredientPieceCount в sceneLayout.ts');
assert.equal(ingredientPieceCount('chicken'),16,'В порции должно быть 16 кусочков курицы');
assert.equal(ingredientPieceCount('lettuce'),7);
assert.equal(ingredientPieceCount('tomato'),9);
assert.equal(typeof ingredientFlightPoint,'function');
assert.equal(typeof worldToIngredientSource,'function');
function tuple(value,label){
 const result=value instanceof Vector3?value.toArray():value;
 assert(Array.isArray(result)&&result.length===3&&result.every(Number.isFinite),label+' должен вернуть конечную тройку чисел');
 return [...result];
}
function near(actual,expected,label,tolerance=1e-8){
 const result=tuple(actual,label);
 for(let i=0;i<3;i++)assert(Math.abs(result[i]-expected[i])<tolerance,`${label}, axis ${i}: ${result[i]} != ${expected[i]}`);
}
const sources=[
 ...trayLayout.xs.map(x=>[x,.055,trayLayout.z]),
 ...sauceStation.xs.map(x=>[x,0,sauceStation.z]),
 [-5.9,.25,-4.2],[5.9,.25,-4.2],[0,.85,1.2],
 [...rotisserieLayout.cutPoint],
];
const targets=[];
for(let layer=0;layer<MAX_FILLINGS;layer++){
 for(let i=0;i<ingredientPieceCount('chicken');i++){
  const {x,y,z}=piecePose(layer,i);
  targets.push([x,y,z]);
 }
 for(let i=0;i<65;i++){
  const {x,y,z}=cheesePose(layer,i);
  targets.push([x,y,z]);
 }
 for(const t of [0,.25,.5,.75,1])targets.push(saucePoint(layer,t));
}
assert.equal(targets.length,860,'Недостаточный охват конечных поз');
let paths=0;
for(const [index,target] of targets.entries()){
 const start=sources[index%sources.length];
 const beforeStart=[...start],beforeTarget=[...target];
 near(ingredientFlightPoint(start,target,0),start,'начало перелёта');
 near(ingredientFlightPoint(start,target,1),target,'конец перелёта');
 const middle=tuple(ingredientFlightPoint(start,target,.5),'середина');
 assert(middle[1]>(start[1]+target[1])/2+.5,'Дуга должна явно подниматься над прямой');
 near(ingredientFlightPoint(start,target,.5),tuple(ingredientFlightPoint(start,target,.5,1.1),'явный подъём'),'подъём по умолчанию');
 let previous=tuple(ingredientFlightPoint(start,target,0),'исходная точка');
 for(let step=1;step<=20;step++){
  const t=step/20;
  const point=tuple(ingredientFlightPoint(start,target,t),'траектория');
  const line=start.map((value,axis)=>value+(target[axis]-value)*t);
  assert(point[1]>=line[1]-1e-8,'Дуга не должна проходить ниже прямого отрезка');
  for(const axis of [0,2]){
   assert(point[axis]>=Math.min(start[axis],target[axis])-1e-8&&
    point[axis]<=Math.max(start[axis],target[axis])+1e-8,'Выход X/Z за диапазон концов');
   assert((point[axis]-previous[axis])*(target[axis]-start[axis])>=-1e-8,'Обратный ход X/Z');
  }
  near(ingredientFlightPoint(start,target,t,0),line,'прямой перелёт без подъёма');
  previous=point;
 }
 assert.deepEqual(start,beforeStart,'Функция изменила source');
 assert.deepEqual(target,beforeTarget,'Функция изменила target');
 // Landing centers stay within the established food area; this is not a collision envelope.
 assert(Math.abs(target[0])<=.62&&Math.abs(target[2])<=1.16&&target[1]>=.44&&target[1]<=1.02);
 paths++;
}
const same=[.1,.6,-.5];
near(ingredientFlightPoint(same,same,0),same,'нулевая дистанция, начало');
near(ingredientFlightPoint(same,same,1),same,'нулевая дистанция, конец');
assert(tuple(ingredientFlightPoint(same,same,.5),'нулевая дистанция')[1]>same[1]);

const matrices=[
 new Matrix4(),
 new Matrix4().makeTranslation(2,.7,-3),
 new Matrix4().compose(new Vector3(-4,.3,2),new Quaternion().setFromEuler(new Euler(.4,-.7,.2)),new Vector3(.5,1.2,2)),
];
const outer=new Group(),dish=new Group(),filling=new Group();
outer.position.set(-3,1.4,2);
outer.rotation.set(.1,.6,-.2);
outer.scale.set(1.1,.8,1.4);
dish.position.set(2,-.2,1);
dish.rotation.set(-.3,.2,.15);
filling.position.set(0,.56,0);
filling.scale.set(.34,.48,.83);
outer.add(dish);dish.add(filling);filling.updateWorldMatrix(true,false);
matrices.push(filling.matrixWorld.clone());
let conversions=0;
for(const matrix of matrices){
 const originalMatrix=matrix.elements.slice();
 for(const world of sources){
  const originalWorld=[...world];
  const local=tuple(worldToIngredientSource(world,matrix),'локальная точка');
  const recovered=new Vector3(...local).applyMatrix4(matrix);
  near(recovered,world,'обратная подстановка мировой точки');
  assert.deepEqual(world,originalWorld);
  assert.deepEqual(matrix.elements,originalMatrix,'Изменена matrixWorld');
  const target=[.2,.55,-.1];
  const finish=tuple(ingredientFlightPoint(local,target,1),'конец в локальной системе');
  near(new Vector3(...finish).applyMatrix4(matrix),new Vector3(...target).applyMatrix4(matrix).toArray(),'мировой конец');
  conversions++;
 }
}
// An intentional identity-only shortcut must not satisfy the transform checks.
assert.notDeepEqual(tuple(worldToIngredientSource([1,2,3],matrices[2]),'неединичное преобразование'),[1,2,3]);
console.log(`PASS ingredient flight: ${paths} target paths, 20 samples per path, ${conversions} world/local round trips; ingredients, all 65 cheese pieces/layer and sauce endpoints included.`);

// Check the finite sightline to the cutting point against the full shelf slab.
function segmentHitsBox(start,end,box){
 if(box.containsPoint(start)||box.containsPoint(end))return true;
 const direction=end.clone().sub(start),length=direction.length();
 if(length===0)return false;
 const hit=new Ray(start,direction.divideScalar(length)).intersectBox(box,new Vector3());
 return hit!==null&&start.distanceTo(hit)<=length+1e-8;
}
const cutCamera=new Vector3(...rotisserieLayout.camera);
const cutPoint=new Vector3(...rotisserieLayout.cutPoint);
const shelfBox=new Box3(
 new Vector3(servingLayout.shelfX-servingLayout.shelfWidth/2,servingLayout.shelfHeight-.20,servingLayout.shelfZ-servingLayout.shelfDepth/2),
 new Vector3(servingLayout.shelfX+servingLayout.shelfWidth/2,servingLayout.shelfHeight,servingLayout.shelfZ+servingLayout.shelfDepth/2),
);
assert(!segmentHitsBox(cutCamera,cutPoint,shelfBox),'Полка закрывает линию видимости точки среза');
const sightlineGap=shelfBox.min.x-Math.max(cutCamera.x,cutPoint.x);
assert(sightlineGap>0,'Линия среза должна целиком проходить слева от полки');
const blocker=new Box3().setFromCenterAndSize(cutCamera.clone().lerp(cutPoint,.5),new Vector3(.2,.2,.2));
assert(segmentHitsBox(cutCamera,cutPoint,blocker),'Контрольная преграда на пути не обнаружена');
const beyondCut=new Box3().setFromCenterAndSize(cutCamera.clone().lerp(cutPoint,1.5),new Vector3(.1,.1,.1));
assert(!segmentHitsBox(cutCamera,cutPoint,beyondCut),'Отрезок не должен учитывать преграду за точкой среза');
console.log('PASS cutting sightline: shelf does not intersect camera-to-cut segment; X clearance '+sightlineGap.toFixed(3)+'.');

// Exercise real component effects with stable hook slots and actual GSAP timelines.
// This targets the denseLayers clone regression, not React DOM or GPU rendering.
const THREE=await import('three');
const gsapModule=(await import('gsap')).default;
const gsap=gsapModule.gsap??gsapModule;
const sceneText=readFileSync(new URL('../src/Scene.tsx',import.meta.url),'utf8');
const sceneAST=ts.createSourceFile('Scene.tsx',sceneText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const worldDeclaration=sceneAST.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='World');
assert(worldDeclaration,'Не найден World');
let usesPieceCount=false;
function findPieceCount(node){
 if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='ingredientPieceCount')usesPieceCount=true;
 ts.forEachChild(node,findPieceCount);
}
findPieceCount(worldDeclaration);
assert(usesPieceCount,'World должен получать число кусочков через ingredientPieceCount');

const foodAST=ts.createSourceFile('Food.tsx',readFileSync(new URL('../src/Food.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const cheeseDeclaration=foodAST.statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations)
 .find(node=>node.name.getText(foodAST)==='CHEESE_STRIP_SIZE');
assert(cheeseDeclaration?.initializer,'Нет канонического CHEESE_STRIP_SIZE');
const cheeseStripSize=new Function('return ('+cheeseDeclaration.initializer.getText(foodAST)+')')();
assert(Array.isArray(cheeseStripSize)&&cheeseStripSize.length===3&&cheeseStripSize.every(value=>Number.isFinite(value)&&value>0));

function componentHarness(name,parentMatrix=new Matrix4()){
 const declaration=sceneAST.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
 assert(declaration,'Компонент '+name+' не найден');
 const compiled=ts.transpileModule(declaration.getText(sceneAST),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
 }).outputText.replace(/^import[^\n]*react\/jsx-runtime[^\n]*\n/g,'');
 const slots=[],timelines=[];
 let cursor=0,effects=[],killed=0,frame;
 const changed=(old,next)=>!old||old.length!==next.length||next.some((value,i)=>!Object.is(value,old[i]));
 const parent=new Group();parent.matrixAutoUpdate=false;parent.matrix.copy(parentMatrix);parent.updateWorldMatrix(true,false);
 const shelfBottle=new Group();
 shelfBottle.name='ingredient-tray-white';
 const scene=new Group();
 scene.add(shelfBottle);
 const invalidate=()=>{};
 const pointerListeners=new Map();
 const canvas={
  addEventListener(type,listener,capture){assert.equal(capture,true);pointerListeners.set(type,listener)},
  removeEventListener(type,listener){assert.equal(pointerListeners.get(type),listener);pointerListeners.delete(type)},
 };
 const jsx=(type,props)=>({type,props});
 const context={
  THREE,gsap,piecePose,cheesePose,saucePoint,rotisserieLayout,ingredientFlightPoint,worldToIngredientSource,
  sauceBottleScale:1.48,useThree:selector=>selector({scene,invalidate,gl:{domElement:canvas}}),sauceColors:{white:'#ffffff'},ingredientMetadata,visualIngredientId,Food:'food',SauceBottle:'bottle',CHEESE_STRIP_SIZE:cheeseStripSize,
  useFrame(callback){frame=callback},
  useRef(initial){const index=cursor++;slots[index]??={current:initial};return slots[index]},
  useMemo(factory,deps){
   const index=cursor++,previous=slots[index];
   if(!previous||changed(previous.deps,deps))slots[index]={value:factory(),deps};
   return slots[index].value;
  },
  useEffect(callback,deps){
   const index=cursor++,previous=slots[index];
   if(!previous||changed(previous.deps,deps))effects.push(()=>{
    previous?.cleanup?.();slots[index]={deps,cleanup:callback()};
   });
  },
  watchTimeline(timeline){
   timeline.pause(0);timelines.push(timeline);
   return()=>{killed++;timeline.kill()};
  },
  _jsx:jsx,_jsxs:jsx,_Fragment:'fragment',
 };
 context.useLayoutEffect=context.useEffect;
 const component=new Function('context','with(context){'+compiled+';return '+name+'}')(context);
 function attach(node,owner){
  if(!node)return;
  if(Array.isArray(node)){node.forEach(child=>attach(child,owner));return}
  if(!node.props)return;
  const {props,type}=node;
  if(type==='fragment'){attach(props.children,owner);return}
  if(type!=='group'&&type!=='mesh'&&type!=='instancedMesh')return;
  let object=props.ref?.current;
  if(!object){
   if(type==='group')object=new Group();
   else{
    const geometryNode=[props.children].flat().find(child=>child?.type?.endsWith?.('Geometry'));
    const geometry=props.geometry??(geometryNode?
     new THREE[geometryNode.type[0].toUpperCase()+geometryNode.type.slice(1)](...(geometryNode.props.args??[])):
     new THREE.BoxGeometry());
    object=type==='instancedMesh'?new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),props.args[2]):new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
   }
   if(props.ref)props.ref.current=object;
   owner.add(object);
   if(props.position)object.position.fromArray(props.position);
   if(props.rotation)object.rotation.set(...props.rotation);
   if(props.visible!==undefined)object.visible=props.visible;
  }
  attach(props.children,object);
 }
 return {
  timelines,parent,
  pointerListeners,
  pointer(type,x=0,y=0,pointerId=1,button=0){pointerListeners.get(type)?.({clientX:x,clientY:y,pointerId,button})},
  shelfBottle,
  render(props){cursor=0;effects=[];const tree=component(props);attach(tree,parent);effects.forEach(effect=>effect());return tree},
  frame(delta){frame?.({},delta)},
  killed:()=>killed,
  unmount(){slots.forEach(slot=>slot?.cleanup?.());parent.traverse(object=>{object.geometry?.dispose();object.material?.dispose()})},
 };
}
// Exercise the actual bread hit target without mounting a WebGL renderer.
const breadUndo=componentHarness('BreadUndoTarget');
let undos=0;
let breadTarget=breadUndo.render({enabled:true,onUndo:()=>undos++,children:null});
const tapBread=(delta=0)=>breadTarget.props.onClick({delta,stopPropagation(){}});
breadUndo.pointer('pointerdown');breadUndo.pointer('pointerup',3,3);tapBread();
assert.equal(undos,1,'Небольшое движение пальца должно считаться касанием');
tapBread();assert.equal(undos,1,'Один жест должен отменять только одну начинку');
breadUndo.pointer('pointerdown');breadUndo.pointer('pointermove',7,0);breadUndo.pointer('pointermove');breadUndo.pointer('pointerup');tapBread();
assert.equal(undos,1,'Вращение с возвратом к исходной точке не должно отменять начинку');
breadUndo.pointer('pointerdown');breadUndo.pointer('pointerdown',0,0,2);breadUndo.pointer('pointerup',0,0,2);breadUndo.pointer('pointerup');tapBread();
assert.equal(undos,1,'Масштабирование двумя пальцами не должно отменять начинку');
breadUndo.pointer('pointerdown');breadUndo.pointer('pointercancel');tapBread();
assert.equal(undos,1,'Отменённое касание не должно менять заказ');
breadUndo.pointer('pointerdown',0,0,1,2);breadUndo.pointer('pointerup',0,0,1,2);tapBread();
assert.equal(undos,1,'Правая кнопка не должна отменять начинку');
breadUndo.pointer('pointerdown');breadUndo.pointer('pointerup');tapBread(8);
assert.equal(undos,1,'R3F drag delta должен предотвращать отмену');
breadTarget=breadUndo.render({enabled:true,onUndo:()=>undos+=2,children:null});
assert.equal(breadUndo.pointerListeners.size,4,'Смена callback не должна пересоздавать слушателей');
breadUndo.pointer('pointerdown');breadUndo.pointer('pointerup');tapBread();
assert.equal(undos,3,'Касание должно использовать актуальный callback');
breadTarget=breadUndo.render({enabled:false,onUndo:()=>undos++,children:null});
assert.equal(breadTarget.props.onClick,undefined,'При сборке/выдаче отмена недоступна');
assert.equal(breadUndo.pointerListeners.size,0,'Отключение должно удалять слушателей');
breadUndo.render({enabled:true,onUndo:()=>undos++,children:null});
breadUndo.unmount();
assert.equal(breadUndo.pointerListeners.size,0,'Unmount должен удалять слушателей');
console.log('PASS bread undo: touch, drag-return, pinch, cancel, right-click, R3F delta, latest callback, disabled and cleanup.');

const movingParent=new Matrix4().compose(new Vector3(3,.4,-1),new Quaternion().setFromEuler(new Euler(0,.6,0)),new Vector3(.9,1.2,.8));
const falling=componentHarness('FallingPiece',movingParent);
const batch={key:71,id:'chicken',layer:2,source:[...rotisserieLayout.cutPoint]};
falling.render({batch,index:0,settle:false});
const moving=falling.parent.children[0];
const local=tuple(worldToIngredientSource(batch.source,movingParent),'component local source');
near(moving.position,[local[0]+.1,local[1],local[2]],'реальный старт FallingPiece');
assert.equal(falling.timelines.length,1);
assert.equal(falling.timelines[0].delay(),rotisserieLayout.cutDelay,'Не выдержана задержка нарезки');
falling.timelines[0].time(.5,false);
const intermediate=moving.position.toArray();
falling.render({batch:{...batch},index:0,settle:false});
assert.equal(falling.timelines.length,1,'Клонирование Batch перезапустило перелёт');
assert.equal(falling.killed(),0,'Клонирование Batch остановило перелёт');
near(moving.position,intermediate,'поза после shallow clone');
falling.render({batch:{...batch},index:0,settle:true});
const landing=piecePose(batch.layer,0);
near(moving.position,[landing.x,landing.y,landing.z],'settle FallingPiece');
assert.equal(falling.killed(),1,'Смена settle должна остановить GSAP');
falling.unmount();
for(let index=0;index<ingredientPieceCount('chicken');index++){
 const chicken=componentHarness('FallingPiece',movingParent);
 let completed=0;
 chicken.render({batch:{...batch,key:100+index},index,settle:false,onComplete:()=>completed++});
 const piece=chicken.parent.children[0],angle=index*2.399;
 near(piece.position,[local[0]+Math.cos(angle)*.1,local[1],local[2]+Math.sin(angle)*.1],'вертел, кусочек '+index);
 near(piece.scale,[1,1,1],'полный размер курицы');
 assert.equal(chicken.timelines[0].delay(),rotisserieLayout.cutDelay+index*.07,'Задержка кусочка курицы '+index);
 chicken.timelines[0].time(.94,false);
 assert.equal(completed,0,'Курица завершилась до приземления');
 chicken.timelines[0].progress(1,false);
 assert.equal(completed,1,'Нет сигнала завершения кусочка курицы');
 const target=piecePose(batch.layer,index);
 near(piece.position,[target.x,target.y,target.z],'приземление курицы '+index);
 chicken.unmount();
}

const sauce=componentHarness('Sauce');
const sauceBatch={key:72,id:'white',layer:2,source:[1.1,0,-4.85]};
let sauceCompleted=0;
const heldSauces=new Set();
const liftSauce=(id,key)=>{
 heldSauces.add(key);
 return {source:sauceBatch.source,putBack:()=>heldSauces.delete(key)};
};
const sauceTree=sauce.render({batch:sauceBatch,settle:false,liftSauce,onComplete:()=>sauceCompleted++});
assert.deepEqual([...heldSauces],[72],'Поднятая бутылка скрыта на полке');
assert.equal(sauce.shelfBottle.visible,false,'Полка меняется до первого кадра полёта');
const tube=sauceTree.props.children[0].props.geometry;
const bottleRef=sauceTree.props.children[1].props.ref;
const bottle=bottleRef.current;
const stream=bottle.children.find(child=>child instanceof THREE.Mesh);
assert(stream,'Не найден поток соуса');
near(bottle.position,sauceBatch.source,'реальный старт бутылки');
assert.equal(tube.drawRange.count,0,'Нанесение началось до прибытия бутылки');
sauce.timelines[0].time(.44,false);
assert.equal(tube.drawRange.count,0);
sauce.timelines[0].time(1.1,false);
assert(tube.drawRange.count>0&&Number.isFinite(tube.drawRange.count));
assert.equal(stream.visible,true);
stream.geometry.computeBoundingBox();
bottle.updateWorldMatrix(true,true);
const streamEnds=[stream.geometry.boundingBox.min.y,stream.geometry.boundingBox.max.y].map(y=>
 new Vector3(0,y,0).applyMatrix4(stream.matrixWorld));
const nozzle=new Vector3(0,.785,0).applyMatrix4(bottle.matrixWorld);
assert(Math.min(...streamEnds.map(point=>point.distanceTo(nozzle)))<1e-7,'Поток не касается кончика сопла');
const sauceAxis=new Vector3(bottle.position.x,saucePoint(sauceBatch.layer,0)[1],bottle.position.z);
const nearest=new THREE.Line3(...streamEnds).closestPointToPoint(sauceAxis,true,new Vector3());
assert(nearest.distanceTo(sauceAxis)<=.035,'Поток не достигает поверхности соуса');
const pouredCount=tube.drawRange.count;
const bottleIntermediate=bottle.position.toArray();
sauce.render({batch:{...sauceBatch},settle:false,liftSauce,onComplete:()=>sauceCompleted++});
assert.equal(sauce.timelines.length,1);
assert.equal(sauce.killed(),0);
assert.equal(tube.drawRange.count,pouredCount);
near(bottle.position,bottleIntermediate,'бутылка после shallow clone');
assert.equal(sauceCompleted,0);
sauce.timelines[0].progress(1,false);
assert.equal(sauceCompleted,1);
near(bottle.position,sauceBatch.source,'возврат бутылки к источнику');
assert.equal(bottle.visible,false);
assert.equal(stream.visible,false);
assert.equal(heldSauces.size,0,'Бутылка возвращается на полку при завершении');
assert.equal(sauce.shelfBottle.visible,true);
sauce.unmount();

const cancelledSauce=componentHarness('Sauce');
const catalogSauce=cancelledSauce.render({batch:{...sauceBatch,source:undefined},settle:false,liftSauce});
near(catalogSauce.props.children[1].props.ref.current.position,sauceBatch.source,'Старт с полки при выборе из меню');
assert.deepEqual([...heldSauces],[72]);
cancelledSauce.unmount();
assert.equal(heldSauces.size,0,'Отмена анимации возвращает бутылку на полку');
// Timing is part of the user-visible sound story, including cancellation.
const timedSauce=componentHarness('Sauce');
const sauceSounds=[];
timedSauce.render({batch:{...sauceBatch,key:810},settle:false,onSound:id=>sauceSounds.push(id)});
assert.equal(sauceSounds.length,0);
timedSauce.timelines[0].time(.44,false);
assert.equal(sauceSounds.length,0,'Pour sound starts only after arrival');
timedSauce.timelines[0].time(.46,false);
assert.deepEqual(sauceSounds,['white']);
timedSauce.render({batch:{...sauceBatch,key:810},settle:false,onSound:id=>sauceSounds.push(id)});
timedSauce.timelines[0].progress(1,false);
assert.equal(sauceSounds.length,1,'A render must not replay the pour sound');
timedSauce.unmount();
const cancelledPour=componentHarness('Sauce');
cancelledPour.render({batch:{...sauceBatch,key:811},settle:false,onSound:id=>sauceSounds.push(id)});
cancelledPour.timelines[0].time(.2,false);
cancelledPour.unmount();
assert.equal(sauceSounds.length,1,'Cancelled pour emits no delayed sound');

for(const index of [0,1]){
 const landing=componentHarness('FallingPiece');
 const hits=[];
 landing.render({batch:{...batch,key:820+index},index,settle:false,onSound:id=>hits.push(id)});
 landing.timelines[0].time(.94,false);
 assert.equal(hits.length,0);
 landing.timelines[0].time(.96,false);
 assert.equal(hits.length,index===0?1:0,'Only one sound per meat portion');
 landing.unmount();
}
const cheeseSound=componentHarness('CheeseRain');
const shreds=[];
cheeseSound.render({batch:{key:830,id:'cheese',layer:0},settle:false,onSound:id=>shreds.push(id)});
for(let frame=0;frame<17;frame++)cheeseSound.frame(.05);
assert.equal(shreds.length,0);
for(let frame=0;frame<35;frame++)cheeseSound.frame(.05);
assert.deepEqual(shreds,['cheese']);
cheeseSound.unmount();
console.log('PASS sound timing: pour arrival, cancellation, single meat landing and first cheese landing.');
const cheese=componentHarness('CheeseRain',movingParent);
const cheeseBatch={key:73,id:'cheese',layer:4,source:[-1,.055,-3.25]};
const cheeseTree=cheese.render({batch:cheeseBatch,settle:false});
const cheeseMesh=cheeseTree.props.ref.current;
cheese.frame(0);
const cheeseLocal=tuple(worldToIngredientSource(cheeseBatch.source,movingParent),'cheese local source');
const instance=new Matrix4();
cheeseMesh.getMatrixAt(0,instance);
near(new Vector3().setFromMatrixPosition(instance),[cheeseLocal[0]+.1,cheeseLocal[1],cheeseLocal[2]],'реальный старт сыра',1e-6);
for(let i=0;i<4;i++)cheese.frame(.05);
cheeseMesh.getMatrixAt(0,instance);
const cheeseBeforeClone=new Vector3().setFromMatrixPosition(instance).toArray();
cheese.render({batch:{...cheeseBatch},settle:false});
cheese.frame(0);
cheeseMesh.getMatrixAt(0,instance);
near(new Vector3().setFromMatrixPosition(instance),cheeseBeforeClone,'сыр после shallow clone',1e-6);
cheese.render({batch:{...cheeseBatch},settle:true});cheese.frame(0);
for(let i=0;i<65;i++){
 cheeseMesh.getMatrixAt(i,instance);
 const pose=cheesePose(cheeseBatch.layer,i);
 near(new Vector3().setFromMatrixPosition(instance),[pose.x,pose.y,pose.z],'settle сыр '+i,1e-6);
 const scale=new Vector3();instance.decompose(new Vector3(),new Quaternion(),scale);
 near(scale,[1,1,1],'полный размер сыра',1e-6);
}
cheese.unmount();
const completedCheese=componentHarness('CheeseRain');
let cheeseCompleted=0;
completedCheese.render({batch:{...cheeseBatch,key:75},settle:false,onComplete:()=>cheeseCompleted++});
for(let i=0;i<30;i++)completedCheese.frame(.05);
assert.equal(cheeseCompleted,0,'Следующий ингредиент начался до последней стружки');
for(let i=0;i<20;i++)completedCheese.frame(.05);
assert.equal(cheeseCompleted,1,'Сыр должен завершиться один раз после всех стружек');
completedCheese.unmount();
gsap.ticker.sleep();
console.log('PASS component effects: shallow Batch clones preserve piece/pour animations, transformed source and settle endpoints, pour starts after approach, bottle returns and stream connects nozzle to sauce; all 65 cheese instances start at source and settle at targets.');


const {recipePresets,recipeToBatches}=await import(compile(new URL('../src/data.ts',import.meta.url)));
const sequenceStart=sceneText.indexOf(' const [recipeCount,setRecipeCount]=useState(1);');
const sequenceEnd=sceneText.indexOf(' },[assemblingRecipe,recipeCount,invalidate]);',sequenceStart);
assert(sequenceStart>=0&&sequenceEnd>sequenceStart,'Не найдено последовательное построение рецепта');
const sequenceCode=ts.transpileModule(sceneText.slice(sequenceStart,sequenceEnd+' },[assemblingRecipe,recipeCount,invalidate]);'.length),{
 compilerOptions:{target:ts.ScriptTarget.ES2022},
}).outputText;
const renderSequence=new Function('context','with(context){'+sequenceCode+';return {visibleLayers,advanceRecipe,recipeAnimationPending}}');
for(const recipe of recipePresets){
 const layers=recipeToBatches(recipe),before=JSON.stringify(layers);
 let count=1;
 const scope={
  layers,animateRecipe:true,phase:'build',hasServingOrder:false,rotisserieLayout,activeUntil:{current:0},invalidate:()=>{},
  useState:()=>[count,update=>{count=typeof update==='function'?update(count):update}],
  useMemo:factory=>factory(),useCallback:callback=>callback,useEffect:()=>{},
 };
 for(let i=0;i<layers.length;i++){
  const preview=renderSequence(scope);
  assert.equal(preview.recipeAnimationPending,true);
  assert.deepEqual(preview.visibleLayers.map(item=>item.id),layers.slice(0,i+1).map(item=>item.id));
  assert(preview.visibleLayers.every(item=>item.settled===false));
  preview.advanceRecipe(99999);
  assert.equal(count,i+1,'Неверный callback изменил последовательность');
  preview.advanceRecipe(layers[i].key);
  assert.equal(count,i+2);
  if(i>0){preview.advanceRecipe(layers[i-1].key);assert.equal(count,i+2)}
 }
 assert.equal(renderSequence(scope).recipeAnimationPending,false);
 for(const state of [{animateRecipe:false},{phase:'folding'},{hasServingOrder:true}]){
  assert.deepEqual(renderSequence({...scope,...state}).visibleLayers,layers,'При отмене/приготовлении нужен полный состав');
 }
 assert.equal(JSON.stringify(layers),before,'Предпросмотр изменил сохранённый рецепт');
}
console.log('PASS recipe sequence: all presets reveal ingredients in order, completion callbacks wait for food/cheese/pour, stale callbacks are ignored, cooking/manual cancellation reveal the full recipe.');
