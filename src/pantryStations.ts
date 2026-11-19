import {ingredients} from './data';
import {isSauceId,registeredCustomIngredients,type IngredientId} from './domain';
const first:IngredientId[]=['cheese','onion','pickle','falafel'];
export const stationFoodIds:readonly IngredientId[]=[...first,...ingredients.filter(item=>item.id!=='chicken'&&!isSauceId(item.id)&&!first.includes(item.id)).map(item=>item.id)];
export const stationSauceIds:readonly IngredientId[]=ingredients.filter(item=>isSauceId(item.id)).map(item=>item.id);
export function stationPage(ids:readonly IngredientId[],available:readonly IngredientId[]|undefined,page:number,slots:number){
 const custom=registeredCustomIngredients().filter(item=>ids.includes('white')?item.category==='sauce':item.category!=='sauce').map(item=>item.id);
 const shown=[...new Set([...ids,...custom])].filter(id=>available===undefined||available.includes(id));
 const size=Number.isFinite(slots)?Math.max(1,Math.min(5,Math.floor(slots))):5;
 const pages=Math.max(1,Math.ceil(shown.length/size));
 const current=Math.max(0,Math.min(Number.isFinite(page)?Math.floor(page):0,pages-1));
 return {ids:shown.slice(current*size,(current+1)*size),page:current,pages,total:shown.length};
}
export type StationView={foodPage:number;saucePage:number;slots:number};
