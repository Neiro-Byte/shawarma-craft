export type IngredientId = 'chicken'|'beef'|'tomato'|'cucumber'|'lettuce'|'cheese'|'onion'|'white'|'hot'|'pepper'|'cabbage'|'pickle'|'carrot'|'fries'|'falafel'|'mushroom'|'jalapeno'|'beans'|'corn'|'cheeseSauce'|'bbq'|'tomatoSauce'|'yogurt'|'tahini';
export type IngredientCategory='protein'|'vegetable'|'extra'|'sauce';
export type Item={id:IngredientId;name:string;emoji:string;color:string;note:string;category:IngredientCategory};
export type RecipePreset={id:string;title:string;emoji:string;description:string;ingredientIds:IngredientId[];sourceIds:string[];kind:'classic'|'author'};
export type MenuSource={id:string;name:string;url:string;verifiedOn:string;note:string;scope:'moscow'|'reference'};
export const SAUCE_IDS:ReadonlySet<IngredientId>=new Set(['white','hot','cheeseSauce','bbq','tomatoSauce','yogurt','tahini']);
export const isSauceId=(id:IngredientId)=>SAUCE_IDS.has(id);
export const MAX_FILLINGS=10;
