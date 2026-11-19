import {ingredients} from './data';
import {isCustomIngredientId,type IngredientId} from './domain';
import {extrasMenu,type ExtraId} from './extraMenuCatalog';

export const PRODUCT_INFO_KEY='shawarma-craft:product-info:v1';
export const allergenOptions=[
 {id:'gluten',label:'Злаки с глютеном'}, {id:'crustaceans',label:'Ракообразные'},
 {id:'eggs',label:'Яйца'}, {id:'fish',label:'Рыба'}, {id:'peanuts',label:'Арахис'},
 {id:'soy',label:'Соя'}, {id:'milk',label:'Молоко'}, {id:'nuts',label:'Орехи'},
 {id:'celery',label:'Сельдерей'}, {id:'mustard',label:'Горчица'}, {id:'sesame',label:'Кунжут'},
 {id:'sulphites',label:'Сульфиты'}, {id:'lupin',label:'Люпин'}, {id:'molluscs',label:'Моллюски'},
] as const;
export type AllergenId=typeof allergenOptions[number]['id'];
export type SpiceLevel=0|1|2|3;
export const spiceLabels=['Неострое','Слабоострое','Среднеострое','Острое'] as const;
export const PRODUCT_INFO_NOTICE='Пустой список аллергенов не означает их отсутствие.';
export type ProductInfo={
 verified:boolean;
 allergens:AllergenId[];
 spice:SpiceLevel|null;
 crossContactNote:string;
 verifiedAt:string|null;
};
export type ProductInfoSettings={
 version:1;
 ingredients:Record<IngredientId,ProductInfo>;
 extras:Record<ExtraId,ProductInfo>;
};
export type ProductInfoCatalog={
 ingredients:readonly {id:IngredientId;name:string}[];
 extras:readonly {id:ExtraId;title:string}[];
};
export type ProductInfoSelection={ingredients:readonly IngredientId[];extras:readonly ExtraId[]};
export type ProductReference={kind:'ingredient'|'extra';id:string};
export type ProductInfoResult={ok:true;settings:ProductInfoSettings}|{ok:false;error:string};
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;

const ingredientIds=new Set<string>(ingredients.map(item=>item.id));
const extraIds=new Set<string>(extrasMenu.map(item=>item.id));
const allergenIds=new Set<string>(allergenOptions.map(item=>item.id));
function object(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
export function unknownInfo():ProductInfo{
 return {verified:false,allergens:[],spice:null,crossContactNote:'',verifiedAt:null};
}
export function createProductInfo():ProductInfoSettings{
 return {
  version:1,
  ingredients:Object.fromEntries(ingredients.map(item=>[item.id,unknownInfo()])) as ProductInfoSettings['ingredients'],
  extras:Object.fromEntries(extrasMenu.map(item=>[item.id,unknownInfo()])) as ProductInfoSettings['extras'],
 };
}
function validDate(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00.000Z');
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
}
function parseInfo(value:unknown):ProductInfo|null{
 if(!object(value)||typeof value.verified!=='boolean'||!Array.isArray(value.allergens))return null;
 if(value.allergens.length>allergenOptions.length||new Set(value.allergens).size!==value.allergens.length||
  value.allergens.some(id=>typeof id!=='string'||!allergenIds.has(id)))return null;
 const {spice,crossContactNote,verifiedAt,allergens}=value;
 if(spice!==null&&(typeof spice!=='number'||!Number.isInteger(spice)||spice<0||spice>3))return null;
 if(typeof crossContactNote!=='string'||crossContactNote.length>300)return null;
 if(value.verified?!validDate(verifiedAt):verifiedAt!==null)return null;
 return {
  verified:value.verified,allergens:allergenOptions.filter(item=>allergens.includes(item.id)).map(item=>item.id),
  spice:spice as SpiceLevel|null,crossContactNote:crossContactNote.trim(),verifiedAt:verifiedAt as string|null,
 };
}
export function validateProductInfo(value:unknown):ProductInfoResult{
 if(!object(value)||value.version!==1)return {ok:false,error:'Версия сведений о составе не поддерживается.'};
 if(!object(value.ingredients)||!object(value.extras))return {ok:false,error:'Сведения о продуктах повреждены.'};
 const settings=createProductInfo();
 for(const [kind,known] of [['ingredients',ingredientIds],['extras',extraIds]] as const){
  const input=value[kind] as Record<string,unknown>;
  if(Object.keys(input).some(id=>!known.has(id)&&!(kind==='ingredients'&&isCustomIngredientId(id))))return {ok:false,error:'Обнаружен неизвестный идентификатор продукта.'};
  // Newly introduced or missing entries stay explicitly unverified.
  for(const [id,entry] of Object.entries(input)){
   const info=parseInfo(entry);
   if(!info)return {ok:false,error:'Проверь аллергены, остроту и дату подтверждения продукта.'};
   Object.assign(settings[kind],{[id]:info});
  }
 }
 return {ok:true,settings};
}
function storageFor(storage?:StorageAccess){
 if(storage)return storage;
 if(typeof window==='undefined')return undefined;
 return window.localStorage;
}
export function loadProductInfo(storage?:StorageAccess):{
 settings:ProductInfoSettings;status:'ready'|'empty'|'invalid'|'unavailable';
}{
 const fallback=createProductInfo();
 try{
  const target=storageFor(storage);
  if(!target)return {settings:fallback,status:'unavailable'};
  const raw=target.getItem(PRODUCT_INFO_KEY);
  if(raw===null)return {settings:fallback,status:'empty'};
  if(raw.length>60000)return {settings:fallback,status:'invalid'};
  const result=validateProductInfo(JSON.parse(raw));
  return result.ok?{settings:result.settings,status:'ready'}:{settings:fallback,status:'invalid'};
 }catch(error){
  return {settings:fallback,status:error instanceof SyntaxError?'invalid':'unavailable'};
 }
}
export function saveProductInfo(value:unknown,storage?:StorageAccess):ProductInfoResult{
 const result=validateProductInfo(value);
 if(!result.ok)return result;
 try{
  const target=storageFor(storage);
  if(!target)return {ok:false,error:'Хранилище браузера недоступно. Сведения не сохранены.'};
  target.setItem(PRODUCT_INFO_KEY,JSON.stringify(result.settings));
  return result;
 }catch{return {ok:false,error:'Сведения не сохранены. Хранилище браузера недоступно или заполнено.'}}
}
export type ProductInfoSummaryData={
 empty:boolean;
 incomplete:boolean;
 allergens:AllergenId[];
 spice:SpiceLevel|null;
 knownMaxSpice:SpiceLevel|null;
 unverified:ProductReference[];
 unknownSpice:ProductReference[];
 unknownProducts:ProductReference[];
 crossContactNotes:string[];
};
export function summarizeProductInfo(settings:ProductInfoSettings,selection:ProductInfoSelection):ProductInfoSummaryData{
 const checked=validateProductInfo(settings);
 const safe=checked.ok?checked.settings:createProductInfo();
 const summary:ProductInfoSummaryData={
  empty:selection.ingredients.length===0&&selection.extras.length===0,incomplete:false,
  allergens:[],spice:null,knownMaxSpice:null,unverified:[],unknownSpice:[],unknownProducts:[],crossContactNotes:[],
 };
 const allergens=new Set<AllergenId>(),notes=new Set<string>();
 for(const [kind,ids,known] of [
  ['ingredient',selection.ingredients,ingredientIds],['extra',selection.extras,extraIds],
 ] as const){
  for(const id of new Set(ids)){
   const reference={kind,id};
   if(!known.has(id)&&!(kind==='ingredient'&&isCustomIngredientId(id))){summary.unknownProducts.push(reference);continue}
   const info=(kind==='ingredient'?safe.ingredients[id as IngredientId]:safe.extras[id as ExtraId])??unknownInfo();
   if(!info.verified)summary.unverified.push(reference);
   if(info.spice===null)summary.unknownSpice.push(reference);
   else summary.knownMaxSpice=Math.max(summary.knownMaxSpice??0,info.spice) as SpiceLevel;
   info.allergens.forEach(id=>allergens.add(id));
   if(info.crossContactNote)notes.add(info.crossContactNote);
  }
 }
 summary.incomplete=summary.unverified.length>0||summary.unknownSpice.length>0||summary.unknownProducts.length>0;
 summary.spice=summary.unknownSpice.length||summary.unknownProducts.length?null:summary.knownMaxSpice;
 summary.allergens=allergenOptions.filter(item=>allergens.has(item.id)).map(item=>item.id);
 summary.crossContactNotes=[...notes];
 return summary;
}
