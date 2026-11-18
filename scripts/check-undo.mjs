import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const appText=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const appAst=ts.createSourceFile('App.tsx',appText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions=new Map();
function visit(node){
 if(ts.isFunctionDeclaration(node)&&node.name&&['undoLastIngredient','updateActiveDraft'].includes(node.name.text)){
  assert(!functions.has(node.name.text),`Ambiguous production function ${node.name.text}`);
  functions.set(node.name.text,node.getText(appAst));
 }
 ts.forEachChild(node,visit);
}
visit(appAst);
assert.equal(functions.size,2,'The production undo and draft updater functions must both be available');
const compilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022};
const handlerCode=ts.transpileModule([...functions.values()].join('\n'),{compilerOptions}).outputText;
const dataText=readFileSync(new URL('../src/data.ts',import.meta.url),'utf8');
const dataCode=ts.transpileModule(dataText,{compilerOptions}).outputText;
const data=await import('data:text/javascript;base64,'+Buffer.from(dataCode).toString('base64'));
assert.equal(typeof data.latestManualBatch,'function');

function batch(id,key,layer){return Object.freeze({id,key,layer,settled:true});}
function draft(batches,baseId='classic'){
 return Object.freeze({baseId,strictOrder:true,batches:Object.freeze(batches)});
}
function harness(activeDraft,{muted=false,locked=false,inactiveDraft}={}){
 const queues=[];
 const sounds=[];
 const animations=[];
 const notices=[];
 let stops=0;
 const inactive=inactiveDraft??draft([batch('beef',21,0)],'beef');
 let editor={drafts:[inactive,activeDraft],activeIndex:1};
 const context={
  activeOrder:{current:locked?{id:'locked-order'}:undefined},
  batches:activeDraft.batches,
  muted,
  latestManualBatch:data.latestManualBatch,
  setAnimateRecipe:value=>animations.push(value),
  setNotice:value=>notices.push(value),
  stopSounds:()=>{stops++;},
  sound:(...args)=>sounds.push(args),
  // Queue the exact production state reducer, just as React batches updates.
  setEditor:update=>queues.push(update),
 };
 const {undoLastIngredient}=new Function('context',`with(context){${handlerCode};return {undoLastIngredient};}`)(context);
 return {
  undo:undoLastIngredient,
  state:()=>editor,
  queueCount:()=>queues.length,
  sounds,animations,notices,
  stopCount:()=>stops,
  flush({replay=false}={}){
   while(queues.length){
    const update=queues.shift();
    const next=update(editor);
    if(replay){
     const repeated=update(editor);
     assert.deepEqual(repeated,next,'A React replay of the production updater is deterministic');
    }
    editor=next;
   }
   // Represent the next render's composition for the handler's early guard.
   context.batches=editor.drafts[editor.activeIndex].batches;
   return editor.drafts[editor.activeIndex];
  },
 };
}
const ids=value=>value.batches.map(item=>item.id);

// Two events arrive through the same handler closure before React commits either.
const initial=draft([
 batch('lettuce',-1,0),batch('chicken',-2,1),batch('tomato',5,2),batch('white',8,3),
]);
const two=harness(initial);
const inactive=two.state().drafts[0];
two.undo();two.undo();
assert.equal(two.queueCount(),2);
assert.equal(two.state().drafts[1],initial,'The two state changes really are still queued');
assert.deepEqual(two.sounds,[['remove',true],['remove',true]]);
const soundCountBeforeFlush=two.sounds.length;
assert.deepEqual(ids(two.flush({replay:true})),['lettuce','chicken'],'Queued taps remove two latest additions, never toggle one back on');
assert.equal(two.state().drafts[0],inactive,'Undo only changes the active shawarma');
assert.equal(two.state().drafts[1].baseId,'classic');
assert.equal(two.state().drafts[1].strictOrder,true);
assert.deepEqual(ids(initial),['lettuce','chicken','tomato','white'],'The original recipe remains immutable');
assert.equal(two.sounds.length,soundCountBeforeFlush,'Updater execution and StrictMode replay must not produce extra audio');
assert.equal(two.stopCount(),2);
assert.deepEqual(two.animations,[false,false]);
assert.deepEqual(two.notices,['','']);

// Once manual additions are gone, taps continue to remove preset ingredients.
two.undo();two.undo();
assert.deepEqual(ids(two.flush()),[],'Preset fallback removes remaining layers in reverse order');
const afterEmpty={sounds:two.sounds.length,stops:two.stopCount(),animations:two.animations.length,notices:two.notices.length};
const emptyEditor=two.state();
two.undo();
assert.equal(two.queueCount(),0,'An empty composition is a no-op');
assert.equal(two.state(),emptyEditor);
assert.deepEqual({sounds:two.sounds.length,stops:two.stopCount(),animations:two.animations.length,notices:two.notices.length},afterEmpty);

const presets=harness(draft([batch('lettuce',-1,4),batch('chicken',-2,0),batch('white',-3,1)]));
presets.undo();
assert.deepEqual(ids(presets.flush()),['lettuce','chicken'],'Preset undo follows composition order, not layer number or negative key magnitude');

const reordered=harness(draft([batch('tomato',19,0),batch('onion',4,2),batch('lettuce',-1,1)]));
reordered.undo();
assert.deepEqual(ids(reordered.flush()),['onion','lettuce'],'Manual chronology uses the greatest positive key even after recipe reordering');
reordered.undo();
assert.deepEqual(ids(reordered.flush()),['lettuce']);

const locked=harness(initial,{locked:true});
const lockedEditor=locked.state();
locked.undo();
assert.equal(locked.queueCount(),0,'A placed order cannot be modified');
assert.equal(locked.state(),lockedEditor);
assert.deepEqual(locked.sounds,[]);
assert.equal(locked.stopCount(),0);
assert.deepEqual(locked.animations,[]);
assert.deepEqual(locked.notices,[]);

const muted=harness(draft([batch('onion',2,0)]),{muted:true});
muted.undo();
assert.deepEqual(ids(muted.flush({replay:true})),[],'Effects mute never prevents ingredient removal');
assert.deepEqual(muted.sounds,[['remove',false]],'Muted undo requests only the disabled removal effect');
assert.equal(muted.stopCount(),1);
muted.undo();
assert.deepEqual(muted.sounds,[['remove',false]],'No extra sound is requested after the final filling is gone');

console.log('PASS undo: exact App handler/updater, queued taps, no re-add, immutable drafts, preset fallback, manual chronology after reorder, locked order, muted removal and side-effect-free replay.');
