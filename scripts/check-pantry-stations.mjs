import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function compile(name){
 if(modules.has(name))return modules.get(name);
 const {outputText}=ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
 const code=outputText.replace(/from ['"]\.\/(data|domain)['"]/g,(_,dependency)=>`from '${compile(dependency)}'`);
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
}
const {stationFoodIds,stationSauceIds,stationPage}=await import(compile('pantryStations'));
const {ingredients}=await import(compile('data'));
assert.equal(stationFoodIds.length,16);assert.equal(stationSauceIds.length,7);
assert.deepEqual(new Set(['chicken',...stationFoodIds,...stationSauceIds]),new Set(ingredients.map(item=>item.id)));
for(const slots of [3,5])for(const ids of [stationFoodIds,stationSauceIds]){
 const all=[];const pages=stationPage(ids,undefined,0,slots).pages;
 for(let page=0;page<pages;page++){const view=stationPage(ids,undefined,page,slots);assert(view.ids.length<=slots);all.push(...view.ids)}
 assert.deepEqual(all,ids);assert.equal(new Set(all).size,ids.length);
 const available=ids.filter((_,i)=>i%2===0);
 const visible=[];const filtered=stationPage(ids,available,0,slots);
 for(let page=0;page<filtered.pages;page++)visible.push(...stationPage(ids,available,page,slots).ids);
 assert.deepEqual(visible,available);
 assert.deepEqual(stationPage(ids,[],99,slots),{ids:[],page:0,pages:1,total:0});
 const reduced=stationPage(ids,[ids[0]],99,slots);assert.equal(reduced.page,0);assert.deepEqual(reduced.ids,[ids[0]]);
 assert.equal(stationPage(ids,undefined,-1,slots).page,0);
}
console.log('Pantry stations passed: 16 containers, 7 sauce bottles and rotisserie cover all 24 products, pages and availability recovery.');
