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
  const code = outputText.replace(/from ['"]\.\/(data|domain|extraMenuCatalog)['"]/g, (_, dependency) => `from '${compile(dependency)}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  modules.set(name, url);
  return url;
}
const {
  defaultPricing, validatePricingSettings, calculateOrderPrice, parseRubles,
  formatMoney, rublesInput, loadPricing, savePricing, PRICING_KEY,
} = await import(compile('pricing'));
const { ingredients, classicIds } = await import(compile('data'));
const { extrasMenu } = await import(compile('extraMenuCatalog'));
const catalog = {
  ingredients: ingredients.map(item => ({ ...item, available: true })),
  extras: extrasMenu.map(item => ({ ...item, available: true })),
};
const order = (ids, extras = []) => ({ shawarmas: [{ title: 'Тест', ingredientIds: ids }], extras });
function priced(input, pricing = defaultPricing, menu = catalog) {
  const result = calculateOrderPrice(input, pricing, menu);
  assert.equal(result.ok, true, result.error);
  return result.order;
}

assert.equal(validatePricingSettings(defaultPricing).ok, true);
assert.equal(priced(order(classicIds)).totalKopecks, 25000);
assert.equal(priced(order(['chicken'])).totalKopecks, 25000, 'Removing base ingredients never discounts the base');
assert.equal(priced(order([...classicIds, 'cheese'])).totalKopecks, 28000);
const custom = structuredClone(defaultPricing);
custom.basePriceKopecks = 19999;
custom.ingredientSurcharges.cheese = 1;
custom.extraPrices.water = 10;
const mixed = priced({
  shawarmas: [
    { title: 'Одинаковое название', ingredientIds: ['chicken', 'cheese'] },
    { title: 'Одинаковое название', ingredientIds: ['tomato'] },
    { title: 'Третья', ingredientIds: ['beef', 'bbq'] },
  ],
  extras: [{ id: 'water', quantity: 20 }],
}, custom);
assert.equal(mixed.shawarmas[0].totalKopecks, 20000);
assert.equal(mixed.shawarmas[1].totalKopecks, 19999);
assert.deepEqual(mixed.shawarmas[0].ingredients.map(item => item.id), ['chicken', 'cheese']);
assert.deepEqual(mixed.shawarmas[1].ingredients.map(item => item.id), ['tomato']);
assert.equal(mixed.totalKopecks, 69198);
assert.equal(priced({ shawarmas: [], extras: [{ id: 'water', quantity: 2 }] }).totalKopecks, 14000);
assert.equal(priced({ shawarmas: [], extras: [] }).totalKopecks, 0);
const free = structuredClone(defaultPricing);
free.basePriceKopecks = 0;
free.extraPrices.water = 0;
assert.equal(priced(order(['chicken'], [{ id: 'water', quantity: 20 }]), free).totalKopecks, 0);
const renamed = structuredClone(catalog);
renamed.ingredients.find(item => item.id === 'cheese').name = 'Сыр из меню';
const named = priced(order(['cheese']), defaultPricing, renamed);
renamed.ingredients.find(item => item.id === 'cheese').name = 'Новое название';
assert.equal(named.shawarmas[0].ingredients[0].name, 'Сыр из меню', 'Calculated names form an independent snapshot');

for (const bad of [-1, .1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) {
  assert.equal(validatePricingSettings({ ...defaultPricing, basePriceKopecks: bad }).ok, false);
}
const broken = structuredClone(defaultPricing);
delete broken.extraPrices.water;
assert.equal(validatePricingSettings(broken).ok, false);
assert.equal(validatePricingSettings({ ...defaultPricing, version: 2 }).ok, false);
assert.equal(validatePricingSettings({ ...defaultPricing, ingredientSurcharges: { ...defaultPricing.ingredientSurcharges, chicken: 1 } }).ok, false);
assert.equal(validatePricingSettings({ ...defaultPricing, extraPrices: { ...defaultPricing.extraPrices, unknown: 0 } }).ok, false);
for (const input of [
  order([]), order(['chicken', 'chicken']), order(['unknown']),
  order(ingredients.slice(0, 11).map(item => item.id)),
  { shawarmas: Array.from({ length: 4 }, () => ({ title: 'Тест', ingredientIds: ['chicken'] })), extras: [] },
  order(classicIds, [{ id: 'water', quantity: 0 }]),
  order(classicIds, [{ id: 'water', quantity: 21 }]),
  order(classicIds, [{ id: 'water', quantity: 1.5 }]),
  order(classicIds, [{ id: 'water', quantity: 1 }, { id: 'water', quantity: 1 }]),
  order(classicIds, [{ id: 'unknown', quantity: 1 }]),
]) assert.equal(calculateOrderPrice(input, defaultPricing, catalog).ok, false);
const huge = structuredClone(defaultPricing);
huge.basePriceKopecks = Number.MAX_SAFE_INTEGER;
assert.equal(calculateOrderPrice(order(['cheese']), huge, catalog).ok, false);
assert.equal(calculateOrderPrice({ shawarmas: [], extras: [{ id: 'water', quantity: 20 }] },
  { ...defaultPricing, extraPrices: { ...defaultPricing.extraPrices, water: Number.MAX_SAFE_INTEGER } }, catalog).ok, false);
assert.equal(calculateOrderPrice({ shawarmas: [{ title: '1', ingredientIds: ['chicken'] }, { title: '2', ingredientIds: ['chicken'] }], extras: [] }, huge, catalog).ok, false);

for (const [text, expected] of [['0', 0], ['250,01', 25001], ['1.2', 120], [' 01,09 ', 109], ['90071992547409,91', Number.MAX_SAFE_INTEGER]]) {
  assert.equal(parseRubles(text), expected);
  assert.equal(parseRubles(rublesInput(expected)), expected);
}
for (const text of ['', '-1', '1,001', '1e3', 'Infinity', '1.', '1 000', '90071992547409,92']) assert.equal(parseRubles(text), null);
assert.equal(formatMoney(123456), '1\u00a0234,56\u00a0₽');

const contents = new Map([['shawarma-craft:catalog:v1', 'catalog'], ['shawarma-craft:order-draft:v1', 'draft']]);
const storage = { getItem: key => contents.get(key) ?? null, setItem: (key, value) => contents.set(key, value) };
assert.equal(loadPricing(storage).status, 'empty');
assert.equal(savePricing(custom, storage).ok, true);
assert.deepEqual(loadPricing(storage), { pricing: custom, status: 'ready' });
assert.equal(contents.get('shawarma-craft:catalog:v1'), 'catalog');
assert.equal(contents.get('shawarma-craft:order-draft:v1'), 'draft');
contents.set(PRICING_KEY, '{bad');
assert.equal(loadPricing(storage).status, 'invalid');
contents.set(PRICING_KEY, JSON.stringify({ ...custom, basePriceKopecks: -1 }));
assert.equal(loadPricing(storage).status, 'invalid');
const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } };
assert.equal(loadPricing(denied).status, 'unavailable');
assert.equal(savePricing(custom, denied).ok, false);
const fallback = loadPricing(denied).pricing;
fallback.extraPrices.water = 1;
assert.equal(defaultPricing.extraPrices.water, 7000);
console.log('Pricing checks passed: composition, kopecks, limits, overflow, formatting, snapshots and isolated storage.');
