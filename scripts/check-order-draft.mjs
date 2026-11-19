import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const modules = new Map();
function compile(moduleName) {
  if (modules.has(moduleName)) return modules.get(moduleName);
  const input = readFileSync(new URL(`../src/${moduleName}.ts`, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(input, {
    compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ES2022},
  });
  const code = outputText.replace(/from ['"]\.\/(data|domain|extraMenuCatalog|ingredientLibrary)['"]/g, (_,name)=>`from '${compile(name)}'`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  modules.set(moduleName,url);
  return url;
}

const {ORDER_DRAFT_KEY, parseOrderDraft, readOrderDraft,saveOrderDraft} = await import(compile('orderDraft'));
const original = {
  version:1,
  shawarmas:[
    {baseId:'classic',ingredientIds:['chicken','hot']},
    {baseId:'falafel',ingredientIds:['falafel','tahini']},
    {baseId:null,ingredientIds:[]},
  ],
  activeIndex:1,
  extras:{ayran:2,fries:1},
  grill:false,
};
const contents = new Map([['shawarma-craft:favorite-recipe','untouched']]);
const storage = {
  getItem:key=>contents.get(key)??null,
  setItem:(key,value)=>contents.set(key,value),
};
assert.deepEqual(readOrderDraft(storage),{draft:null,status:'empty'});
assert.equal(saveOrderDraft(original,storage),true);
assert.deepEqual(readOrderDraft(storage),{draft:original,status:'ready'});
assert.equal(contents.get('shawarma-craft:favorite-recipe'),'untouched');
for (const invalid of [
  {...original,version:2},
  {...original,activeIndex:3},
  {...original,extras:{fries:21}},
  {...original,extras:{fries:1.5}},
  {...original,extras:{unknown:1}},
  {...original,shawarmas:[{baseId:'classic',ingredientIds:['hot','hot']}]},
  {...original,shawarmas:[{baseId:null,ingredientIds:['unknown']}]},
  {...original,shawarmas:Array(4).fill(original.shawarmas[0])},
]) assert.equal(parseOrderDraft(JSON.stringify(invalid)),null);
contents.set(ORDER_DRAFT_KEY,'{');
assert.deepEqual(readOrderDraft(storage),{draft:null,status:'invalid'});
assert.equal(contents.get(ORDER_DRAFT_KEY),'{');
const blocked={
  getItem(){throw new Error('Denied')},
  setItem(){throw new Error('Quota')},
};
assert.deepEqual(readOrderDraft(blocked),{draft:null,status:'unavailable'});
assert.equal(saveOrderDraft(original,blocked),false);
console.log('PASS: separate recipes with an empty editor slot, extras and grill restore; malformed or unavailable storage remains recoverable.');

const onlyExtras={version:1,shawarmas:[],activeIndex:0,extras:{ayran:2},grill:false};
assert.deepEqual(parseOrderDraft(JSON.stringify(onlyExtras)),onlyExtras);
assert.equal(parseOrderDraft(JSON.stringify({...onlyExtras,activeIndex:1})),null);
assert.deepEqual(parseOrderDraft(JSON.stringify({...onlyExtras,extras:{}})),{...onlyExtras,extras:{}});

const orderedDraft = {
  ...original,
  shawarmas: [
    { baseId: 'classic', ingredientIds: ['hot', 'chicken'], strictOrder: true },
    original.shawarmas[1],
  ],
};
assert.equal(saveOrderDraft(orderedDraft, storage), true);
assert.deepEqual(readOrderDraft(storage).draft, orderedDraft, 'Strict order survives reload for the selected shawarma only');
