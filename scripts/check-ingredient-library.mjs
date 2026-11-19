import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function compile(name){
 if(modules.has(name))return modules.get(name);
 const source=readFileSync(new URL('../src/'+name+'.ts',import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/shawarma-craft/'));
 const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const code=out.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(compile(name)));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
}
const {ingredientLibrary,ingredientFromLibrary,ingredientImageSource,validIngredientImage,MAX_IMAGE_LENGTH}=await import(compile('ingredientLibrary'));
const {defaultCatalog,validateCatalogSettings,saveCatalog,loadCatalog}=await import(compile('catalogSettings'));
const {defaultPricing,calculateOrderPrice}=await import(compile('pricing'));
const {registerIngredientVisuals,visualIngredientId,isSauceId}=await import(compile('domain'));
const {stationPage,stationFoodIds,stationSauceIds}=await import(compile('pantryStations'));
const {ingredientPieceCount,centeredSlot}=await import(compile('sceneLayout'));
const {parseOrderDraft}=await import(compile('orderDraft'));
const {validateSavedRecipe}=await import(compile('savedRecipe'));
const {createProductInfo,summarizeProductInfo,validateProductInfo}=await import(compile('productInfo'));
assert.equal(ingredientLibrary.length,88);
assert.equal(new Set(ingredientLibrary.map(item=>item.id)).size,88);
for(const item of ingredientLibrary){
 assert(validIngredientImage(item.image));
 assert.equal(ingredientImageSource(item.image),'/shawarma-craft/ingredient-images/'+item.libraryKey+'.svg');
 const asset=new URL('../public/ingredient-images/'+item.libraryKey+'.svg',import.meta.url);
 assert(existsSync(asset));
 assert(readFileSync(asset,'utf8').includes(item.name),'Each built-in illustration identifies its own ingredient');
}
const catalog=structuredClone(defaultCatalog);
const avocado=ingredientFromLibrary('avocado');
const hummus=ingredientFromLibrary('hummus');
assert(avocado&&hummus);
catalog.ingredients.push({...avocado,available:true},{...hummus,available:true});
let result=validateCatalogSettings(catalog);
assert(result.ok);
assert.equal(result.catalog.ingredients.at(-2).id,'custom-avocado');
registerIngredientVisuals(result.catalog.ingredients);
assert.equal(visualIngredientId('custom-avocado'),'lettuce');
assert.equal(isSauceId('custom-hummus'),true);
assert.equal(visualIngredientId('custom-hummus'),'white');
assert.equal(ingredientPieceCount('custom-avocado'),ingredientPieceCount('lettuce'));
const available=result.catalog.ingredients.map(item=>item.id);
const pageItems=(ids)=>Array.from({length:40},(_,page)=>stationPage(ids,available,page,5).ids).flat();
assert(pageItems(stationFoodIds).includes('custom-avocado'),'Custom ingredients get selectable physical pantry containers');
assert(pageItems(stationSauceIds).includes('custom-hummus'),'Custom sauces get selectable physical bottles');
assert(!pageItems(stationFoodIds).includes('custom-hummus'));
assert(!pageItems(stationSauceIds).includes('custom-avocado'));
// The bottle flight passes an already-expanded shelf list. It must not append the
// same custom sauce a second time, or the last bottle flies from the wrong X.
const expandedSauces=[...stationSauceIds,'custom-hummus'];
const sauceAvailability=[...stationSauceIds.slice(0,6),'custom-hummus'];
const canonicalLastPage=stationPage(stationSauceIds,sauceAvailability,2,3);
const expandedLastPage=stationPage(expandedSauces,sauceAvailability,2,3);
assert.deepEqual(expandedLastPage,canonicalLastPage,'Canonical and pre-expanded shelf lists must produce the same final page');
assert.deepEqual(expandedLastPage.ids,['custom-hummus']);
assert.equal(expandedLastPage.total,7);
assert.equal(new Set(expandedLastPage.ids).size,expandedLastPage.ids.length);
assert.equal(centeredSlot(expandedLastPage.ids.indexOf('custom-hummus'),expandedLastPage.ids.length,1.1),0,'A single final-page sauce bottle must launch from the shelf center');

const input={shawarmas:[{title:'Своя',ingredientIds:['chicken','custom-avocado']}],extras:[]};
let price=calculateOrderPrice(input,defaultPricing,result.catalog);
assert(price.ok);assert.equal(price.order.totalKopecks,28000);
assert.equal(price.order.shawarmas[0].ingredients[1].id,'custom-avocado');
assert.equal(price.order.shawarmas[0].ingredients[1].name,'Авокадо');
result.catalog.ingredients.find(item=>item.id==='custom-avocado').surchargeKopecks=1234;
price=calculateOrderPrice(input,defaultPricing,result.catalog);assert(price.ok);assert.equal(price.order.totalKopecks,26234);
assert(!calculateOrderPrice({...input,shawarmas:[{title:'X',ingredientIds:['custom-unknown']}]},defaultPricing,result.catalog).ok);
const storage=new Map();globalThis.window={localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}};
assert(saveCatalog(result.catalog).ok);
const loaded=loadCatalog();assert.equal(loaded.warning,'');assert.equal(loaded.catalog.ingredients.at(-2).surchargeKopecks,1234);
assert.equal(loaded.catalog.ingredients.at(-2).image,'library:avocado');
const draft={version:1,shawarmas:[{baseId:null,ingredientIds:['custom-avocado','custom-hummus']}],activeIndex:0,extras:{},grill:true};
assert.deepEqual(parseOrderDraft(JSON.stringify(draft)),draft);
assert(validateSavedRecipe({version:1,title:'Своя',ingredientIds:['custom-avocado'],grill:true}).ok);
const info=summarizeProductInfo(createProductInfo(),{ingredients:['custom-avocado'],extras:[]});
assert.equal(info.incomplete,true);assert.equal(info.unverified.length,1,'New foods start explicitly unverified');
const customInfo=createProductInfo();customInfo.ingredients['custom-avocado']={verified:false,allergens:[],spice:null,crossContactNote:'',verifiedAt:null};
assert(validateProductInfo(customInfo).ok);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=';
assert(validIngredientImage(png));
assert.equal(ingredientImageSource(png),png);
for(const invalid of ['https://example.org/image.png','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,PHNjcmlwdD4=','library:nonexistent',png+'x'.repeat(MAX_IMAGE_LENGTH)])assert(!validIngredientImage(invalid));
for(const update of [
 item=>{item.id='arbitrary';},item=>{item.visualId='nonexistent';},item=>{item.category='sauce';item.visualId='chicken';},
 item=>{item.surchargeKopecks=-1;},item=>{item.surchargeKopecks=1.5;},item=>{item.image='https://example.org/tracker.png';},
]){
 const bad=structuredClone(catalog);update(bad.ingredients.at(-2));assert(!validateCatalogSettings(bad).ok);
}
const duplicate=structuredClone(catalog);duplicate.ingredients.push({...duplicate.ingredients.at(-1)});assert(!validateCatalogSettings(duplicate).ok);
const missingCore=structuredClone(catalog);missingCore.ingredients.shift();assert(!validateCatalogSettings(missingCore).ok);
const safeImage='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(59000)]).toString('base64');
assert(validIngredientImage(safeImage));
const tooLarge=structuredClone(defaultCatalog);
for(let i=0;i<25;i++)tooLarge.ingredients.push({...avocado,id:'custom-big-'+i,image:safeImage,available:false});
assert(!validateCatalogSettings(tooLarge).ok,'Aggregate image budget stays bounded');
console.log('PASS ingredient library: 88 local illustrations, custom identities/pricing/persistence, pantry model aliases, sauce bottles, draft/favorite restore, unverified product info and image/input limits.');
