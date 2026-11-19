import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

async function load(name){
 const source=readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
 return import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
}
const {paymentOptions,paymentMethodLabel,isPaymentMethod,DEMO_PAYMENT_NOTICE,ONLINE_PAYMENT_UNAVAILABLE}=await load('payment');
assert.equal(paymentMethodLabel(),'Оплата на кассе');
assert.equal(paymentMethodLabel('cashier'),'Оплата на кассе');
assert.equal(paymentMethodLabel('online_card'),'Онлайн картой');
for(const method of ['cashier','online_card'])assert.equal(isPaymentMethod(method),true);
for(const value of [undefined,null,'card','paid','CASHIER',true,1,{},[],'constructor'])assert.equal(isPaymentMethod(value),false);
const demo=paymentOptions(true),live=paymentOptions(false);
assert.deepEqual(demo.map(({id,disabled})=>({id,disabled})),[{id:'cashier',disabled:false},{id:'online_card',disabled:false}]);
assert(demo.every(option=>option.hint===DEMO_PAYMENT_NOTICE),'Every demo method must explicitly say no funds are taken');
assert.equal(live.find(option=>option.id==='cashier').disabled,false);
assert.equal(live.find(option=>option.id==='online_card').disabled,true,'Live card checkout cannot pretend a gateway exists');
assert.equal(live.find(option=>option.id==='online_card').hint,ONLINE_PAYMENT_UNAVAILABLE);
demo[0].disabled=true;
assert.equal(paymentOptions(true)[0].disabled,false,'Callers cannot mutate shared availability');

const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
const {reserveKitchenRequest,clearKitchenRequest}=await load('kitchenClient');
const order={shawarmas:[{title:'Классическая',ingredients:[{id:'chicken'}]}],extras:[],totalKopecks:25000};
const cashier=reserveKitchenRequest(order,true,'cashier');
assert.equal(reserveKitchenRequest(order,true),cashier,'Omitted methods remain cashier-compatible');
assert.equal(reserveKitchenRequest(structuredClone(order),true,'cashier'),cashier,'Retries of the same order and method reuse request IDs');
const card=reserveKitchenRequest(order,true,'online_card');
assert.notEqual(card,cashier,'A different payment choice cannot accidentally reuse a previous method reservation');
assert.equal(reserveKitchenRequest(order,true,'online_card'),card);
clearKitchenRequest(cashier);
assert.equal(reserveKitchenRequest(order,true,'online_card'),card,'Clearing a superseded request cannot delete a newer reservation');
clearKitchenRequest(card);
assert.notEqual(reserveKitchenRequest(order,true,'online_card'),card);
const pendingKey='shawarma-craft:kitchen-pending:v1';
const legacyId='12345678-1234-4234-8234-123456789abc';
values.set(pendingKey,JSON.stringify({id:legacyId,signature:JSON.stringify({order,grill:true})}));
assert.equal(reserveKitchenRequest(order,true,'cashier'),legacyId,'A legacy cashier retry after upgrade must keep its request ID');
assert.notEqual(reserveKitchenRequest(order,true,'online_card'),legacyId,'Legacy reservations cannot be reused for online card');
globalThis.localStorage={getItem(){throw new Error('storage denied')},setItem(){throw new Error('storage denied')}};
assert.match(reserveKitchenRequest(order,true,'cashier'),/^[0-9a-f-]{36}$/,'Blocked browser storage still allows an in-memory order request');

console.log('PASS payment: methods/labels, explicit demo notice, live card disabled without gateway, stable method-aware idempotency, legacy cashier retries and denied-storage fallback.');
