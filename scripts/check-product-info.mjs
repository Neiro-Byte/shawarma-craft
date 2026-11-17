import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const modules=new Map();
function compile(name){
 if(modules.has(name))return modules.get(name);
 const tsx=new URL(`../src/${name}.tsx`,import.meta.url);
 const source=readFileSync(existsSync(tsx)?tsx:new URL(`../src/${name}.ts`,import.meta.url),'utf8');
 const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 const code=result.outputText
  .replace(/import ['"][^'"]+\.css['"];?/g,'')
  .replace(/from ['"]\.\/(data|domain|extraMenuCatalog|productInfo)['"]/g,(_,dependency)=>`from '${compile(dependency)}'`)
  .replace(/from ['"](react(?:\/jsx-runtime)?)['"]/g,(_,dependency)=>`from '${import.meta.resolve(dependency)}'`);
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
 modules.set(name,url);
 return url;
}
const {createProductInfo,validateProductInfo,loadProductInfo,saveProductInfo,summarizeProductInfo,PRODUCT_INFO_KEY}=await import(compile('productInfo'));
const initial=createProductInfo();
assert.equal(Object.keys(initial.ingredients).length,24);
assert.equal(Object.keys(initial.extras).length,8);
for(const record of [...Object.values(initial.ingredients),...Object.values(initial.extras)]){
 assert.deepEqual(record,{verified:false,allergens:[],spice:null,crossContactNote:'',verifiedAt:null});
}
initial.ingredients.fries.allergens.push('milk');
assert.deepEqual(initial.extras.fries.allergens,[]);
assert.deepEqual(createProductInfo().ingredients.fries.allergens,[]);

const verified=(allergens,spice,note='')=>({verified:true,allergens,spice,crossContactNote:note,verifiedAt:'2026-11-16'});
const settings=createProductInfo();
settings.ingredients.cheese=verified(['milk'],0,'Общая рабочая поверхность');
settings.ingredients.tahini=verified(['sesame'],1,'Общая рабочая поверхность');
settings.extras.fries=verified(['gluten'],2);
let result=summarizeProductInfo(settings,{ingredients:['cheese','tahini','cheese'],extras:['fries']});
assert.equal(result.incomplete,false);
assert.deepEqual(result.allergens,['gluten','milk','sesame']);
assert.equal(result.spice,2);
assert.deepEqual(result.crossContactNotes,['Общая рабочая поверхность']);
settings.ingredients.hot={verified:false,allergens:['mustard'],spice:null,crossContactNote:'',verifiedAt:null};
result=summarizeProductInfo(settings,{ingredients:['cheese','hot'],extras:[]});
assert.equal(result.incomplete,true);
assert.equal(result.spice,null);
assert.equal(result.knownMaxSpice,0);
assert.deepEqual(result.unverified,[{kind:'ingredient',id:'hot'}]);
assert.deepEqual(result.unknownSpice,[{kind:'ingredient',id:'hot'}]);
assert.deepEqual(result.allergens,['milk','mustard']);
settings.extras.water=verified([],null);
assert.equal(summarizeProductInfo(settings,{ingredients:[],extras:['water']}).incomplete,true);
settings.extras.water.spice=0;
result=summarizeProductInfo(settings,{ingredients:[],extras:['water']});
assert.equal(result.incomplete,false);
assert.deepEqual(result.allergens,[]);
result=summarizeProductInfo(settings,{ingredients:['bad-id'],extras:['__proto__']});
assert.equal(result.incomplete,true);
assert.equal(result.unknownProducts.length,2);
assert.deepEqual(summarizeProductInfo(settings,{ingredients:[],extras:[]}),{
 empty:true,incomplete:false,allergens:[],spice:null,knownMaxSpice:null,unverified:[],unknownSpice:[],unknownProducts:[],crossContactNotes:[],
});
assert.equal(summarizeProductInfo({version:900}, {ingredients:['cheese'],extras:[]}).incomplete,true);

let cases=0;
for(const info of [
 {...verified([],0),verified:'true'}, {...verified([],0),verifiedAt:null},
 {...verified([],0),verifiedAt:'2026-02-30'}, {...verified([],0),verifiedAt:'yesterday'},
 {...verified([],0),allergens:['invented']}, {...verified([],0),allergens:['milk','milk']},
 {...verified([],0),allergens:'milk'}, {...verified([],0),spice:undefined},
 {...verified([],0),spice:'0'}, {...verified([],0),spice:-1}, {...verified([],0),spice:4},
 {...verified([],0),spice:1.5}, {...verified([],0),spice:NaN},
 {...verified([],0),crossContactNote:'x'.repeat(301)}, {...verified([],0),crossContactNote:null},
 {...verified([],0),verified:false},
]){
 const candidate=createProductInfo();
 candidate.ingredients.chicken=info;
 assert.equal(validateProductInfo(candidate).ok,false);cases++;
}
for(const candidate of [
 null,[],{version:2,ingredients:{},extras:{}},{version:1,ingredients:[],extras:{}},
 {version:1,ingredients:{newProduct:verified([],0)},extras:{}},
 {version:1,ingredients:{},extras:{chicken:verified([],0)}},
 JSON.parse('{"version":1,"ingredients":{"__proto__":{}},"extras":{}}'),
]){
 assert.equal(validateProductInfo(candidate).ok,false);cases++;
}
const partial=validateProductInfo({version:1,ingredients:{cheese:verified(['milk'],0)},extras:{}});
assert(partial.ok);
assert.equal(partial.settings.ingredients.cheese.verified,true);
assert.equal(partial.settings.ingredients.chicken.verified,false);
assert.equal(partial.settings.extras.water.spice,null);
assert.equal(validateProductInfo({version:1,ingredients:{cheese:verified([],0,'  проба  ')},extras:{}}).settings.ingredients.cheese.crossContactNote,'проба');
const data=new Map([['shawarma-craft:favorite-recipe','unchanged']]);
const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
assert.equal(loadProductInfo(storage).status,'empty');
assert.equal(saveProductInfo(settings,storage).ok,true);
assert.deepEqual(loadProductInfo(storage),{status:'ready',settings:validateProductInfo(settings).settings});
assert.equal(data.get('shawarma-craft:favorite-recipe'),'unchanged');
const saved=data.get(PRODUCT_INFO_KEY);
assert.equal(saveProductInfo({version:2},storage).ok,false);
assert.equal(data.get(PRODUCT_INFO_KEY),saved);
for(const corrupt of ['{','null',JSON.stringify({version:77}),'x'.repeat(60001)]){
 data.set(PRODUCT_INFO_KEY,corrupt);
 const loaded=loadProductInfo(storage);
 assert.equal(loaded.status,'invalid');
 assert.equal(loaded.settings.ingredients.cheese.verified,false);
 assert.equal(data.get(PRODUCT_INFO_KEY),corrupt);
}
const blocked={getItem(){throw Error('denied')},setItem(){throw Error('quota')}};
assert.equal(loadProductInfo(blocked).status,'unavailable');
assert.equal(saveProductInfo(settings,blocked).ok,false);
assert.equal(loadProductInfo().status,'unavailable');
assert.equal(saveProductInfo(settings).ok,false);
const copy=validateProductInfo(settings);
assert(copy.ok);
copy.settings.ingredients.cheese.allergens.push('eggs');
assert.deepEqual(settings.ingredients.cheese.allergens,['milk']);
console.log(`PASS productInfo: ${cases} rejected inputs; defaults, namespaces, partial and unknown summaries, storage failures and copy isolation.`);

const Summary=(await import(compile('ProductInfoSummary'))).default;
const Panel=(await import(compile('ProductInfoPanel'))).default;
const selected={ingredients:['cheese'],extras:[]};
const initialMarkup=renderToStaticMarkup(createElement(Summary,{settings:createProductInfo(),selection:selected}));
assert(initialMarkup.includes('Сведения неполные'));
assert(initialMarkup.includes('Пустой список аллергенов не означает их отсутствие'));
assert(initialMarkup.includes('Не проверено заведением'));
const readyMarkup=renderToStaticMarkup(createElement(Summary,{settings,selection:selected}));
assert(readyMarkup.includes('Молоко'));
assert(!readyMarkup.includes('Сведения неполные'));
const emptyMarkup=renderToStaticMarkup(createElement(Summary,{settings,selection:{ingredients:[],extras:[]}}));
assert(emptyMarkup.includes('Состав пока не выбран'));
const panelMarkup=renderToStaticMarkup(createElement(Panel,{settings:createProductInfo(),onSave:()=>null,onClose:()=>{}}));
assert(panelMarkup.includes('Не проверено заведением'));
assert.equal((panelMarkup.match(/type="checkbox"/g)||[]).length,15);
assert(panelMarkup.includes('Не указана'));
const checkedMarkup=renderToStaticMarkup(createElement(Panel,{
 settings,catalog:{ingredients:[{id:'cheese',name:'Сыр из меню'}],extras:[]},onSave:()=>null,onClose:()=>{},
}));
assert(checkedMarkup.includes('Сыр из меню'));
assert(checkedMarkup.includes('2026-11-16'));
console.log('PASS productInfo UI: unknown, empty, declared milk, menu names, confirmation date and labeled editor controls.');
