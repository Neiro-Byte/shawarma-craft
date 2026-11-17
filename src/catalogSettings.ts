import {ingredients,recipePresets} from './data';
import {extrasMenu,type ExtraMenuItem} from './extraMenuCatalog';
import {MAX_FILLINGS,type Item,type RecipePreset} from './domain';

export type CatalogSettings={
 version:1;
 ingredients:(Item&{available:boolean})[];
 extras:(ExtraMenuItem&{available:boolean})[];
 recipes:(RecipePreset&{available:boolean})[];
 settings:{title:string;slogan:string;grillDefault:boolean};
};
export const CATALOG_KEY='shawarma-craft:catalog:v1';
export const defaultCatalog:CatalogSettings={
 version:1,
 ingredients:ingredients.map(item=>({...item,available:true})),
 extras:extrasMenu.map(item=>({...item,available:true})),
 recipes:recipePresets.map(item=>({...item,ingredientIds:[...item.ingredientIds],sourceIds:[...item.sourceIds],available:true})),
 settings:{title:'SHAWARMA CRAFT',slogan:'Заверни свой вкус.',grillDefault:true},
};

type Validation={ok:true;catalog:CatalogSettings}|{ok:false;error:string};
type RecordValue=Record<string,unknown>;
const record=(value:unknown):value is RecordValue=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max:number,empty=false):value is string=>
 typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0);
const invalid=(error:string):Validation=>({ok:false,error});

export function validateCatalogSettings(value:unknown):Validation{
 if(!record(value)||value.version!==1)return invalid('Версия настроек меню не поддерживается.');
 const {settings}=value;
 if(!record(settings)||!text(settings.title,60)||!text(settings.slogan,100)||typeof settings.grillDefault!=='boolean'){
  return invalid('Проверь название, слоган и настройку гриля.');
 }
 if(!Array.isArray(value.ingredients)||value.ingredients.length!==ingredients.length||
    !Array.isArray(value.extras)||value.extras.length!==extrasMenu.length)return invalid('Набор ингредиентов или дополнений повреждён.');
 const validatedIngredients:CatalogSettings['ingredients']=[];
 for(const original of ingredients){
  const matches=value.ingredients.filter(item=>record(item)&&item.id===original.id);
  if(matches.length!==1)return invalid('Ингредиенты должны иметь уникальные известные идентификаторы.');
  const item=matches[0] as RecordValue;
  if(!text(item.name,60)||!text(item.note,180,true)||typeof item.available!=='boolean')return invalid('Проверь название и описание ингредиента.');
  validatedIngredients.push({...original,name:item.name.trim(),note:item.note.trim(),available:item.available});
 }
 const validatedExtras:CatalogSettings['extras']=[];
 for(const original of extrasMenu){
  const matches=value.extras.filter(item=>record(item)&&item.id===original.id);
  if(matches.length!==1)return invalid('Напитки и закуски должны иметь уникальные известные идентификаторы.');
  const item=matches[0] as RecordValue;
  if(!text(item.title,60)||!text(item.note,180,true)||typeof item.available!=='boolean')return invalid('Проверь название и описание дополнения.');
  validatedExtras.push({...original,title:item.title.trim(),note:item.note.trim(),available:item.available});
 }
 if(!Array.isArray(value.recipes)||value.recipes.length<recipePresets.length||value.recipes.length>40)return invalid('В меню должно быть от 8 до 40 рецептов.');
 const knownIngredients=new Set(ingredients.map(item=>item.id as string));
 const recipeIds=new Set<string>();
 const validatedRecipes:CatalogSettings['recipes']=[];
 for(const recipe of value.recipes){
  if(!record(recipe)||!text(recipe.id,80)||!/^[a-zA-Z0-9_-]+$/.test(recipe.id)||recipeIds.has(recipe.id))return invalid('Рецепты должны иметь уникальные идентификаторы.');
  recipeIds.add(recipe.id);
  if(!text(recipe.title,60)||!text(recipe.description,300,true)||typeof recipe.available!=='boolean')return invalid('Проверь название и описание рецепта.');
  const ids=recipe.ingredientIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_FILLINGS||new Set(ids).size!==ids.length||
    !ids.every(id=>typeof id==='string'&&knownIngredients.has(id)))return invalid('В рецепте должно быть от 1 до 10 разных известных ингредиентов.');
  const original=recipePresets.find(item=>item.id===recipe.id);
  validatedRecipes.push({
   id:recipe.id,title:recipe.title.trim(),description:recipe.description.trim(),
   ingredientIds:[...ids],sourceIds:original?[...original.sourceIds]:[],emoji:original?.emoji??'🌯',
   kind:original?.kind??'author',available:recipe.available,
  });
 }
 if(!recipePresets.every(original=>recipeIds.has(original.id)))return invalid('Базовые рецепты можно скрывать, но нельзя удалять.');
 return {ok:true,catalog:{
  version:1,ingredients:validatedIngredients,extras:validatedExtras,recipes:validatedRecipes,
  settings:{title:settings.title.trim(),slogan:settings.slogan.trim(),grillDefault:settings.grillDefault},
 }};
}

export function loadCatalog():{catalog:CatalogSettings;warning:string}{
 try{
  if(typeof window==='undefined')return {catalog:defaultCatalog,warning:''};
  const raw=window.localStorage.getItem(CATALOG_KEY);
  if(raw===null)return {catalog:defaultCatalog,warning:''};
  const result=validateCatalogSettings(JSON.parse(raw));
  return result.ok?{catalog:result.catalog,warning:''}:{catalog:defaultCatalog,warning:'Настройки меню повреждены. Показано исходное меню.'};
 }catch{return {catalog:defaultCatalog,warning:'Настройки меню не удалось прочитать.'}}
}

export function saveCatalog(value:CatalogSettings):Validation{
 const result=validateCatalogSettings(value);
 if(!result.ok)return result;
 try{
  window.localStorage.setItem(CATALOG_KEY,JSON.stringify(result.catalog));
  return result;
 }catch{return invalid('Изменения не сохранены. Хранилище браузера недоступно или заполнено.')}
}
