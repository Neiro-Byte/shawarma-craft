import {ingredients} from './data';
import {extrasMenu} from './extraMenuCatalog';
import {
 allergenOptions,PRODUCT_INFO_NOTICE,spiceLabels,summarizeProductInfo,
 type ProductInfoCatalog,type ProductInfoSelection,type ProductInfoSettings,type ProductReference,
} from './productInfo';
import './productInfo.css';

export type ProductInfoSummaryProps={
 settings:ProductInfoSettings;
 selection:ProductInfoSelection;
 catalog?:ProductInfoCatalog;
 heading?:string;
};
export default function ProductInfoSummary({
 settings,selection,catalog={ingredients,extras:extrasMenu},heading='Аллергены и острота',
}:ProductInfoSummaryProps){
 const summary=summarizeProductInfo(settings,selection);
 const name=(item:ProductReference)=>item.kind==='ingredient'?
  catalog.ingredients.find(product=>product.id===item.id)?.name??'Неизвестный ингредиент':
  catalog.extras.find(product=>product.id===item.id)?.title??'Неизвестное дополнение';
 return <section className="sc-product-info-summary" aria-label={heading}>
  <h3>{heading}</h3>
  <p>Сведения о выбранных ингредиентах и дополнениях.</p>
  {summary.empty?<p>Состав пока не выбран.</p>:<>
   {summary.incomplete&&<p className="sc-product-info-warning" role="status">Сведения неполные. Часть данных не проверена заведением или не указана.</p>}
   <p><strong>Заявленные аллергены</strong> · {summary.allergens.length?
    allergenOptions.filter(option=>summary.allergens.includes(option.id)).map(option=>option.label).join(', '):'Список не заполнен'}</p>
   <p>{PRODUCT_INFO_NOTICE}</p>
   <p><strong>Острота</strong> · {summary.spice===null?'Не полностью указана':spiceLabels[summary.spice]}</p>
   {summary.unverified.length>0&&<p>Не проверено заведением · {summary.unverified.map(name).join(', ')}</p>}
   {summary.unknownSpice.length>0&&<p>Острота не указана · {summary.unknownSpice.map(name).join(', ')}</p>}
   {summary.unknownProducts.length>0&&<p>В составе есть неизвестные позиции. Их сведения не учтены.</p>}
   {summary.crossContactNotes.length>0&&<div>
    <h4>Возможный перекрёстный контакт</h4>
    <ul>{summary.crossContactNotes.map(note=><li key={note}>{note}</li>)}</ul>
   </div>}
  </>}
 </section>;
}
