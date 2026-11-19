import type { IngredientId, CoreIngredientId, Item, MenuSource, RecipePreset } from './domain';
export type { Item } from './domain';

export const ingredients: Item[] = [
  {id:'chicken',name:'Курица',emoji:'🍗',color:'#f1b55d',note:'Обжаренные кусочки',category:'protein'},
  {id:'beef',name:'Говядина',emoji:'🥩',color:'#ac7052',note:'Мясные ломтики',category:'protein'},
  {id:'tomato',name:'Помидоры',emoji:'🍅',color:'#ef6758',note:'Свежие дольки',category:'vegetable'},
  {id:'cucumber',name:'Огурцы',emoji:'🥒',color:'#78a95a',note:'Свежий хруст',category:'vegetable'},
  {id:'lettuce',name:'Салат',emoji:'🥬',color:'#99bd64',note:'Зелёные листья',category:'vegetable'},
  {id:'cheese',name:'Сыр',emoji:'🧀',color:'#ecc65d',note:'Сырная стружка',category:'extra'},
  {id:'onion',name:'Красный лук',emoji:'🧅',color:'#ba83b1',note:'Тонкие колечки',category:'vegetable'},
  {id:'white',name:'Чесночный соус',emoji:'🧄',color:'#d8c7a3',note:'С чесночной нотой',category:'sauce'},
  {id:'hot',name:'Чили',emoji:'🌶️',color:'#e47948',note:'Острый соус',category:'sauce'},
  {id:'pepper',name:'Сладкий перец',emoji:'🫑',color:'#e0a94d',note:'Яркие кусочки',category:'vegetable'},
  {id:'cabbage',name:'Капуста',emoji:'🥬',color:'#bad18c',note:'Тонкая соломка',category:'vegetable'},
  {id:'pickle',name:'Маринованные огурцы',emoji:'🥒',color:'#7c984d',note:'Кисловатые ломтики',category:'vegetable'},
  {id:'carrot',name:'Морковь по-корейски',emoji:'🥕',color:'#ed944b',note:'Пряная соломка',category:'vegetable'},
  {id:'fries',name:'Картофель фри',emoji:'🍟',color:'#e8ba5c',note:'Золотистые брусочки',category:'extra'},
  {id:'falafel',name:'Фалафель',emoji:'🧆',color:'#a58e46',note:'Нутовые шарики',category:'protein'},
  {id:'mushroom',name:'Грибы',emoji:'🍄',color:'#a7957f',note:'Обжаренные ломтики',category:'vegetable'},
  {id:'jalapeno',name:'Халапеньо',emoji:'🌶️',color:'#669b4c',note:'Острые колечки',category:'vegetable'},
  {id:'beans',name:'Фасоль',emoji:'🫘',color:'#a75e52',note:'Сытное дополнение',category:'extra'},
  {id:'corn',name:'Кукуруза',emoji:'🌽',color:'#f1ce59',note:'Сладкие зёрна',category:'vegetable'},
  {id:'cheeseSauce',name:'Сырный соус',emoji:'🧀',color:'#e7b947',note:'Сырный акцент',category:'sauce'},
  {id:'bbq',name:'BBQ',emoji:'🔥',color:'#914c34',note:'Соус с дымной нотой',category:'sauce'},
  {id:'tomatoSauce',name:'Томатный соус',emoji:'🍅',color:'#c85940',note:'Томатный акцент',category:'sauce'},
  {id:'yogurt',name:'Йогуртовый соус',emoji:'🥛',color:'#eee7d5',note:'Мягкая кислинка',category:'sauce'},
  {id:'tahini',name:'Тахини',emoji:'🫙',color:'#c8ae7a',note:'Кунжутная паста',category:'sauce'},
];

export type Phase = 'build'|'folding'|'ready';
export type Batch = {id:IngredientId;key:number;layer:number;settled?:boolean;source?:[number,number,number]};
export const classicSource = 'https://menunedeli.ru/recipe/shaurma-recept-klassicheskij/';
export const classicIds: CoreIngredientId[] = ['lettuce','chicken','tomato','cucumber','white'];

export const menuSources: MenuSource[] = [
  {id:'home-classic',name:'Меню недели — домашний рецепт',url:classicSource,verifiedOn:'2026-11-15',scope:'reference',note:'Домашний ориентир исходного набора; не московское заведение и не стандарт классики.'},
  {id:'shawarma-bar',name:'SHAWARMA BAR — официальное меню',url:'https://shawarmabar.ru/',verifiedOn:'2026-11-15',scope:'moscow',note:'На сайте указаны московские адреса. Идеи сочетаний адаптированы к каталогу, рецептуры бренда не воспроизводятся.'},
  {id:'gurman-chibbis',name:'Гурман Street Food — Чиббис, Москва',url:'https://chibbis.ru/msk/restaurant/gurman-street-food/menu',verifiedOn:'2026-11-15',scope:'moscow',note:'Источник: Чиббис. Агрегатор показывает фалафель, BBQ и добавки; полные составы не раскрыты.'},
  {id:'wakh-guru',name:'Wах донер — Restaurant Guru, Москва',url:'https://restaurantguru.ru/Wakh-doner-Moscow/menu',verifiedOn:'2026-11-15',scope:'moscow',note:'Раздел «Меню от владельца 2 года назад»; исторический пример состава, актуальность ассортимента не подтверждена.'},
];

// Source links explain inspiration, not an exact recipe or brand endorsement.
export const recipePresets: RecipePreset[] = [
  {id:'classic',title:'Классическая',emoji:'🌯',kind:'classic',description:'Наш исходный вариант: курица, салат, свежие овощи и чесночный соус.',ingredientIds:[...classicIds],sourceIds:['home-classic']},
  {id:'cabbage',title:'С капустой',emoji:'🥬',kind:'author',description:'Курица, хрустящая капуста, свежие овощи, лук и два соуса.',ingredientIds:['cabbage','chicken','cucumber','tomato','onion','tomatoSauce','white'],sourceIds:['wakh-guru']},
  {id:'cheesy',title:'Сырная',emoji:'🧀',kind:'author',description:'Курица, сырная стружка, овощи и мягкий сырный соус.',ingredientIds:['lettuce','chicken','tomato','pickle','cheese','cheeseSauce'],sourceIds:['shawarma-bar','gurman-chibbis']},
  {id:'beef-bbq',title:'Говядина BBQ',emoji:'🥩',kind:'author',description:'Говядина, маринованный огурец, картофель фри и дымный BBQ.',ingredientIds:['lettuce','beef','pickle','onion','fries','bbq'],sourceIds:['shawarma-bar','gurman-chibbis']},
  {id:'mexican',title:'Мексиканская острая',emoji:'🌶️',kind:'author',description:'Курица, фасоль, кукуруза и халапеньо под острым чили.',ingredientIds:['chicken','tomato','pepper','beans','corn','jalapeno','hot'],sourceIds:['shawarma-bar']},
  {id:'falafel',title:'С фалафелем',emoji:'🧆',kind:'author',description:'Фалафель, свежие овощи, пряная морковь и кунжутная тахини.',ingredientIds:['lettuce','falafel','tomato','cucumber','carrot','tahini'],sourceIds:['gurman-chibbis']},
  {id:'mushroom-vegetable',title:'Грибная с овощами',emoji:'🍄',kind:'author',description:'Обжаренные грибы, сладкий перец, овощи и чесночный соус.',ingredientIds:['lettuce','mushroom','pepper','tomato','onion','white'],sourceIds:['shawarma-bar']},
  {id:'yogurt-chicken',title:'Курица с йогуртом',emoji:'🥒',kind:'author',description:'Курица, свежие овощи, сыр и нежный йогуртовый соус.',ingredientIds:['lettuce','chicken','cucumber','tomato','cheese','yogurt'],sourceIds:['shawarma-bar']},
];

export function recipeToBatches(recipe: RecipePreset): Batch[] {
  return recipe.ingredientIds.map((id, layer) => ({id,key:-(layer+1),layer,settled:true}));
}

export function classicRecipe(): Batch[] {
  return classicIds.map((id, layer) => ({id,key:-(layer+1),layer,settled:true}));
}


export function latestManualBatch(batches: readonly Batch[]) {
 return batches.reduce<Batch|undefined>((latest,batch)=>
  batch.key>(latest?.key??0)?batch:latest,undefined);
}
