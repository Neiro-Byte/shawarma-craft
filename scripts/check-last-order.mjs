import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const modules = new Map();
function compile(name) {
  if (modules.has(name)) return modules.get(name);
  const input = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  const code = outputText.replace(/from ['"]\.\/([a-zA-Z]+)['"]/g, (_, dependency) => `from '${compile(dependency)}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  modules.set(name, url);
  return url;
}
const { validateLastOrder, readLastOrder, saveCompletedOrder, removeLastOrder, prepareRepeatOrder, LAST_ORDER_KEY } = await import(compile('lastOrder'));
const { defaultCatalog } = await import(compile('catalogSettings'));
const { defaultPricing } = await import(compile('pricing'));
const stored = {
  version: 1,
  shawarmas: [
    { baseId: 'classic', ingredientIds: ['chicken', 'cheese'] },
    { baseId: null, ingredientIds: ['falafel', 'tahini'] },
    { baseId: 'classic', ingredientIds: ['chicken'] },
  ],
  grill: false,
  extras: { water: 20, wings: 2, fries: 0 },
};
const contents = new Map([['shawarma-craft:order-draft:v1', 'draft'], ['shawarma-craft:pricing:v1', 'prices']]);
const storage = {
  getItem: key => contents.get(key) ?? null,
  setItem: (key, value) => contents.set(key, value),
  removeItem: key => contents.delete(key),
};
assert.equal(readLastOrder(storage).status, 'empty');
assert.equal(saveCompletedOrder({ status: 'served', order: stored }, storage).ok, true);
assert.deepEqual(readLastOrder(storage), { status: 'ready', order: stored });
const raw = contents.get(LAST_ORDER_KEY);
for (const status of ['editing', 'cooking', 'serving', 'recovery']) {
  assert.equal(saveCompletedOrder({ status, order: stored }, storage).ok, false);
  assert.equal(contents.get(LAST_ORDER_KEY), raw);
}
assert.equal(saveCompletedOrder({ status: 'served', order: { ...stored, totalKopecks: 12345, email: 'unused', user: 'unused' } }, storage).ok, true);
assert.equal(contents.get(LAST_ORDER_KEY), raw, 'Only whitelisted composition fields are persisted');

const prepared = prepareRepeatOrder(stored, defaultCatalog, defaultPricing);
assert.equal(prepared.ok, true);
assert.equal(prepared.draft.shawarmas.length, 3);
assert.deepEqual(prepared.draft.shawarmas[1].ingredientIds, ['falafel', 'tahini']);
assert.deepEqual(prepared.draft.extras, { water: 20, wings: 2 });
assert.equal(prepared.draft.grill, false);
const before = prepared.price.totalKopecks;
const changedPrices = structuredClone(defaultPricing);
changedPrices.basePriceKopecks += 100;
changedPrices.extraPrices.water += 1;
const repriced = prepareRepeatOrder(stored, defaultCatalog, changedPrices);
assert.equal(repriced.price.totalKopecks, before + 320);
prepared.draft.shawarmas[0].ingredientIds.pop();
assert.equal(stored.shawarmas[0].ingredientIds.length, 2);

const unavailable = structuredClone(defaultCatalog);
unavailable.ingredients.find(item => item.id === 'chicken').available = false;
unavailable.recipes.find(item => item.id === 'classic').available = false;
unavailable.extras.find(item => item.id === 'wings').available = false;
const blocked = prepareRepeatOrder(stored, unavailable, defaultPricing);
assert.equal(blocked.ok, false);
assert.equal(blocked.issues.length, 5, 'List affected recipe, ingredient and extra for every portion');
assert.ok(blocked.issues.some(issue => issue.kind === 'ingredient' && issue.shawarmaIndex === 2));
assert.equal('draft' in blocked, false);
assert.deepEqual(stored, JSON.parse(raw), 'Availability checks must not silently remove ingredients');

const missing = {
  ...stored,
  shawarmas: [{ baseId: 'deleted-preset', ingredientIds: ['historical-ingredient'] }],
  extras: { 'historical-extra': 1, 'zero-missing': 0 },
};
assert.ok(validateLastOrder(missing));
const missingResult = prepareRepeatOrder(missing, defaultCatalog, defaultPricing);
assert.equal(missingResult.ok, false);
assert.deepEqual(missingResult.issues.map(issue => issue.id), ['deleted-preset', 'historical-ingredient', 'historical-extra']);
const onlyExtras = { version: 1, shawarmas: [], extras: { water: 1 }, grill: true };
const extrasResult = prepareRepeatOrder(onlyExtras, defaultCatalog, defaultPricing);
assert.equal(extrasResult.ok, true);
assert.deepEqual(extrasResult.draft.shawarmas, []);
assert.equal(extrasResult.price.totalKopecks, defaultPricing.extraPrices.water);
assert.equal(prepareRepeatOrder(stored, defaultCatalog, { ...defaultPricing, basePriceKopecks: -1 }).ok, false);

for (const value of [
  null, { ...stored, version: 2 }, { ...stored, grill: 'true' },
  { ...stored, shawarmas: [] , extras: {water:0} },
  { ...stored, shawarmas: [...stored.shawarmas, stored.shawarmas[0]] },
  { ...stored, shawarmas: [{ baseId: null, ingredientIds: [] }] },
  { ...stored, shawarmas: [{ baseId: null, ingredientIds: ['chicken', 'chicken'] }] },
  { ...stored, shawarmas: [{ baseId: null, ingredientIds: Array.from({ length: 11 }, (_, i) => 'id-' + i) }] },
  { ...stored, shawarmas: [{ baseId: 'not valid', ingredientIds: ['chicken'] }] },
  ...[-1, 21, 1.1, Infinity, '2'].map(water => ({ ...stored, extras: { water } })),
]) {
  assert.equal(validateLastOrder(value), null);
  assert.equal(saveCompletedOrder({ status: 'served', order: value }, storage).ok, false);
  assert.equal(contents.get(LAST_ORDER_KEY), raw);
}
contents.set(LAST_ORDER_KEY, '{corrupt');
assert.equal(readLastOrder(storage).status, 'invalid');
contents.set(LAST_ORDER_KEY, JSON.stringify({ ...stored, version: 999 }));
assert.equal(readLastOrder(storage).status, 'invalid');
assert.equal(removeLastOrder(storage).ok, true);
assert.equal(readLastOrder(storage).status, 'empty');
assert.equal(contents.get('shawarma-craft:order-draft:v1'), 'draft');
assert.equal(contents.get('shawarma-craft:pricing:v1'), 'prices');
const denied = {
  getItem() { throw Error('denied'); },
  setItem() { throw Error('full'); },
  removeItem() { throw Error('denied'); },
};
assert.equal(readLastOrder(denied).status, 'unavailable');
assert.equal(saveCompletedOrder({ status: 'served', order: stored }, denied).ok, false);
assert.equal(removeLastOrder(denied).ok, false);
console.log('Last-order checks passed: completed-only storage, full restore, availability, current prices, limits, corruption and deletion.');

const ordered = {
  ...stored,
  shawarmas: [
    { baseId: 'classic', ingredientIds: ['cheese', 'chicken'], strictOrder: true },
    stored.shawarmas[1],
  ],
};
assert.equal(saveCompletedOrder({ status: 'served', order: ordered }, storage).ok, true);
const repeated = prepareRepeatOrder(readLastOrder(storage).order, defaultCatalog, defaultPricing);
assert.equal(repeated.ok, true);
assert.deepEqual(repeated.draft.shawarmas, ordered.shawarmas);
assert.deepEqual(repeated.price.shawarmas[0].ingredients.map(item => item.id), ['cheese', 'chicken']);
assert.equal(repeated.price.shawarmas[0].strictOrder, true);
assert.equal(repeated.price.shawarmas[1].strictOrder, undefined);
