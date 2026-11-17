import {ingredients} from './data';
import {MAX_FILLINGS,type IngredientId} from './domain';
import {extrasMenu,type ExtraId} from './extraMenuCatalog';

export const ORDER_DRAFT_KEY='shawarma-craft:order-draft:v1';
export const MAX_SHAWARMA_QUANTITY=3;
export const MAX_EXTRA_QUANTITY=20;
export type ExtraQuantities=Partial<Record<ExtraId,number>>;
export type OrderDraft={
 version:1;
 shawarmas:{baseId:string|null;ingredientIds:IngredientId[];strictOrder?:boolean}[];
 activeIndex:number;
 extras:ExtraQuantities;
 grill:boolean;
};
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;

const ingredientsById=new Set<string>(ingredients.map(item=>item.id));
const extrasById=new Set<string>(extrasMenu.map(item=>item.id));
function object(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

export function parseOrderDraft(raw:string):OrderDraft|null{
 let value:unknown;
 try{value=JSON.parse(raw)}catch{return null}
 if(!object(value)||value.version!==1||typeof value.grill!=='boolean')return null;
 const {shawarmas,activeIndex,extras}=value;
 if(!Array.isArray(shawarmas)||shawarmas.length>MAX_SHAWARMA_QUANTITY)return null;
 if(typeof activeIndex!=='number'||!Number.isInteger(activeIndex)||activeIndex<0||(shawarmas.length?activeIndex>=shawarmas.length:activeIndex!==0))return null;
 if(!object(extras))return null;
 const validatedShawarmas:OrderDraft['shawarmas']=[];
 for(const shawarma of shawarmas){
  if(!object(shawarma)||!Array.isArray(shawarma.ingredientIds))return null;
  const {baseId,ingredientIds,strictOrder}=shawarma;
  if(strictOrder!==undefined&&typeof strictOrder!=='boolean')return null;
  if(baseId!==null&&(typeof baseId!=='string'||baseId.length>80||!/^[-a-zA-Z0-9_]+$/.test(baseId)))return null;
  if(ingredientIds.length>MAX_FILLINGS||new Set(ingredientIds).size!==ingredientIds.length)return null;
  if(ingredientIds.some(id=>typeof id!=='string'||!ingredientsById.has(id)))return null;
  validatedShawarmas.push({baseId,ingredientIds:ingredientIds as IngredientId[],...(strictOrder?{strictOrder}:{})});
 }
 const validatedExtras:ExtraQuantities={};
 for(const [id,count] of Object.entries(extras)){
  if(!extrasById.has(id)||typeof count!=='number'||!Number.isInteger(count)||count<1||count>MAX_EXTRA_QUANTITY)return null;
  validatedExtras[id as ExtraId]=count;
 }
 return {version:1,shawarmas:validatedShawarmas,activeIndex,extras:validatedExtras,grill:value.grill};
}

function storageFor(storage?:StorageAccess){
 if(storage)return storage;
 if(typeof window==='undefined')return undefined;
 return window.localStorage;
}

export function readOrderDraft(storage?:StorageAccess):{draft:OrderDraft|null;status:'ready'|'empty'|'invalid'|'unavailable'}{
 try{
  const target=storageFor(storage);
  if(!target)return {draft:null,status:'unavailable'};
  const raw=target.getItem(ORDER_DRAFT_KEY);
  if(raw===null)return {draft:null,status:'empty'};
  const draft=parseOrderDraft(raw);
  return draft?{draft,status:'ready'}:{draft:null,status:'invalid'};
 }catch{return {draft:null,status:'unavailable'}}
}

export function saveOrderDraft(draft:OrderDraft,storage?:StorageAccess):boolean{
 try{
  const target=storageFor(storage);
  if(!target)return false;
  target.setItem(ORDER_DRAFT_KEY,JSON.stringify(draft));
  return true;
 }catch{return false}
}
