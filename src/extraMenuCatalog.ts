export type ExtraCategory = 'drink' | 'snack';
export type ExtraId = 'water' | 'ayran' | 'cranberry' | 'blackcurrant' | 'fries' | 'bites' | 'cheeseBalls' | 'wings';
export type ExtraMenuItem = {
  id: ExtraId;
  category: ExtraCategory;
  title: string;
  note: string;
  sourceURL: string;
};
const sourceURL = 'https://shawarmabar.ru/';
export const extrasMenu: ExtraMenuItem[] = [
  {id:'water',category:'drink',title:'Вода без газа',note:'Простой выбор к любому рецепту',sourceURL},
  {id:'ayran',category:'drink',title:'Айран',note:'Кисломолочный напиток',sourceURL},
  {id:'cranberry',category:'drink',title:'Клюквенный морс',note:'Ягодное настроение',sourceURL},
  {id:'blackcurrant',category:'drink',title:'Смородиновый морс',note:'Из чёрной смородины',sourceURL},
  {id:'fries',category:'snack',title:'Картофель фри',note:'Золотистые брусочки',sourceURL},
  {id:'bites',category:'snack',title:'Куриные байтсы',note:'Небольшие кусочки в панировке',sourceURL},
  {id:'cheeseBalls',category:'snack',title:'Сырные шарики',note:'Сырная закуска',sourceURL},
  {id:'wings',category:'snack',title:'Крылышки BBQ',note:'С соусом барбекю',sourceURL},
];
