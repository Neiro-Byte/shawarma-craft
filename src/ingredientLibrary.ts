import {ingredients} from './data';
import type {CoreIngredientId,IngredientCategory,Item} from './domain';

export type IngredientLibraryEntry=Item&{libraryKey:string;surchargeKopecks:number};
const more:[string,string,string,IngredientCategory,CoreIngredientId,string][]=[
 ['turkey','Индейка','🦃','protein','chicken','#d1a378'],['pork','Свинина','🥩','protein','beef','#b66f55'],
 ['lamb','Баранина','🥩','protein','beef','#986345'],['duck','Утка','🦆','protein','beef','#9f654c'],
 ['salmon','Лосось','🐟','protein','chicken','#ef9678'],['tuna','Тунец','🐟','protein','beef','#b97470'],
 ['shrimp','Креветки','🦐','protein','chicken','#ec9d7c'],['tofu','Тофу','🧊','protein','chicken','#e2cfa3'],
 ['seitan','Сейтан','🌾','protein','beef','#9c7153'],['tempeh','Темпе','🫘','protein','beef','#c59762'],
 ['egg','Яйцо','🥚','extra','falafel','#f3d47d'],['chickpeas','Нут','🫘','extra','beans','#ceb87a'],
 ['avocado','Авокадо','🥑','vegetable','lettuce','#82a64b'],['beet','Свёкла','🍠','vegetable','carrot','#a34364'],
 ['spinach','Шпинат','🥬','vegetable','lettuce','#3f8a42'],['arugula','Руккола','🌿','vegetable','lettuce','#5b983f'],
 ['parsley','Петрушка','🌿','vegetable','lettuce','#4e9b43'],['cilantro','Кинза','🌿','vegetable','lettuce','#469b53'],
 ['dill','Укроп','🌿','vegetable','lettuce','#569b58'],['mint','Мята','🌿','vegetable','lettuce','#419e75'],
 ['radish','Редис','🌱','vegetable','pickle','#d35b79'],['zucchini','Кабачок','🥒','vegetable','cucumber','#83a452'],
 ['eggplant','Баклажан','🍆','vegetable','mushroom','#82568f'],['broccoli','Брокколи','🥦','vegetable','lettuce','#52984b'],
 ['olives','Оливки','🫒','vegetable','beans','#7e8647'],['black-olives','Маслины','🫒','vegetable','beans','#554e45'],
 ['capers','Каперсы','🌱','vegetable','beans','#7e9154'],['pickled-lemon','Солёный лимон','🍋','vegetable','pickle','#dfc65b'],
 ['sun-dried-tomato','Вяленые томаты','🍅','vegetable','tomato','#ad4e35'],['red-cabbage','Красная капуста','🥬','vegetable','cabbage','#a85691'],
 ['pickled-onion','Маринованный лук','🧅','vegetable','onion','#d68cb1'],['green-onion','Зелёный лук','🌱','vegetable','onion','#5fa24a'],
 ['pineapple','Ананас','🍍','extra','tomato','#dfbd52'],['pomegranate','Гранат','🍒','extra','corn','#bf3b50'],
 ['apple','Яблоко','🍏','extra','cucumber','#9ec55a'],['mango','Манго','🥭','extra','tomato','#e6b14a'],
 ['celery','Сельдерей','🌱','vegetable','cucumber','#a6bd72'],['feta','Фета','🧀','extra','cheese','#f0e6d1'],
 ['mozzarella','Моцарелла','🧀','extra','cheese','#f4ecd8'],['suluguni','Сулугуни','🧀','extra','cheese','#e9dab3'],
 ['parmesan','Пармезан','🧀','extra','cheese','#ddc286'],['halloumi','Халуми','🧀','extra','cheese','#dfc38f'],
 ['cream-cheese','Сливочный сыр','🧀','extra','cheese','#f0e2cd'],['cheddar','Чеддер','🧀','extra','cheese','#e5aa3d'],
 ['bacon','Бекон','🥓','extra','beef','#b76957'],['fried-onion','Хрустящий лук','🧅','extra','onion','#bc8b47'],
 ['sesame','Кунжут','🌾','extra','corn','#e5d3a2'],['croutons','Сухарики','🥖','extra','fries','#c79859'],
 ['tortilla-chips','Кукурузные чипсы','🌽','extra','fries','#dbb04a'],['hummus','Хумус','🫘','sauce','white','#d2b67c'],
 ['tzatziki','Дзадзики','🥒','sauce','yogurt','#d8e2bd'],['ranch','Ранч','🥛','sauce','white','#ece5cf'],
 ['mayonnaise','Майонез','🥚','sauce','white','#f1e4c3'],['mustard','Горчица','🌭','sauce','cheeseSauce','#d2ad36'],
 ['sriracha','Шрирача','🌶️','sauce','hot','#d74f35'],['adjika','Аджика','🌶️','sauce','hot','#be4c39'],
 ['pesto','Песто','🌿','sauce','white','#648943'],['teriyaki','Терияки','🥢','sauce','bbq','#81513a'],
 ['sweet-chili','Сладкий чили','🌶️','sauce','hot','#cc6b40'],['narsharab','Наршараб','🍒','sauce','bbq','#843e47'],
 ['lemon-sauce','Лимонный соус','🍋','sauce','white','#e5d894'],['curry-sauce','Соус карри','🍛','sauce','cheeseSauce','#cfac48'],
 ['caesar','Цезарь','🥗','sauce','white','#ded3a6'],['peanut','Арахисовый соус','🥜','sauce','tahini','#b68b55'],
];
export const ingredientLibrary:readonly IngredientLibraryEntry[]=[
 ...ingredients.map(item=>({...item,libraryKey:item.id,image:'library:'+item.id,surchargeKopecks:0})),
 ...more.map(([libraryKey,name,emoji,category,visualId,color])=>({id:`custom-${libraryKey}` as const,libraryKey,name,emoji,category,visualId,color,note:'',image:'library:'+libraryKey,surchargeKopecks:category==='protein'?6000:category==='sauce'?2000:3000})),
];
const libraryKeys=new Set(ingredientLibrary.map(item=>item.libraryKey));
export const MAX_INGREDIENTS=160;
export const MAX_IMAGE_LENGTH=82000;
export const MAX_CATALOG_IMAGES_LENGTH=1800000;
export function validIngredientImage(image:unknown):image is string{
 if(typeof image!=='string')return false;
 if(image.startsWith('library:'))return libraryKeys.has(image.slice(8));
 if(image.length>MAX_IMAGE_LENGTH||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))return false;
 try{
  const bytes=atob(image.slice(image.indexOf(',')+1));
  if(image.startsWith('data:image/png;'))return bytes.startsWith('\x89PNG\r\n\x1a\n');
  if(image.startsWith('data:image/jpeg;'))return bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216&&bytes.charCodeAt(2)===255;
  return bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
 }catch{return false}
}
export function ingredientImageSource(image:string|undefined):string|undefined{
 if(!validIngredientImage(image))return;
 return image.startsWith('library:')?`${import.meta.env.BASE_URL}ingredient-images/${image.slice(8)}.svg`:image;
}
export function ingredientFromLibrary(key:string):IngredientLibraryEntry|undefined{
 const entry=ingredientLibrary.find(item=>item.libraryKey===key);
 return entry?{...entry}:undefined;
}

export async function uploadIngredientImage(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('Выберите PNG, JPEG или WebP размером до 8 МБ.');
 const bitmap=await createImageBitmap(file);
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw new Error('Изображение слишком большое.');
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,384/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось подготовить изображение.');
  ctx.fillStyle='#fff7e9';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.65,.45,.25]){
   const value=canvas.toDataURL('image/jpeg',quality);
   if(validIngredientImage(value))return value;
  }
  throw new Error('Не удалось уменьшить изображение. Выберите более простую картинку.');
 }finally{bitmap.close()}
}
