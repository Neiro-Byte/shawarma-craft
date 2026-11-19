export type CoreIngredientId = 'chicken'|'beef'|'tomato'|'cucumber'|'lettuce'|'cheese'|'onion'|'white'|'hot'|'pepper'|'cabbage'|'pickle'|'carrot'|'fries'|'falafel'|'mushroom'|'jalapeno'|'beans'|'corn'|'cheeseSauce'|'bbq'|'tomatoSauce'|'yogurt'|'tahini';
export type IngredientId=CoreIngredientId|`custom-${string}`;
export type IngredientCategory='protein'|'vegetable'|'extra'|'sauce';
export type Item={id:IngredientId;name:string;emoji:string;color:string;note:string;category:IngredientCategory;image?:string;visualId?:CoreIngredientId;surchargeKopecks?:number};
export type RecipePreset={id:string;title:string;emoji:string;description:string;ingredientIds:IngredientId[];sourceIds:string[];kind:'classic'|'author'};
export type MenuSource={id:string;name:string;url:string;verifiedOn:string;note:string;scope:'moscow'|'reference'};
export const SAUCE_IDS:ReadonlySet<IngredientId>=new Set(['white','hot','cheeseSauce','bbq','tomatoSauce','yogurt','tahini']);
const customVisuals=new Map<IngredientId,Item>();
export const isCustomIngredientId=(id:unknown):id is `custom-${string}`=>typeof id==='string'&&/^custom-[a-z0-9][a-z0-9_-]{0,72}$/.test(id);
export function registerIngredientVisuals(items:readonly Item[]):void{
 customVisuals.clear();
 for(const item of items)if(isCustomIngredientId(item.id))customVisuals.set(item.id,{...item});
}
export const ingredientMetadata=(id:IngredientId)=>customVisuals.get(id);
export const registeredCustomIngredients=()=>Array.from(customVisuals.values());
export function visualIngredientId(id:IngredientId):CoreIngredientId{
 return isCustomIngredientId(id)?customVisuals.get(id)?.visualId??'tomato':id as CoreIngredientId;
}
export const isSauceId=(id:IngredientId)=>isCustomIngredientId(id)?customVisuals.get(id)?.category==='sauce':SAUCE_IDS.has(id);
export const MAX_FILLINGS=10;
