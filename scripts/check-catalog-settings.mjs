import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function compile(name){
 if(modules.has(name))return modules.get(name);
 const source=readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
 const code=outputText.replace(/from ['"]\.\/(data|domain|extraMenuCatalog|ingredientLibrary)['"]/g,(_,dependency)=>`from '${compile(dependency)}'`);
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
}
const {defaultCatalog,validateCatalogSettings,saveCatalog,loadCatalog,CATALOG_KEY}=await import(compile('catalogSettings'));
const original=JSON.stringify(defaultCatalog);
const changed=structuredClone(defaultCatalog);
changed.ingredients[0].name='Курица гриль';changed.ingredients[0].available=false;
changed.extras[0].available=false;changed.settings.grillDefault=false;
changed.recipes.push({id:'custom-test',title:'Мой рецепт',description:'',available:true,ingredientIds:['cheese','chicken'],sourceIds:[],emoji:'🌯',kind:'author'});
assert.equal(validateCatalogSettings(changed).ok,true);
assert.equal(JSON.stringify(defaultCatalog),original);
for(const mutate of [
 c=>c.ingredients[0].id='missing',
 c=>c.ingredients[1].id=c.ingredients[0].id,
 c=>c.ingredients[0].name='',
 c=>c.extras.pop(),
 c=>c.recipes.shift(),
 c=>c.recipes[0].ingredientIds=['chicken','chicken'],
 c=>c.recipes[0].ingredientIds=['missing'],
 c=>c.settings.grillDefault='true',
 c=>c.settings.title=''.padEnd(61,'a'),
]){const c=structuredClone(changed);mutate(c);assert.equal(validateCatalogSettings(c).ok,false);}
const map=new Map([['unrelated','keep']]);
globalThis.window={localStorage:{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}};
assert.equal(saveCatalog(changed).ok,true);
assert.deepEqual(loadCatalog().catalog,validateCatalogSettings(changed).catalog);
assert.equal(map.get('unrelated'),'keep');
map.set(CATALOG_KEY,'{');assert.notEqual(loadCatalog().warning,'');
window.localStorage.setItem=()=>{throw Error('full')};assert.equal(saveCatalog(changed).ok,false);
window.localStorage.getItem=()=>{throw Error('blocked')};assert.notEqual(loadCatalog().warning,'');
assert.equal(JSON.stringify(defaultCatalog),original);
console.log('Catalog settings passed: edits, availability, custom recipes, invalid schemas and storage failures.');
