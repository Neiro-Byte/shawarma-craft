import {useEffect,useId,useRef,useState} from 'react';
import {ingredients} from './data';
import {extrasMenu} from './extraMenuCatalog';
import {
 allergenOptions,createProductInfo,unknownInfo,PRODUCT_INFO_NOTICE,spiceLabels,validateProductInfo,
 type ProductInfo,type ProductInfoCatalog,type ProductInfoSettings,type SpiceLevel,
} from './productInfo';
import './productInfo.css';

export type ProductInfoPanelProps={
 settings:ProductInfoSettings;
 catalog?:ProductInfoCatalog;
 onSave:(settings:ProductInfoSettings)=>string|null;
 onClose:()=>void;
};
const originalCatalog={ingredients,extras:extrasMenu};
function localDate(){
 const date=new Date();
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export default function ProductInfoPanel({settings,catalog=originalCatalog,onSave,onClose}:ProductInfoPanelProps){
 const [draft,setDraft]=useState(()=>{const result=validateProductInfo(settings);return result.ok?result.settings:createProductInfo()});
 const [baseline,setBaseline]=useState(()=>JSON.stringify(draft));
 const [kind,setKind]=useState<'ingredients'|'extras'>('ingredients');
 const [selectedId,setSelectedId]=useState<string>(catalog.ingredients[0]?.id??'');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [confirmClose,setConfirmClose]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null);
 const controlId=useId();
 const dirty=JSON.stringify(draft)!==baseline;
 const choices=kind==='ingredients'?catalog.ingredients.map(item=>({id:item.id,name:item.name})):
  catalog.extras.map(item=>({id:item.id,name:item.title}));
 const selected=choices.find(item=>item.id===selectedId)??choices[0];
 const info=selected?((draft[kind] as Record<string,ProductInfo>)[selected.id]??unknownInfo()):undefined;
 useEffect(()=>{heading.current?.focus()},[]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 function update(changes:Partial<ProductInfo>,requireReview=true){
  if(!selected||!info)return;
  const next={...info,...changes};
  if(requireReview){next.verified=false;next.verifiedAt=null}
  setDraft(current=>({...current,[kind]:{...current[kind],[selected.id]:next}}));
  setError('');setMessage('');
 }
 function save(){
  const result=validateProductInfo(draft);
  if(!result.ok){setError(result.error);return}
  try{
   const failure=onSave(result.settings);
   if(failure){setError(failure);return}
   setDraft(result.settings);setBaseline(JSON.stringify(result.settings));
   setError('');setMessage('Сведения сохранены.');
  }catch{setError('Сведения не сохранены. Изменения остаются в открытом редакторе.')}
 }
 return <section className="sc-product-info-editor" aria-label="Редактор сведений о составе">
  <header>
   <div><h1 ref={heading} tabIndex={-1}>Сведения о составе</h1>
    <p>Данные заполняет владелец меню по составам продуктов.</p><p>{PRODUCT_INFO_NOTICE}</p></div>
   <button type="button" onClick={()=>dirty?setConfirmClose(true):onClose()}>Закрыть</button>
  </header>
  {confirmClose&&<section className="sc-product-info-confirm" aria-label="Несохранённые сведения">
   <h2>Закрыть без сохранения?</h2><p>Изменения в редакторе будут потеряны.</p>
   <div className="sc-product-info-actions">
    <button type="button" autoFocus onClick={()=>{setConfirmClose(false);heading.current?.focus()}}>Продолжить редактирование</button>
    <button type="button" onClick={onClose}>Закрыть без сохранения</button>
   </div>
  </section>}
  <div inert={confirmClose}>
   <div className="sc-product-info-picker">
    <label>Раздел<select value={kind} onChange={event=>setKind(event.target.value as typeof kind)}>
     <option value="ingredients">Ингредиенты</option><option value="extras">Напитки и закуски</option>
    </select></label>
    <label>Продукт<select value={selected?.id??''} disabled={!choices.length} onChange={event=>setSelectedId(event.target.value)}>
     {choices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
   </div>
   {selected&&info?<div key={kind+selected.id}>
    <h2>{selected.name}</h2>
    <p className="sc-product-info-status">{info.verified?'Проверено заведением':'Не проверено заведением'}</p>
    <fieldset><legend>Заявленные аллергены</legend>
     <p>Отметьте сведения из состава. При отсутствии данных оставьте проверку неподтверждённой.</p>
     <div className="sc-product-info-allergens">{allergenOptions.map(option=><label key={option.id}>
      <input type="checkbox" checked={info.allergens.includes(option.id)} onChange={event=>update({
       allergens:event.target.checked?[...info.allergens,option.id]:info.allergens.filter(id=>id!==option.id),
      })}/><span>{option.label}</span>
     </label>)}</div>
    </fieldset>
    <label className="sc-product-info-field">Острота<select value={info.spice===null?'unknown':info.spice}
     onChange={event=>update({spice:event.target.value==='unknown'?null:Number(event.target.value) as SpiceLevel})}>
     <option value="unknown">Не указана</option>
     {spiceLabels.map((label,index)=><option key={index} value={index}>{index} — {label}</option>)}
    </select></label>
    <label className="sc-product-info-field">Возможный перекрёстный контакт
     <textarea maxLength={300} rows={3} value={info.crossContactNote} onChange={event=>update({crossContactNote:event.target.value})}/>
    </label>
    <p>Изменение состава, остроты или примечания снимает подтверждение этой позиции.</p>
    <label className="sc-product-info-check"><input type="checkbox" checked={info.verified}
     onChange={event=>update({verified:event.target.checked,verifiedAt:event.target.checked?localDate():null},false)}/>
     Подтверждаю проверку сведений заведением
    </label>
    {info.verified&&<label className="sc-product-info-field" htmlFor={controlId}>Дата проверки
     <input id={controlId} type="date" required value={info.verifiedAt??''} onChange={event=>update({verifiedAt:event.target.value},false)}/>
    </label>}
   </div>:<p>В этом разделе нет продуктов.</p>}
   <footer>
    {error&&<p role="alert" className="sc-product-info-error">{error}</p>}
    <p role="status">{message||(dirty?'Есть несохранённые сведения.':'Изменений нет.')}</p>
    <button type="button" disabled={!dirty} onClick={save}>Сохранить сведения</button>
   </footer>
  </div>
 </section>;
}
