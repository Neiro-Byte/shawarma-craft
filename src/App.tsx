import {Component,Suspense,lazy,useEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {RotateCcw,Volume2,VolumeX,ArrowUpRight,Check,Minus,Plus,X,Move,ArrowRight,Eye,Trash2,Flame,Search,BookOpen,Utensils,CupSoda,SlidersHorizontal,ArrowUp,ArrowDown,ListOrdered} from 'lucide-react';
import {classicIds,menuSources,recipeToBatches,latestManualBatch,type Batch,type Phase} from './data';
import {MAX_FILLINGS,type IngredientCategory,type IngredientId,type RecipePreset} from './domain';
import {sound} from './sound';
import SavedRecipePanel from './SavedRecipePanel';
import ExtrasMenu from './ExtrasMenu';
import MobileOrder from './MobileOrder';
import OrderSummary from './OrderSummary';
import KitchenInstructions from './KitchenInstructions';
import LastOrderPanel from './LastOrderPanel';
import {saveCompletedOrder,type LastOrder,type RepeatOrderDraft} from './lastOrder';
import ProductInfoSummary from './ProductInfoSummary';
import {loadProductInfo,saveProductInfo,type ProductInfoSettings} from './productInfo';
import {defaultPricing,loadPricing,savePricing,validatePricingSettings,calculateOrderPrice,formatMoney,type PricingSettings,type PricedOrder} from './pricing';
import {MAX_EXTRA_QUANTITY,MAX_SHAWARMA_QUANTITY,readOrderDraft,saveOrderDraft,type ExtraQuantities,type OrderDraft} from './orderDraft';
import type {ExtraId} from './extraMenuCatalog';
import {defaultCatalog,loadCatalog,saveCatalog,validateCatalogSettings,type CatalogSettings} from './catalogSettings';
import type {ServingOrder} from './ServingTray';
import {rotisserieLayout} from './sceneLayout';
import {clearKitchenRequest,kitchenRequest,kitchenStatusLabel,kitchenWrite,readKitchenTicket,rememberKitchenTicket,reserveKitchenRequest,type KitchenTicket,type SharedMenu} from './kitchenClient';
import './style.css';
const Kitchen=lazy(()=>import('./Scene'));
const KitchenDashboard=lazy(()=>import('./KitchenDashboard'));
const AdminPanel=lazy(()=>import('./AdminPanel'));
const PriceSettingsPanel=lazy(()=>import('./PriceSettingsPanel'));
const ProductInfoPanel=lazy(()=>import('./ProductInfoPanel'));
const categoryLabels:Record<IngredientCategory|'all',string>={all:'Всё',protein:'Мясо и фалафель',vegetable:'Овощи',extra:'Добавки',sauce:'Соусы'};
type RecipeDraft = {baseId: string | null; batches: Batch[]; strictOrder?: boolean};
type RecipeEditor = {drafts: RecipeDraft[]; activeIndex: number};
type RecipeSummary = {title:string; baseTitle:string; added:IngredientId[]; removed:IngredientId[]};
type DemoOrder = {
 snapshot: ServingOrder;
 priced: PricedOrder;
 repeatComposition: LastOrder;
 productInfo: ProductInfoSettings;
 recipes: {batches: Batch[][]; grill: boolean} | null;
 status: 'cooking' | 'serving' | 'served' | 'recovery';
 usesScene: boolean;
 kitchen?: {requestId:string;state:'idle'|'sending'|'failed'|'sent';ticket?:KitchenTicket;error?:string};
};
type SceneMode = 'visual' | 'quick' | 'fallback';
const normalize=(value:string)=>value.toLocaleLowerCase('ru').replaceAll('ё','е').trim();
type IngredientNames=Map<IngredientId,string>;
function recipeDraft({baseId,ingredientIds,strictOrder}:OrderDraft['shawarmas'][number]):RecipeDraft {
 return {baseId,strictOrder,batches:ingredientIds.map((id,layer)=>({id,layer,key:-(layer+1),settled:true}))};
}
function recipeComposition({baseId,batches,strictOrder}:RecipeDraft):OrderDraft['shawarmas'][number] {
 return {baseId,ingredientIds:batches.map(batch=>batch.id),...(strictOrder?{strictOrder}:{})};
}
function initialEditor(draft?:OrderDraft|null,catalog=defaultCatalog):RecipeEditor {
 if(draft)return {
  drafts:draft.shawarmas.map(recipeDraft),
  activeIndex:draft.activeIndex,
 };
 const recipe=catalog.recipes[0];
 return {drafts:[{baseId:recipe.id,batches:recipeToBatches(recipe)}],activeIndex:0};
}
function settledDraft(draft:RecipeDraft):RecipeDraft {
 return {...draft,batches:draft.batches.map(batch=>({...batch,settled:true}))};
}
function describeDraft({baseId,batches}:RecipeDraft,catalog:CatalogSettings){
 const base=catalog.recipes.find(recipe=>recipe.id===baseId);
 const reference=catalog.recipes.find(recipe=>recipe.id==='classic');
 const baseIds=base?.ingredientIds??reference?.ingredientIds??classicIds;
 const chosenIds=batches.map(batch=>batch.id);
 const added=chosenIds.filter(id=>!baseIds.includes(id));
 const removed=baseIds.filter(id=>!chosenIds.includes(id));
 const unchanged=!!base&&!added.length&&!removed.length;
 const title=!batches.length?'Свой рецепт':unchanged?base.title:'Твой вариант';
 const summary:RecipeSummary={title,baseTitle:base?.title??reference?.title??'Классическая',added,removed};
 return {base,unchanged,summary};
}
function RecipeChanges({summary,names}:{summary:RecipeSummary;names:IngredientNames}){
 if(!summary.added.length&&!summary.removed.length)return null;
 return <ul className="recipe-changes" aria-label="Изменения состава">
  {summary.added.length>0&&<li><span aria-label="Добавлено">+</span> {summary.added.map(id=>names.get(id)).join(', ')}</li>}
  {summary.removed.length>0&&<li><span aria-label="Убрано">−</span> {summary.removed.map(id=>names.get(id)).join(', ')}</li>}
 </ul>;
}
function panelTitle(summary:RecipeSummary,names:IngredientNames){
 const added=summary.added.map(id=>names.get(id)).join(', ');
 const removed=summary.removed.map(id=>names.get(id)).join(', ');
 return [summary.baseTitle,added&&`+ ${added}`,removed&&`− ${removed}`].filter(Boolean).join(' · ');
}
class SceneBoundary extends Component<{children:ReactNode;onUnavailable:()=>void},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true}}
 componentDidCatch(){this.props.onUnavailable()}
 render(){return this.state.failed?null:this.props.children}
}
export default function App(){
 const [catalogLoad]=useState(loadCatalog);
 const [catalog,setCatalog]=useState(catalogLoad.catalog);
 const [catalogWarning,setCatalogWarning]=useState(catalogLoad.warning);
 const [adminOpen,setAdminOpen]=useState(false);
 const [kitchenEnabled,setKitchenEnabled]=useState(false);
 const [kitchenChecked,setKitchenChecked]=useState(false);
 const [kitchenOpen,setKitchenOpen]=useState(()=>location.hash==='#kitchen');
 const [menuSyncError,setMenuSyncError]=useState('');
 const [pricesOpen,setPricesOpen]=useState(false);
 const [infoOpen,setInfoOpen]=useState(false);
 const [infoLoad]=useState(loadProductInfo);
 const [productInfo,setProductInfo]=useState(infoLoad.settings);
 const [infoWarning,setInfoWarning]=useState(infoLoad.status==='invalid'?'Сохранённые сведения о составе повреждены. Показываем их как непроверенные.':infoLoad.status==='unavailable'?'Сведения о составе не удалось прочитать.':'');
 const [lastOrderRefresh,setLastOrderRefresh]=useState(0);
 const [lastOrderWarning,setLastOrderWarning]=useState('');
 const [pricingLoad]=useState(loadPricing);
 const [pricing,setPricing]=useState(pricingLoad.pricing);
 const [pricingWarning,setPricingWarning]=useState(pricingLoad.status==='invalid'?'Сохранённые цены повреждены. Используем исходные демо-цены.':pricingLoad.status==='unavailable'?'Цены не удалось прочитать. Используем исходные демо-цены.':'');
 const ingredients=catalog.ingredients;
 const recipePresets=catalog.recipes;
 const extrasMenu=catalog.extras;
 const ingredientNames=useMemo(()=>new Map(ingredients.map(({id,name})=>[id,name])),[ingredients]);
 const availableIngredientIds=useMemo(()=>ingredients.filter(item=>item.available).map(item=>item.id),[ingredients]);
 const [savedDraft]=useState(readOrderDraft);
 const [{drafts,activeIndex},setEditor]=useState(()=>initialEditor(savedDraft.draft,catalog));
 const [scene,setScene]=useState<{mode:SceneMode;generation:number}>({mode:'visual',generation:0});
 const [sceneRequested,setSceneRequested]=useState(false);
 const [animateRecipe,setAnimateRecipe]=useState(false);
 const [sceneSlow,setSceneSlow]=useState(false);
 const activeScene=useRef(scene);
 const [muted,setMuted]=useState(false),[inspect,setInspect]=useState(false),[grill,setGrill]=useState(savedDraft.draft?.grill??catalog.settings.grillDefault);
 const [cookStatus,setCookStatus]=useState('Заворачиваем…');
 const [category,setCategory]=useState<IngredientCategory|'all'>('all'),[query,setQuery]=useState(''),[notice,setNotice]=useState('');
 const [quantities,setQuantities]=useState<ExtraQuantities>(savedDraft.draft?.extras??{});
 const [draftWarning,setDraftWarning]=useState(savedDraft.status==='invalid'?'Не удалось восстановить старый черновик.':savedDraft.status==='unavailable'?'Браузер не разрешает сохранять черновик.':'');
 const lastDraft=useRef<string|undefined>(undefined);
 const [order,setOrder]=useState<DemoOrder>();
 const [rememberedTicket,setRememberedTicket]=useState(readKitchenTicket);
 const nextOrder=useRef(0);
 const activeOrder=useRef<DemoOrder | undefined>(undefined);
 const stageRef=useRef<HTMLDivElement>(null);
 const receiptRef=useRef<HTMLElement>(null);
 const seq=useRef(0),locked=!!order;
 const show3D=scene.mode==='visual';
 const orderStatus=order?.status;
 const phase:Phase=order?.usesScene&&order.snapshot.withShawarma?(orderStatus==='cooking'?'folding':'ready'):'build';
 const servingOrder=order?.usesScene&&(orderStatus==='serving'||orderStatus==='served')?order.snapshot:undefined;
 const inPreparation=orderStatus==='cooking'||orderStatus==='serving';
 const recovering=orderStatus==='recovery';
 const quickReceiptId=orderStatus==='served'&&!order?.usesScene?order?.snapshot.id:undefined;
 const activeDraft=drafts[activeIndex]??{baseId:null,batches:[]};
 const {baseId,batches,strictOrder}=activeDraft;
 const lastManualIngredient=latestManualBatch(batches);
 const {base,unchanged,summary}=describeDraft(activeDraft,catalog);
 const recipeTitle=summary.title;
 const shawarmaQuantity=drafts.length;
 const removeDraftLabel=`Убрать шаурму ${activeIndex+1}`;
 const recipeBatches=order?.usesScene?order.recipes?.batches:undefined;
 const previewPrice=useMemo(()=>calculateOrderPrice({
  shawarmas:drafts.map(draft=>({title:panelTitle(describeDraft(draft,catalog).summary,ingredientNames),ingredientIds:draft.batches.map(batch=>batch.id),strictOrder:draft.strictOrder})),
  extras:extrasMenu.flatMap(({id})=>(quantities[id]??0)>0?[{id,quantity:quantities[id]!}]:[]),
 },pricing,catalog),[drafts,quantities,pricing,catalog,ingredientNames]);
 const displayedPrice=order?.priced??(previewPrice.ok?previewPrice.order:undefined);
 const visibleIngredients=ingredients.filter(item=>item.available&&(category==='all'||item.category===category)&&normalize(item.name+' '+item.note).includes(normalize(query)));
 useEffect(()=>{
  const controller=new AbortController();
  async function loadSharedMenu(){
   try{
    const session=await kitchenRequest<{configured:boolean}>('/session',{signal:controller.signal});
    if(controller.signal.aborted||!session.configured)return;
    setKitchenEnabled(true);
    const menu=await kitchenRequest<SharedMenu>('/menu',{signal:controller.signal});
    if(controller.signal.aborted)return;
    {
     const checked=validateCatalogSettings(menu.catalog??defaultCatalog);
     if(checked.ok)setCatalog(checked.catalog);
    }
    {
     const checked=validatePricingSettings(menu.pricing??defaultPricing);
     if(checked.ok)setPricing(checked.pricing);
    }
    setMenuSyncError('');
   }catch{
    if(!controller.signal.aborted)setMenuSyncError('Пока используется меню из этого браузера.');
   }finally{
    if(!controller.signal.aborted)setKitchenChecked(true);
   }
  }
  void loadSharedMenu();
  window.addEventListener('focus',loadSharedMenu);
  return()=>{controller.abort();window.removeEventListener('focus',loadSharedMenu)};
 },[]);
 useEffect(()=>{
  const navigate=()=>setKitchenOpen(location.hash==='#kitchen');
  window.addEventListener('hashchange',navigate);
  return()=>window.removeEventListener('hashchange',navigate);
 },[]);
 const displayRememberedTicket=kitchenEnabled&&!order&&rememberedTicket;
 const liveTicket=order?.kitchen?.ticket||(displayRememberedTicket?displayRememberedTicket.ticket:undefined);
 const liveRequestId=order?.kitchen?.requestId||(displayRememberedTicket?displayRememberedTicket.requestId:undefined);
 useEffect(()=>{
  if(!liveTicket||liveTicket.status==='ready'||!liveRequestId)return;
  const {id}=liveTicket;
  const requestId=liveRequestId;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>;
  async function refresh(){
   try{
    if(!document.hidden){
     const latest=await kitchenRequest<KitchenTicket>(`/orders/${id}?requestId=${encodeURIComponent(requestId)}`,{signal:controller.signal});
     const current=activeOrder.current;
     if(controller.signal.aborted||latest.status===liveTicket?.status)return;
     if(current?.kitchen?.requestId===requestId)updateOrder({...current,kitchen:{...current.kitchen,ticket:latest}});
     if(!current||current.kitchen?.requestId===requestId){
      const saved={requestId,ticket:latest};
      setRememberedTicket(saved);
      rememberKitchenTicket(saved);
     }
    }
   }catch {
    // Keep the latest confirmed status and retry when the connection returns.
   }finally{
    if(!controller.signal.aborted)timer=setTimeout(refresh,3000);
   }
  }
  timer=setTimeout(refresh,3000);
  return()=>{controller.abort();clearTimeout(timer)};
 },[liveRequestId,liveTicket]);
 useEffect(()=>{
  if(!document.documentElement.dataset.menuReadyMs){
   document.documentElement.dataset.menuReadyMs=String(Math.round(performance.now()));
  }
 },[]);
 useEffect(()=>{
  if(quickReceiptId!==undefined)receiptRef.current?.scrollIntoView({block:'nearest'});
 },[quickReceiptId]);
 useEffect(()=>{
  const extras:ExtraQuantities={};
  for(const {id} of extrasMenu){const count=quantities[id];if(count)extras[id]=count}
  const draft:OrderDraft={
   version:1,
   shawarmas:drafts.map(recipeComposition),
   activeIndex,extras,grill,
  };
  const contents=JSON.stringify(draft);
  const previous=lastDraft.current;
  if(contents===previous)return;
  lastDraft.current=contents;
  if(previous===undefined)return;
  setDraftWarning(saveOrderDraft(draft)?'':'Не удалось сохранить черновик на этом устройстве.');
 },[drafts,activeIndex,quantities,grill]);
 useEffect(()=>{
  const stage=stageRef.current;
  if(!show3D||sceneRequested||!stage)return;
  const compact=window.matchMedia('(max-width: 720px), (prefers-reduced-motion: reduce)');
  let observer:IntersectionObserver|undefined;
  const observe=()=>{
   observer?.disconnect();
   if(compact.matches)return;
   if(!('IntersectionObserver' in window)){setSceneRequested(true);return}
   observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){setSceneRequested(true);observer?.disconnect()}
   },{threshold:.18});
   observer.observe(stage);
  };
  observe();
  compact.addEventListener('change',observe);
  return()=>{observer?.disconnect();compact.removeEventListener('change',observe)};
 },[show3D,sceneRequested]);
 useEffect(()=>{
  setSceneSlow(false);
  if(!show3D||!inPreparation)return;
  let timer:number|undefined;
  const arm=()=>{
   window.clearTimeout(timer);
   if(!document.hidden)timer=window.setTimeout(()=>setSceneSlow(true),12_000);
  };
  arm();
  document.addEventListener('visibilitychange',arm);
  return()=>{
   window.clearTimeout(timer);
   document.removeEventListener('visibilitychange',arm);
  };
 },[show3D,inPreparation,orderStatus,cookStatus]);

 function updateOrder(value?:DemoOrder){
  activeOrder.current=value;
  setOrder(value);
 }
 function updateScene(mode:SceneMode){
  setAnimateRecipe(false);
  const next={mode,generation:activeScene.current.generation+1};
  activeScene.current=next;
  setScene(next);
 }
 function resetScene(){
  updateOrder();
  updateScene(activeScene.current.mode);
  setInspect(false);
  setCookStatus('Заворачиваем…');
  setNotice('');
 }
 function updateActiveDraft(update:(draft:RecipeDraft)=>RecipeDraft,create=false){
  setEditor(current=>{
   if(!current.drafts.length)return create?{drafts:[update({baseId:null,batches:[]})],activeIndex:0}:current;
   const drafts=current.drafts.slice();
   drafts[current.activeIndex]=update(drafts[current.activeIndex]);
   return {...current,drafts};
  });
 }
 function beginRecipe(recipe?:RecipePreset){
  if(activeOrder.current)return;
  if(recipe&&(recipePresets.find(item=>item.id===recipe.id)?.available===false||recipe.ingredientIds.some(id=>!availableIngredientIds.includes(id)))){
   setNotice('В этом рецепте есть недоступные ингредиенты. Выбери другой рецепт или измени состав.');return;
  }
  resetScene();
  updateActiveDraft(draft=>({...draft,baseId:recipe?.id??null,batches:recipe?recipeToBatches(recipe):[]}),true);
  setAnimateRecipe(!!recipe);
  sound('click',!muted);
 }
 function restoreClassic(){beginRecipe(recipePresets[0])}
 function restart(){
  resetScene();
  setEditor(initialEditor(null,catalog));
  setQuantities({});
  setGrill(catalog.settings.grillDefault);
  sound('click',!muted);
 }
 function editAgain(){
  resetScene();
  updateActiveDraft(settledDraft);
 }
 function pickFromTray(id:IngredientId,origin?:[number,number,number]){
  if(activeScene.current!==scene||activeOrder.current)return;
  if(batches.some(batch=>batch.id===id)){
   setNotice(`${ingredientNames.get(id)??'Ингредиент'} уже в лаваше. Убрать его можно крестиком в составе.`);
   return;
  }
  add(id,origin,true);
 }
 function restoreSaved(ids:IngredientId[],savedGrill:boolean){
  if(activeOrder.current)return;
  const matching=recipePresets.find(recipe=>recipe.ingredientIds.length===ids.length&&recipe.ingredientIds.every(id=>ids.includes(id)));
  resetScene();
  updateActiveDraft(draft=>({
   ...draft,baseId:matching?.id??null,
   batches:ids.map((id,layer)=>({id,key:-(layer+1),layer,settled:true})),
  }),true);
  setGrill(savedGrill);
  sound('click',!muted);
 }
 function add(id:IngredientId,source?:[number,number,number],onlyAdd=false){
  if(activeOrder.current)return;
  if(!ingredients.find(item=>item.id===id)?.available&&!batches.some(item=>item.id===id)){
   setNotice('Этот ингредиент сейчас недоступен.');return;
  }
  const removing=batches.some(batch=>batch.id===id);
  if(!removing&&batches.length>=MAX_FILLINGS){setNotice(`В одном лаваше до ${MAX_FILLINGS} начинок. Убери один ингредиент, чтобы добавить другой.`);return;}
  setAnimateRecipe(false);
  setNotice('');sound(id,!muted);
  const nextKey=++seq.current;
  const ingredientSource=id==='chicken'?[...rotisserieLayout.cutPoint] as [number,number,number]:source;
  if(id==='chicken'&&!removing&&show3D&&sceneRequested)stageRef.current?.scrollIntoView({block:'start'});
  updateActiveDraft(draft=>{
   const {batches}=draft;
   if(batches.some(batch=>batch.id===id))return onlyAdd?draft:{...draft,batches:batches.filter(batch=>batch.id!==id)};
   if(batches.length>=MAX_FILLINGS)return draft;
   const occupied=new Set(batches.map(batch=>batch.layer));let layer=0;while(occupied.has(layer))layer++;
   return {...draft,batches:[...batches,{id,key:nextKey,layer,source:ingredientSource}]};
  },true);
 }
 function undoLastIngredient(){
  if(activeOrder.current||!lastManualIngredient)return;
  add(lastManualIngredient.id);
 }
 function changeIngredientOrder(index:number,offset:number){
  const nextIndex=index+offset;
  if(activeOrder.current||nextIndex<0||nextIndex>=batches.length)return;
  setAnimateRecipe(false);
  updateActiveDraft(draft=>{
   const reordered=draft.batches.slice();
   [reordered[index],reordered[nextIndex]]=[reordered[nextIndex],reordered[index]];
   return {...draft,batches:reordered.map((batch,layer)=>({...batch,layer,settled:true}))};
  });
 }
 function sceneFailed(){
  if(activeScene.current!==scene)return;
  const current=activeOrder.current;
  if(current)updateOrder({...current,usesScene:false,status:current.status==='served'?'served':'recovery'});
  updateScene('fallback');
  setInspect(false);
 }
 function continueWithout3D(){
  updateScene('quick');
  setInspect(false);
  const current=activeOrder.current;
  if(!current)return;
  const quickOrder={...current,usesScene:false};
  if(current.status==='served')updateOrder(quickOrder);
  else finishOrder(quickOrder);
 }
 function toggle3D(){
  if(activeScene.current.mode!=='visual'){
   updateActiveDraft(settledDraft);
   setSceneRequested(true);
   updateScene('visual');
   return;
  }
  continueWithout3D();
 }
 function selectDraft(index:number){
  if(activeOrder.current||index===activeIndex)return;
  updateScene(activeScene.current.mode);
  setEditor(current=>({
   drafts:current.drafts.map((draft,i)=>i===index?settledDraft(draft):draft),
   activeIndex:index,
  }));
  setNotice('');
 }
 function changeShawarmaQuantity(delta:number){
  if(activeOrder.current)return;
  const count=shawarmaQuantity+delta;
  if(count<0||count>MAX_SHAWARMA_QUANTITY)return;
  updateScene(activeScene.current.mode);
  setEditor(current=>{
   const {drafts,activeIndex}=current;
   if(delta>0){
    if(drafts.length>=MAX_SHAWARMA_QUANTITY)return current;
    return {drafts:[...drafts,(drafts[activeIndex]?settledDraft(drafts[activeIndex]):initialEditor(null,catalog).drafts[0])],activeIndex:drafts.length};
   }
   if(!drafts.length)return current;
   const remaining=drafts.filter((_,index)=>index!==activeIndex);
   const nextIndex=Math.max(0,Math.min(activeIndex,remaining.length-1));
   if(remaining.length)remaining[nextIndex]=settledDraft(remaining[nextIndex]);
   return {drafts:remaining,activeIndex:nextIndex};
  });
  setNotice('');
 }
 function changeExtra(id:ExtraId,delta:number){
  if(activeOrder.current)return;
  if(delta>0&&!extrasMenu.find(item=>item.id===id)?.available)return;
  setQuantities(current=>{
   const count=Math.min(MAX_EXTRA_QUANTITY,Math.max(0,(current[id]??0)+delta));
   return {...current,[id]:count};
  });
 }
 async function submitKitchenOrder(){
  const current=activeOrder.current;
  const kitchen=current?.kitchen;
  if(!current||!kitchen||kitchen.state==='sending'||kitchen.state==='sent')return;
  updateOrder({...current,kitchen:{...kitchen,state:'sending'}});
  try{
   const ticket=await kitchenRequest<KitchenTicket>('/orders',kitchenWrite('POST',{
    requestId:kitchen.requestId,order:current.priced,grill:current.repeatComposition.grill,
   }));
   clearKitchenRequest(kitchen.requestId);
   const saved={requestId:kitchen.requestId,ticket};
   setRememberedTicket(saved);
   rememberKitchenTicket(saved);
   const latest=activeOrder.current;
   if(latest?.kitchen?.requestId===kitchen.requestId)updateOrder({...latest,kitchen:{...kitchen,state:'sent',ticket}});
  }catch(error){
   const latest=activeOrder.current;
   if(latest?.kitchen?.requestId===kitchen.requestId)updateOrder({...latest,kitchen:{
    ...kitchen,state:'failed',error:error instanceof Error?error.message:'Не удалось связаться с кухней.',
   }});
  }
 }
 function startOrder(withShawarma:boolean,skip3D=false){
  if(locked||activeOrder.current)return;
  if(!kitchenChecked){setNotice('Проверяем подключение к кухне. Попробуй ещё раз через секунду.');return}
  const extras=extrasMenu.flatMap(({id})=>{
   const quantity=quantities[id]??0;
   return quantity>0?[{id,quantity}]:[];
  });
  if(withShawarma){
   const emptyIndex=drafts.findIndex(draft=>!draft.batches.length);
   if(emptyIndex!==-1){
    selectDraft(emptyIndex);
    setNotice(`Шаурма ${emptyIndex+1} без начинки. Добавь хотя бы один ингредиент.`);
    return;
   }
  }
  if (!withShawarma && !extras.length) return;
  const unavailableExtra=extrasMenu.find(item=>!item.available&&(quantities[item.id]??0)>0);
  if(unavailableExtra){setNotice(`«${unavailableExtra.title}» больше недоступно. Убери позицию из заказа.`);return}
  if(withShawarma){
   const unavailableIndex=drafts.findIndex(draft=>draft.batches.some(batch=>!availableIngredientIds.includes(batch.id)));
   if(unavailableIndex!==-1){
    selectDraft(unavailableIndex);
    setNotice(`В шаурме ${unavailableIndex+1} есть недоступные ингредиенты. Убери или замени их.`);
    return;
   }
  }
  const priceResult=calculateOrderPrice({
   shawarmas:withShawarma?drafts.map(draft=>({title:panelTitle(describeDraft(draft,catalog).summary,ingredientNames),ingredientIds:draft.batches.map(batch=>batch.id),strictOrder:draft.strictOrder})):[],
   extras,
  },pricing,catalog);
  if(!priceResult.ok){setNotice(priceResult.error);return}
  const snapshot={id:++nextOrder.current,withShawarma,shawarmaQuantity:withShawarma?shawarmaQuantity:0,extras};
  const usesScene=!skip3D&&activeScene.current.mode==='visual';
  const pending:DemoOrder={
   snapshot,priced:priceResult.order,
   repeatComposition:{version:1,shawarmas:withShawarma?drafts.map(recipeComposition):[],extras:Object.fromEntries(extras.map(item=>[item.id,item.quantity])),grill},
   productInfo:structuredClone(productInfo),
   recipes:withShawarma?{
    batches:drafts.map(draft=>settledDraft(draft).batches),
    grill,
   }:null,
   status:withShawarma?'cooking':'serving',
   usesScene,
   kitchen:kitchenEnabled?{requestId:reserveKitchenRequest(priceResult.order,grill),state:'idle'}:undefined,
  };
  setNotice('');
  setInspect(false);
  if(!usesScene){
   if(skip3D&&activeScene.current.mode==='visual')updateScene('quick');
   finishOrder(pending);
   void submitKitchenOrder();
   return;
  }
  stageRef.current?.scrollIntoView({block:'start'});
  setSceneRequested(true);
  updateOrder(pending);
  void submitKitchenOrder();
  if(withShawarma){
   sound('fold',!muted);
   setCookStatus('Заворачиваем…');
  }else{
   sound('click',!muted);
  }
 }
 function onCooked(id:number|undefined){
  const current=activeOrder.current;
  if(!current||current.status!=='cooking'||current.snapshot.id!==id)return;
  updateOrder({...current,status:'serving'});
 }
 function onServed(id:number){
  const current=activeOrder.current;
  if(!current||current.status!=='serving'||current.snapshot.id!==id)return;
  finishOrder(current);
 }
 function finishOrder(current:DemoOrder){
  const saved=saveCompletedOrder({status:'served',order:current.repeatComposition});
  setLastOrderWarning(saved.ok?'':saved.error);
  if(saved.ok)setLastOrderRefresh(value=>value+1);
  updateOrder({...current,status:'served'});
  sound('ready',!muted);
 }
 function goToOrder(){
  if(orderStatus==='served'){receiptRef.current?.scrollIntoView({block:'start'});return}
  if(inPreparation){stageRef.current?.scrollIntoView({block:'start'});return}
  const editor=document.getElementById('order');
  editor?.scrollIntoView({block:'start'});
  editor?.focus({preventScroll:true});
 }
 const panelShawarmas=order
  ?order.priced.shawarmas.map(recipe=>({
    title:recipe.title,filled:true,steps:recipe.strictOrder?recipe.ingredients.map(item=>item.name):undefined,
   }))
  :drafts.map(draft=>({
    title:panelTitle(describeDraft(draft,catalog).summary,ingredientNames),filled:!!draft.batches.length,
    steps:draft.strictOrder?draft.batches.map(batch=>ingredientNames.get(batch.id)??batch.id):undefined,
   }));
 const panelExtras=extrasMenu.flatMap(({id,title})=>{
  const quantity=order?order.snapshot.extras.find(extra=>extra.id===id)?.quantity:quantities[id];
  return quantity?[{title,quantity}]:[];
 });
 const hasOrderItems=shawarmaQuantity>0||panelExtras.length>0;
 const canCheckout=kitchenChecked&&hasOrderItems&&previewPrice.ok&&!locked;
 const stageLabel=servingOrder&&orderStatus==='served'?(order?.kitchen?'3D-приготовление завершено':'Заказ готов к выдаче'):orderStatus==='serving'?'Поднос едет на выдачу':orderStatus==='cooking'?cookStatus:'3D-кухня';
 function openAdmin(){
  if(inPreparation||recovering)return;
  setAdminOpen(true);
  window.scrollTo(0,0);
 }
 async function syncMenu(change:Partial<SharedMenu>){
  if(!kitchenEnabled)return null;
  try{
   await kitchenRequest<SharedMenu>('/menu',kitchenWrite('PUT',change));
   setMenuSyncError('');
   return null;
  }catch(error){
   return (error instanceof Error?error.message:'Не удалось сохранить общее меню.')+' Войдите через «Экран кухни» и повторите.';
  }
 }
 async function applyCatalog(next:CatalogSettings){
  const failure=await syncMenu({catalog:next});
  if(failure)return failure;
  const result=saveCatalog(next);
  if(!result.ok)return result.error;
  setCatalog(result.catalog);
  setGrill(result.catalog.settings.grillDefault);
  setCatalogWarning('');
  return null;
 }
 function restoreLastOrder(draft:RepeatOrderDraft){
  if(activeOrder.current)return 'Сначала вернись к редактированию заказа.';
  resetScene();
  setEditor({drafts:draft.shawarmas.map(recipeDraft),activeIndex:0});
  setQuantities({...draft.extras});
  setGrill(draft.grill);
  setNotice('Заказ восстановлен. Проверь состав и текущую стоимость.');
  return null;
 }
 function applyProductInfo(next:ProductInfoSettings){
  const result=saveProductInfo(next);
  if(!result.ok)return result.error;
  setProductInfo(result.settings);setInfoWarning('');return null;
 }
 const kitchenTicket=order?.kitchen&&<div className="kitchen-ticket" aria-label="Заказ на кухню">
      <p role="status">{order.kitchen.ticket
        ? `Заказ №${order.kitchen.ticket.id} · ${kitchenStatusLabel[order.kitchen.ticket.status]}`
        : order.kitchen.state==='failed'?'Отправка на кухню не подтверждена':'Отправляем заказ на кухню…'}</p>
      {order.kitchen.state==='failed'&&<>
       <small>{order.kitchen.error}</small>
       <button type="button" className="order-jump" onClick={()=>void submitKitchenOrder()}>Повторить отправку</button>
      </>}
     </div>;
 if(kitchenOpen)return <Suspense fallback={<div className="app">Открываем экран кухни…</div>}>
  <KitchenDashboard onClose={()=>{setKitchenOpen(false);location.hash='craft'}}/>
 </Suspense>;
 if(infoOpen)return <Suspense fallback={<div className="app">Открываем сведения о составе…</div>}>
  <ProductInfoPanel settings={productInfo} catalog={catalog} onSave={applyProductInfo} onClose={()=>{setInfoOpen(false);setAdminOpen(true)}}/>
 </Suspense>;
 async function applyPrices(next:PricingSettings){
  const failure=await syncMenu({pricing:next});
  if(failure)return failure;
  const result=savePricing(next);
  if(!result.ok)return result.error;
  setPricing(result.pricing);
  setPricingWarning('');
  return null;
 }
 if(pricesOpen)return <Suspense fallback={<div className="app">Открываем цены…</div>}>
  <PriceSettingsPanel catalog={catalog} pricing={pricing} onSave={applyPrices} onClose={()=>{setPricesOpen(false);setAdminOpen(true)}}/>
 </Suspense>;
 if(adminOpen)return <Suspense fallback={<div className="app">Открываем редактор меню…</div>}>
  <AdminPanel catalog={catalog} onProductInfo={()=>{setAdminOpen(false);setInfoOpen(true)}} onPrices={()=>{setAdminOpen(false);setPricesOpen(true)}} onSave={applyCatalog} onClose={()=>{setAdminOpen(false);updateScene(activeScene.current.mode)}}/>
 </Suspense>;
 return <main className="app">
  <div className="signboard">
   <header className="header">
    <a className="brand" href="/" aria-label="Shawarma Craft"><span className="brand-mark" aria-hidden="true">SC</span><span className="brand-title">{catalog.settings.title}</span></a>
    <div className="header-actions"><button type="button" className="icon-button" onClick={()=>setMuted(value=>!value)} aria-label={muted?'Включить звук':'Выключить звук'}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button><button type="button" className="icon-button" onClick={restart} aria-label="Начать заново"><RotateCcw size={19}/></button></div>
   </header>
   <section className="intro">
    <h1>{catalog.settings.slogan}</h1>
    <p>До трёх шаурм в демо-заказе, у каждой свой состав.</p>
   </section>
  </div>
  <nav className="kitchen-nav" aria-label="Разделы меню">
   <a href="#craft"><Utensils size={17} aria-hidden="true"/> Шаурма</a>
   <a href="#fillings"><SlidersHorizontal size={17} aria-hidden="true"/> Начинки</a>
   <a href="#extras"><CupSoda size={17} aria-hidden="true"/> Дополнения</a>
   <button type="button" disabled={inPreparation||recovering} onClick={openAdmin}>Управление меню</button>
  </nav>
  {infoWarning&&<p className="recipe-notice has-notice" role="status">{infoWarning}</p>}
  {pricingWarning&&<p className="recipe-notice has-notice" role="status">{pricingWarning}</p>}
  {kitchenEnabled&&menuSyncError&&<p className="recipe-notice has-notice" role="status">{menuSyncError}</p>}
  {displayRememberedTicket&&<div className="kitchen-ticket" aria-label="Последний заказ на кухню">
   <p role="status">Заказ №{displayRememberedTicket.ticket.id} · {kitchenStatusLabel[displayRememberedTicket.ticket.status]}</p>
  </div>}
  {catalogWarning&&<p className="recipe-notice has-notice" role="status">{catalogWarning}</p>}
  <section id="craft" className="menu-library" aria-label="Готовые рецепты">
   <div className="shawarma-picker">
    <div className="shawarma-drafts" role="group" aria-label="Выбор шаурмы для редактирования">
     {drafts.map((_,index)=><button key={index} type="button" aria-pressed={index===activeIndex}
      disabled={locked} onClick={()=>selectDraft(index)}>Шаурма {index+1}</button>)}
    </div>
    <div className="shawarma-stepper" role="group" aria-label="Количество шаурмы">
     <button type="button" className="shawarma-remove" aria-label={removeDraftLabel} title={removeDraftLabel}
      disabled={locked||shawarmaQuantity===0} onClick={()=>changeShawarmaQuantity(-1)}>
      <Minus size={16} aria-hidden="true"/>{removeDraftLabel}
     </button>
     <output aria-label="Количество шаурмы">{shawarmaQuantity}</output>
     <button type="button" aria-label="Увеличить количество шаурмы"
      disabled={locked||shawarmaQuantity===MAX_SHAWARMA_QUANTITY} onClick={()=>changeShawarmaQuantity(1)}><Plus size={16}/></button>
    </div>
   </div>
   <div className="library-heading"><h2>Готовые рецепты</h2><span className="active-draft-label">{shawarmaQuantity?`Рецепт для шаурмы ${activeIndex+1}`:"Выбери рецепт, чтобы добавить шаурму"}</span></div>
   <div className="preset-carousel">{recipePresets.filter(recipe=>recipe.available).map(recipe=><button key={recipe.id} className={'preset-card '+(recipe.id===baseId?'active':'')} disabled={locked||recipe.ingredientIds.some(id=>!availableIngredientIds.includes(id))} onClick={()=>beginRecipe(recipe)} aria-pressed={recipe.id===baseId} aria-label={'Рецепт: '+recipe.title}><span className="preset-emoji">{recipe.emoji}</span><span className="preset-copy"><b>{recipe.title}</b><small>{recipe.ingredientIds.length} ингредиентов · {recipe.kind==='classic'?'Базовый':'Наш вариант'}</small></span>{recipe.id===baseId?<Check size={15}/>:<ArrowUpRight size={15}/>}</button>)}</div>
  </section>
  {!locked&&<div className="mobile-craft-actions" aria-label="Режим конструктора">
   <a className="order-jump" href="#order">Состав шаурмы</a>
   {show3D
    ? sceneRequested
     ? <button type="button" className="scene-toggle" onClick={toggle3D}>Отключить 3D</button>
     : <button type="button" className="scene-toggle" onClick={()=>setSceneRequested(true)}>Открыть 3D-кухню</button>
    : <button type="button" className="scene-toggle" onClick={toggle3D}>Включить 3D</button>}
  </div>}
  <section className={show3D?'play-layout':'play-layout play-layout-quick'}>
   {show3D&&<div ref={stageRef} className={'stage '+(!sceneRequested?'stage-preview ':'')+(inspect?'inspecting':'')}>
    <div className="stage-top"><span className="live-label" role="status"><i/>{stageLabel}</span></div>
    {sceneRequested?<SceneBoundary key={scene.generation} onUnavailable={sceneFailed}>
     <Suspense fallback={<div className="fallback"><span>🌯</span><p>Разогреваем кухню…</p></div>}>
      <Kitchen onUndoLastIngredient={lastManualIngredient&&!locked?undoLastIngredient:undefined} ingredientNames={ingredientNames} preparing={inPreparation} animateRecipe={animateRecipe} availableIngredientIds={availableIngredientIds} batches={recipeBatches?.[0]??batches} phase={phase} inspect={inspect} grill={order?.recipes?.grill??grill}
       recipeBatches={recipeBatches}
       shawarmaQuantity={order?.usesScene?order.snapshot.shawarmaQuantity:undefined}
       servingOrder={servingOrder} onServed={onServed}
       onUnavailable={sceneFailed} onIngredientPick={pickFromTray}
       onStage={status=>{
        if(activeScene.current===scene&&activeOrder.current?.status==='cooking')setCookStatus(status);
       }}
       onReady={()=>onCooked(order?.snapshot.id)}/>
     </Suspense>
    </SceneBoundary>:<div className="fallback">
     <button type="button" className="scene-toggle" onClick={()=>setSceneRequested(true)}>Открыть 3D-кухню</button>
    </div>}
    <div className="stage-bottom"><span><Move size={14} aria-hidden="true"/> Вращай и приближай сцену</span></div>
    {!locked&&batches.length===0&&<div className="scene-hint">Начни с любимого ингредиента <ArrowRight size={16}/></div>}
    {!locked&&notice&&<div className="stage-feedback" aria-hidden="true">{notice}</div>}

    {inspect&&<button className="inspect-back" onClick={()=>setInspect(false)}>← Вернуться к рецепту</button>}
   </div>}
   <aside id="order" className="recipe" tabIndex={-1}>
    <div className="recipe-heading">{shawarmaQuantity?`Шаурма ${activeIndex+1} из ${shawarmaQuantity}`:"Только напитки и закуски"}</div>
    <h2>{!shawarmaQuantity?"Выбери шаурму или дополнения":!show3D&&batches.length?summary.baseTitle:recipeTitle}</h2>
    {!show3D&&batches.length&&(summary.added.length>0||summary.removed.length>0)
     ?<RecipeChanges summary={summary} names={ingredientNames}/>
     :<p className="recipe-sub">{base?(unchanged?base.description:`На основе «${base.title}»`):'Выбери начинку для своего рецепта.'}</p>}
    <div className="base-row"><span aria-hidden="true">🫓</span><b>Тёплый лаваш</b><Check size={17} aria-hidden="true"/></div>
    {shawarmaQuantity>0&&<label className="grill-option ingredient-order-option">
     <input type="checkbox" checked={!!strictOrder} disabled={locked}
      onChange={event=>{const checked=event.target.checked;updateActiveDraft(draft=>({...draft,strictOrder:checked}))}}/>
     <ListOrdered size={18} aria-hidden="true"/>
     <span><b>Важен порядок начинки</b><small>Для этой шаурмы. Кухня увидит шаги в заказе.</small></span>
    </label>}
    {batches.length===0?<p className="empty-recipe">Пока только лаваш. Добавь начинку из меню.</p>:
     <ol className={strictOrder?'selected-list ordered-fillings':'selected-list'} aria-label={strictOrder?'Порядок начинки':'Состав шаурмы'} aria-live="polite">
      {batches.map((batch,index)=>{
       const item=ingredients.find(value=>value.id===batch.id);
       if(!item)return null;
       return <li className="selected-row" key={batch.key}>
        <span aria-hidden="true">{strictOrder&&<small className="filling-step">{index+1}</small>}{item.emoji}</span>
        <b>{item.name}{!item.available&&<small className="unavailable-item">Недоступно</small>}</b>
        <div className="filling-actions">
         {strictOrder&&!locked&&<>
          <button type="button" disabled={index===0} onClick={()=>changeIngredientOrder(index,-1)} aria-label={'Поднять '+item.name}><ArrowUp size={16}/></button>
          <button type="button" disabled={index===batches.length-1} onClick={()=>changeIngredientOrder(index,1)} aria-label={'Опустить '+item.name}><ArrowDown size={16}/></button>
         </>}
         <button type="button" disabled={locked} onClick={()=>add(batch.id)} aria-label={'Удалить '+item.name}><X size={14}/></button>
        </div>
       </li>;
      })}
     </ol>}
    <div className="recipe-footer">
     {orderStatus!=='served'&&kitchenTicket}
     <div className="count-row"><span>Ингредиентов в лаваше</span><b>{batches.length} <small>/ {MAX_FILLINGS}</small></b></div>
     {!locked&&lastManualIngredient&&<button className="order-jump" type="button" onClick={undoLastIngredient}>
      <RotateCcw size={16} aria-hidden="true"/> Отменить последнее добавление
     </button>}
     {!locked&&<a className="order-jump" href="#fillings"><SlidersHorizontal size={16} aria-hidden="true"/> Изменить начинки</a>}
     {displayedPrice&&<p className="order-price-line"><span>Весь заказ · демо-цены</span><strong>{formatMoney(displayedPrice.totalKopecks)}</strong></p>}
     {shawarmaQuantity>0&&<label className="grill-option"><input type="checkbox" checked={grill} disabled={locked} onChange={event=>setGrill(event.target.checked)}/><Flame size={18} aria-hidden="true"/><span><b>Поджарить на гриле</b><small>Для всех шаурм в заказе</small></span></label>}
     {recovering?<div className="order-recovery" role="status">
      <strong>3D-сцена остановилась. Состав заказа сохранён.</strong>
      <button type="button" className="cook-button" onClick={continueWithout3D}>Продолжить без 3D</button>
      <button type="button" className="scene-toggle" onClick={editAgain}>Вернуться к редактированию</button>
     </div>:<>
     <button type="button" className="cook-button" disabled={inPreparation||(!order&&!shawarmaQuantity&&!Object.values(quantities).some(value=>value&&value>0))}
      onClick={orderStatus==='served'?editAgain:()=>startOrder(shawarmaQuantity>0)}>
      {orderStatus==='served'?<><RotateCcw size={18}/> Собрать ещё</>:inPreparation?(orderStatus==='cooking'?cookStatus:'Поднос едет на выдачу…'):show3D&&shawarmaQuantity>0?<>🌯 Приготовить! <ArrowUpRight size={20}/></>:kitchenEnabled?'Отправить на кухню':'Оформить демо-заказ'}
     </button>
     {sceneSlow&&<p className="scene-mode-notice" role="status">3D отвечает дольше обычного. Состав заказа сохранён.</p>}
     <button type="button" className="scene-toggle" onClick={toggle3D}>{show3D?(sceneSlow?'Продолжить без 3D':'Отключить 3D'):'Включить 3D'}</button>
     {scene.mode==='fallback'&&<p className="scene-mode-notice" role="status">3D недоступно. Можно оформить демо-заказ в быстром режиме.</p>}
     </>}
     {draftWarning&&<p className="scene-mode-notice" role="status">{draftWarning}</p>}
     <div className={'recipe-notice '+(notice?'has-notice':'')} role="status">{notice&&<>{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Закрыть сообщение"><X size={14}/></button></>}</div>
    </div>
   </aside>
  </section>
  {order&&<KitchenInstructions key={order.snapshot.id} order={order.priced} grill={order.repeatComposition.grill}/>}
  {orderStatus==='served'&&order&&<section ref={receiptRef} className="serving-receipt" aria-label="Состав готового заказа">
   <div>
    <h2>{order.kitchen?'Состав заказа':order.usesScene?'Заказ готов к выдаче':'Демо-заказ оформлен'}</h2>
    {kitchenTicket}
    {order.priced.shawarmas.some(recipe=>recipe.strictOrder)&&<a className="order-jump" href="#kitchen-instructions">К шагам для кухни</a>}
    <OrderSummary order={order.priced} heading="Состав и стоимость заказа"/>
    <details className="product-info-details"><summary>Аллергены и острота выбранного состава</summary>
     <p>Сведения об ингредиентах и дополнениях. Состав лаваша и особенности приготовления нужно уточнить у заведения.</p>
     <ProductInfoSummary catalog={catalog} settings={order.productInfo} selection={{ingredients:order.priced.shawarmas.flatMap(item=>item.ingredients.map(value=>value.id)),extras:order.priced.extras.map(item=>item.id)}}/>
    </details>
   </div>
   {show3D&&order.usesScene&&order.snapshot.withShawarma&&!inspect&&<button type="button" onClick={()=>{
    setInspect(true);
    stageRef.current?.scrollIntoView({block:'nearest'});
   }}><Eye size={17}/> Посмотреть поднос</button>}
  </section>}
  <section className="recipe-options" aria-label="Настройки рецепта">
   <div className="recipe-presets"><button disabled={locked} onClick={restoreClassic}><RotateCcw size={15}/> Вернуть классику</button><button disabled={locked||batches.length===0} onClick={()=>beginRecipe()}><Trash2 size={15}/> Очистить всё</button></div>
  </section>
  {lastOrderWarning&&<p className="recipe-notice has-notice" role="status">{lastOrderWarning}</p>}
  <LastOrderPanel catalog={catalog} pricing={pricing} disabled={locked} refreshKey={lastOrderRefresh} onRestore={restoreLastOrder}/>
  <SavedRecipePanel ingredientIds={batches.map(batch=>batch.id)} grill={grill} title={recipeTitle} disabled={locked||shawarmaQuantity===0} onRestore={restoreSaved}/>
  <section id="fillings" className={'pantry '+(locked?'pantry-locked':'')} aria-label="Ингредиенты" tabIndex={-1}>
   <div className="pantry-heading"><div><h2>Начинки и соусы</h2><p>{locked?'Состав заказа зафиксирован':`Для шаурмы ${activeIndex+1}. Нажми на ингредиент, чтобы добавить или убрать его.`}</p></div><label className="ingredient-search"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ингредиент или соус" aria-label="Поиск ингредиентов"/></label></div>
   <div className="category-tabs" aria-label="Категории ингредиентов">{(Object.keys(categoryLabels) as (IngredientCategory|'all')[]).map(value=><button key={value} onClick={()=>setCategory(value)} aria-pressed={category===value} className={category===value?'active':''}>{categoryLabels[value]}<small>{ingredients.filter(item=>item.available&&(value==='all'||item.category===value)).length}</small></button>)}</div>
   {visibleIngredients.length?<div className={'ingredient-carousel'+(category!=='all'||query.trim()?' filtered-ingredients':'')}>{visibleIngredients.map(item=>{const selected=batches.some(batch=>batch.id===item.id);return <button key={item.id} disabled={locked} onClick={()=>add(item.id)} className={'ingredient '+(selected?'selected':'')} aria-pressed={selected} aria-label={item.name} style={{'--food-color':item.color} as CSSProperties}><span className="ingredient-badge" aria-hidden="true">{selected?<Check size={13}/>:<Plus size={13}/>}</span><span className="ingredient-art" aria-hidden="true">{item.emoji}</span><b>{item.name}</b><small>{item.note}</small></button>})}</div>:<div className="no-ingredients"><p>Такого ингредиента пока нет. Попробуй другое название или категорию.</p><button onClick={()=>{setQuery('');setCategory('all')}}>Показать всё</button></div>}
   {!locked&&<div className="pantry-actions"><a className="order-jump" href="#order"><Flame size={16} aria-hidden="true"/> К приготовлению</a></div>}
  </section>
  <ExtrasMenu prices={pricing.extraPrices} items={extrasMenu} quantities={quantities} onChange={changeExtra} disabled={locked} quickOrder={!show3D} onServe={()=>startOrder(false)}/>
  {!order&&<section id="order-summary" aria-label="Предварительный итог">
   {previewPrice.ok?<OrderSummary order={previewPrice.order} heading="Твой заказ" onEdit={index=>{selectDraft(index);goToOrder()}}/>
    :<p className="recipe-notice has-notice" role="status">{drafts.some(draft=>!draft.batches.length)?'Для полного расчёта добавь начинку в каждую шаурму. Напитки и закуски можно оформить отдельно.':previewPrice.error}</p>}
  </section>}
  {!order&&<details className="product-info-details"><summary>Аллергены и острота выбранного состава</summary>
   <p>Сведения об ингредиентах и дополнениях. Состав лаваша и особенности приготовления нужно уточнить у заведения.</p>
   <ProductInfoSummary catalog={catalog} settings={productInfo} selection={{ingredients:drafts.flatMap(draft=>draft.batches.map(batch=>batch.id)),extras:extrasMenu.filter(item=>(quantities[item.id]??0)>0).map(item=>item.id)}}/>
  </details>}
  <details className="menu-sources"><summary><BookOpen size={15}/> О рецептах и составе</summary><p>Это творческая 3D-кухня, вдохновлённая московскими меню. Наши варианты можно менять; они не повторяют точные рецептуры заведений. Порции условные. Наличие продуктов и состав соусов в настоящем заказе нужно уточнять у заведения.</p><ul>{menuSources.map(source=><li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a><span>{source.scope==='moscow'?'Москва':'Справочный рецепт'} · {source.note}</span></li>)}</ul><p>{kitchenEnabled?'Заказы передаются на экран кухни в локальной сети. Оплата не подключена.':'Демонстрационный конструктор. Заказы сохраняются в браузере.'}</p></details>
  <footer className="footer"><span>{catalog.settings.title}</span><a className="admin-link" href="#kitchen">Экран кухни</a><button type="button" className="admin-link" disabled={inPreparation||recovering} onClick={openAdmin}>Управление меню</button></footer>
  <MobileOrder total={displayedPrice?formatMoney(displayedPrice.totalKopecks):undefined} shawarmas={panelShawarmas} extras={panelExtras} activeIndex={activeIndex}
   status={recovering?'recovery':inPreparation?'preparing':orderStatus==='served'?'ready':'editing'}
   liveKitchen={kitchenEnabled}
   kitchenMessage={order?.kitchen?.ticket?`Заказ №${order.kitchen.ticket.id} · ${kitchenStatusLabel[order.kitchen.ticket.status]}`:order?.kitchen?.state==='failed'?'Отправка не подтверждена':order?.kitchen?'Отправляем заказ на кухню…':undefined}
   grill={order?.repeatComposition.grill??grill}
   onEdit={index=>{selectDraft(index);goToOrder()}} onContinue={goToOrder}
   onCheckout={canCheckout?()=>startOrder(shawarmaQuantity>0):undefined}
   onQuickCheckout={canCheckout&&show3D?()=>startOrder(shawarmaQuantity>0,true):undefined}/>
 </main>
}
