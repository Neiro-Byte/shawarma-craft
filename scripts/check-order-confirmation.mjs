import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Run the actual App handlers with the real pricing calculation. Only boundary
// effects (React setters, animation, order allocation and kitchen I/O) are spied.
const modules = new Map();
function compile(name) {
  if (modules.has(name)) return modules.get(name);
  const input = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  let code = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/from ['"]\.\/(data|domain|extraMenuCatalog)['"]/g, (_, dependency) => `from '${compile(dependency)}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  modules.set(name, url);
  return url;
}
const { calculateOrderPrice, defaultPricing } = await import(compile('pricing'));
const { paymentOptions } = await import(compile('payment'));
const { ingredients, classicIds } = await import(compile('data'));
const { extrasMenu } = await import(compile('extraMenuCatalog'));
const appText = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name, root = ast) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    else ts.forEachChild(node, visit);
  }
  visit(root);
  assert(found, `Missing actual function ${name}`);
  return found.getText(root);
}
const handlerNames = ['recipeComposition', 'settledDraft', 'describeDraft', 'panelTitle', 'cancelOrderReview', 'confirmOrderReview', 'startOrder'];
const handlerCode = ts.transpileModule(handlerNames.map(name => declaration(name)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function scenario() {
  const events = [];
  const context = {
    classicIds, calculateOrderPrice, structuredClone,
    locked: false, kitchenChecked: true, kitchenEnabled: true, staticDemo: false,
    activeOrder: { current: undefined }, orderReviewRef: { current: undefined }, confirmingOrder: { current: false }, nextOrder: { current: 0 },
    catalog: { ingredients: structuredClone(ingredients), extras: structuredClone(extrasMenu), recipes: [{ id: 'classic', title: 'Классическая', ingredientIds: [...classicIds] }] },
    extrasMenu: extrasMenu.map(item => ({ ...item, available: true })), quantities: {},
    drafts: [{ baseId: 'classic', batches: classicIds.map((id, layer) => ({ id, layer, key: -(layer + 1), settled: true })) }],
    availableIngredientIds: ingredients.map(item => item.id), ingredientNames: new Map(ingredients.map(item => [item.id, item.name])),
    pricing: structuredClone(defaultPricing), grill: true, shawarmaQuantity: 1, productInfo: {}, muted: true,
    activeScene: { current: { mode: 'visual' } }, stageRef: { current: { scrollIntoView() { events.push('scroll'); } } },
    setNotice(value) { context.notice = value; },
    selectDraft(index) { events.push(['selectDraft', index]); },
    setOrderReview(value) { context.orderReview = value; },
    setInspect() { events.push('inspect'); }, setSceneRequested() { events.push('scene'); },
    reserveKitchenRequest(order, grill, method) { context.reserveMethod = method; events.push('reserve'); return 'request-1'; },
    submitKitchenOrder() { events.push('submit'); },
    finishOrder(order) { events.push('finish'); context.activeOrder.current = { ...order, status: 'served' }; },
    updateOrder(order) { events.push('updateOrder'); context.activeOrder.current = order; },
    updateScene(mode) { events.push('changeScene'); context.activeScene.current.mode = mode; },
    stopSounds() { events.push('stopSounds'); }, sound() { events.push('sound'); }, setCookStatus() { events.push('cookStatus'); },
  };
  const handlers = new Function('context', `with(context){${handlerCode};return {startOrder,confirmOrderReview,cancelOrderReview}}`)(context);
  return { ...handlers, context, events };
}
function untouched(s) {
  assert.equal(s.context.nextOrder.current, 0, 'Review must not allocate an order number');
  assert.equal(s.context.activeOrder.current, undefined);
  assert.deepEqual(s.events, [], 'No scene, audio, kitchen or completion effects before confirmation');
}
{
  const s = scenario();
  assert.equal(s.startOrder(true), false);
  untouched(s);
  assert(s.context.orderReview);
  assert.equal(s.context.orderReview.order.totalKopecks, 25000);
  assert.equal(s.startOrder(true), false, 'Repeated checkout does not replace an open review');
  untouched(s);
  assert.equal(s.confirmOrderReview(), true);
  assert.equal(s.context.orderReview, undefined);
  assert.equal(s.context.nextOrder.current, 1);
  assert.equal(s.context.activeOrder.current.status, 'cooking');
  assert.equal(s.context.activeOrder.current.snapshot.paymentMethod, 'cashier');
  assert.equal(s.context.reserveMethod, 'cashier');
  assert.equal(s.events.filter(event => event === 'reserve').length, 1);
  assert.equal(s.events.filter(event => event === 'submit').length, 1);
  assert.equal(s.confirmOrderReview(), false);
  assert.equal(s.startOrder(true), false);
  assert.equal(s.context.nextOrder.current, 1, 'Double confirm cannot create a second order');
}
{
  const s = scenario(), original = structuredClone(s.context.drafts);
  s.startOrder(true); s.cancelOrderReview();
  untouched(s);
  assert.equal(s.context.orderReviewRef.current, undefined);
  assert.deepEqual(s.context.drafts, original, 'Cancel preserves editable recipes');
  assert.equal(s.confirmOrderReview(), false);
  s.startOrder(true); assert.equal(s.confirmOrderReview(), true);
  assert.equal(s.context.nextOrder.current, 1, 'Cancelled review consumes no number');
}
for (const skip3D of [false, true]) {
  const s = scenario();
  if (!skip3D) s.context.activeScene.current.mode = 'quick';
  s.startOrder(true, skip3D); untouched(s);
  assert.equal(s.context.orderReview.usesScene, false);
  assert.equal(s.confirmOrderReview(), true);
  assert.equal(s.context.activeOrder.current.status, 'served');
  assert.equal(s.context.activeOrder.current.usesScene, false);
  assert.equal(s.events.filter(event => event === 'submit').length, 1);
}
{
  const s = scenario(); s.context.drafts = []; s.context.shawarmaQuantity = 0; s.context.quantities = { water: 2 };
  s.startOrder(false); untouched(s);
  assert.equal(s.context.orderReview.order.shawarmas.length, 0);
  assert.equal(s.context.orderReview.order.extras[0].quantity, 2);
  assert.equal(s.confirmOrderReview(), true);
  assert.equal(s.context.activeOrder.current.status, 'serving');
  assert.equal(s.context.activeOrder.current.snapshot.withShawarma, false);
}
{
  const s = scenario(); s.startOrder(true);
  assert.equal(s.confirmOrderReview('online_card'), false, 'Unavailable real online payment cannot start preparation');
  untouched(s);
  assert(s.context.orderReview.notice.includes('Онлайн-оплата пока не подключена'));
  assert.equal(s.confirmOrderReview('cashier'), true);
}
{
  const s = scenario(); s.context.staticDemo = true; s.context.kitchenEnabled = false;
  s.startOrder(true);
  assert.equal(s.confirmOrderReview('online_card'), true, 'Demo can preview online selection without charging');
  assert.equal(s.context.activeOrder.current.snapshot.paymentMethod, 'online_card');
  assert(!s.events.includes('reserve'));
}
for (const mutate of [
  s => { s.context.pricing.basePriceKopecks += 100; },
  s => { s.context.drafts[0].batches.pop(); },
  s => { s.context.grill = false; },
  s => { s.context.drafts[0].strictOrder = true; },
  s => { s.context.activeScene.current.mode = 'fallback'; },
]) {
  const s = scenario(); s.startOrder(true);
  const reviewed = s.context.orderReview;
  mutate(s);
  assert.equal(s.confirmOrderReview(), false, 'Changed price/composition/grill/order/mode needs another review');
  untouched(s);
  assert(s.context.orderReview.notice);
  assert.notEqual(s.context.orderReview.fingerprint, reviewed.fingerprint);
  assert.equal(s.confirmOrderReview(), true);
  assert.equal(s.context.nextOrder.current, 1);
}
for (const mutate of [
  s => { s.context.kitchenChecked = false; },
  s => { s.context.drafts[0].batches = []; },
  s => { s.context.availableIngredientIds = []; },
  s => { s.context.quantities.water = 1; s.context.extrasMenu.find(item => item.id === 'water').available = false; },
]) {
  const s = scenario(); mutate(s);
  assert.equal(s.startOrder(true), false);
  assert.equal(s.context.orderReview, undefined, 'Invalid orders do not show a confirmation');
  assert.equal(s.context.nextOrder.current, 0);
  assert(!s.events.includes('reserve') && !s.events.includes('submit') && !s.events.includes('scene'));
}
{
  const s = scenario(); s.startOrder(true); s.context.availableIngredientIds = [];
  assert.equal(s.confirmOrderReview(), false, 'Availability is rechecked on confirmation');
  assert.equal(s.context.orderReview, undefined);
  assert.equal(s.context.nextOrder.current, 0);
  assert(!s.events.includes('reserve'));
}

// Check the actual kitchen submission boundary also carries the reviewed method.
{
  const s = scenario(); s.startOrder(true); s.confirmOrderReview('cashier');
  let sent;
  Object.assign(s.context, {
    kitchenWrite: (method, body) => ({ method, body }),
    kitchenRequest: async (path, request) => { sent = { path, ...request }; return { id: 12, status: 'accepted' }; },
    clearKitchenRequest() {}, setRememberedTicket() {}, rememberKitchenTicket() {},
  });
  const compiled = ts.transpileModule(declaration('submitKitchenOrder'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const submit = new Function('context', `with(context){${compiled};return submitKitchenOrder}`)(s.context);
  await submit();
  assert.equal(sent.path, '/orders');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.body.paymentMethod, 'cashier');
  assert.equal(s.context.activeOrder.current.kitchen.state, 'sent');
}

// Exercise the actual native-dialog component's lifecycle and event callbacks.
const componentText = readFileSync(new URL('../src/OrderConfirmation.tsx', import.meta.url), 'utf8');
const componentAST = ts.createSourceFile('OrderConfirmation.tsx', componentText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const componentCode = ts.transpileModule(declaration('OrderConfirmation', componentAST).replace('export default ', ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/^import[^\n]*react\/jsx-runtime[^\n]*\n/g, '');
function dialogScenario(confirmResult = true, withAnimation = true) {
  const effects = [], calls = [];
  class Element { isConnected = true; focus() { calls.push('triggerFocus'); } }
  const trigger = new Element();
  const element = { open: false, showModal() { this.open = true; calls.push('showModal'); }, close() { this.open = false; calls.push('close'); } };
  const jsx = (type, props) => ({ type, props });
  const context = {
    useRef: initial => ({ current: initial }), useId: () => 'dialog-id', useState: initial => [initial, () => {}], paymentOptions,
    useEffect: effect => effects.push(effect), document: { activeElement: trigger }, HTMLElement: Element,
    _jsx: jsx, _jsxs: jsx, _Fragment: 'fragment', OrderSummary: 'OrderSummary', X: 'X',
  };
  const Component = new Function('context', `with(context){${componentCode};return OrderConfirmation}`)(context);
  const tree = Component({ order: { shawarmas: [{}] }, grill: true, withAnimation, demo: false, onCancel() { calls.push('cancel'); }, onConfirm() { calls.push('confirm'); return confirmResult; } });
  const nodes = [];
  function visit(node) { if (!node) return; if (Array.isArray(node)) return node.forEach(visit); if (typeof node !== 'object') return; nodes.push(node); visit(node.props?.children); }
  visit(tree);
  tree.props.ref.current = element;
  nodes.find(node => node.props?.className === 'sc-confirm-order-back').props.ref.current = { focus() { calls.push('cancelFocus'); } };
  const cleanup = effects[0]();
  return { tree, nodes, calls, cleanup };
}
{
  const s = dialogScenario();
  assert.equal(s.tree.type, 'dialog');
  assert.deepEqual(s.calls, ['showModal', 'cancelFocus'], 'Use native focus trapping and initially focus cancel');
  assert(s.tree.props['aria-labelledby'] && s.tree.props['aria-describedby']);
  assert.equal(s.nodes.find(node => node.props?.className === 'sc-confirm-order-warning').props.children, 'После подтверждения изменить состав заказа будет нельзя.');
  const summary = s.nodes.find(node => node.type === 'OrderSummary');
  assert.equal(summary.props.onEdit, undefined, 'Reviewed summary has no editing controls');
  const submit = s.nodes.find(node => node.props?.className === 'sc-confirm-order-submit');
  assert.equal(submit.props.children, 'Подтвердить и готовить');
  submit.props.onClick(); submit.props.onClick();
  assert.equal(s.calls.filter(call => call === 'confirm').length, 1);
  let prevented = false; s.tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert(prevented && s.calls.includes('cancel'), 'Escape cancels without submitting');
  s.cleanup(); assert.deepEqual(s.calls.slice(-2), ['close', 'triggerFocus']);
}
{
  const s = dialogScenario(false, false);
  const submit = s.nodes.find(node => node.props?.className === 'sc-confirm-order-submit');
  assert.equal(submit.props.children, 'Подтвердить заказ');
  submit.props.onClick(); submit.props.onClick();
  assert.equal(s.calls.filter(call => call === 'confirm').length, 2, 'A refreshed review can be confirmed again');
  s.nodes.find(node => node.props?.className === 'sc-confirm-order-close').props.onClick();
  assert(s.calls.includes('cancel')); s.cleanup();
}
console.log('PASS order confirmation: actual checkout handlers gate every mode, cancel preserves editing/numbers, confirmation revalidates price/composition/grill/availability, live/demo payment selection and double-submit guard; native-dialog focus, Escape, close and read-only review verified.');
