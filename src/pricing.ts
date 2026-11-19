import { classicIds, ingredients } from './data';
import { MAX_FILLINGS,isCustomIngredientId,type CoreIngredientId, type IngredientId } from './domain';
import { extrasMenu, type ExtraId } from './extraMenuCatalog';
import type { CatalogSettings } from './catalogSettings';

export const PRICING_KEY = 'shawarma-craft:pricing:v1';
export const DEMO_PRICE_NOTICE = 'Демо-цены для примера. Стоимость заведения ещё не согласована.';
export type PricingSettings = {
  version: 1;
  basePriceKopecks: number;
  ingredientSurcharges: Record<CoreIngredientId, number>;
  extraPrices: Record<ExtraId, number>;
};
export type PricingResult = { ok: true; pricing: PricingSettings } | { ok: false; error: string };
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
type PriceCatalog = Pick<CatalogSettings, 'ingredients' | 'extras'>;
export type PriceOrderInput = {
  shawarmas: { title: string; ingredientIds: readonly IngredientId[]; strictOrder?: boolean }[];
  extras: { id: ExtraId; quantity: number }[];
};
export type PricedShawarma = {
  title: string;
  strictOrder?: boolean;
  ingredients: { id: IngredientId; name: string }[];
  basePriceKopecks: number;
  surcharges: { id: IngredientId; name: string; priceKopecks: number }[];
  totalKopecks: number;
};
export type PricedOrder = {
  shawarmas: PricedShawarma[];
  extras: { id: ExtraId; title: string; quantity: number; unitPriceKopecks: number; totalKopecks: number }[];
  totalKopecks: number;
};
export type OrderPriceResult = { ok: true; order: PricedOrder } | { ok: false; error: string };

const baseline = new Set<IngredientId>(classicIds);
const ingredientIds = ingredients.map(item => item.id);
const extraIds = extrasMenu.map(item => item.id);
export const defaultPricing: PricingSettings = {
  version: 1,
  basePriceKopecks: 25000,
  ingredientSurcharges: Object.fromEntries(ingredientIds.map(id => [
    id, baseline.has(id) ? 0 : id === 'beef' || id === 'falafel' ? 6000 : 3000,
  ])) as Record<CoreIngredientId, number>,
  extraPrices: { water: 7000, ayran: 10000, cranberry: 11000, blackcurrant: 11000,
    fries: 13000, bites: 18000, cheeseBalls: 16000, wings: 22000 },
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function money(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function validPrices(value: unknown, ids: readonly string[]) {
  return record(value) && Object.keys(value).length === ids.length &&
    ids.every(id => Object.hasOwn(value, id) && money(value[id]));
}
export function validatePricingSettings(value: unknown): PricingResult {
  if (!record(value) || value.version !== 1 || !money(value.basePriceKopecks)) {
    return { ok: false, error: 'Укажите базовую цену в целых неотрицательных копейках.' };
  }
  if (!validPrices(value.ingredientSurcharges, ingredientIds) || !validPrices(value.extraPrices, extraIds)) {
    return { ok: false, error: 'Проверьте цены всех известных ингредиентов, напитков и закусок.' };
  }
  const surcharges = value.ingredientSurcharges as Record<CoreIngredientId, number>;
  if (classicIds.some(id => surcharges[id] !== 0)) {
    return { ok: false, error: 'Ингредиенты классического состава уже входят в базовую цену.' };
  }
  return { ok: true, pricing: {
    version: 1, basePriceKopecks: value.basePriceKopecks,
    ingredientSurcharges: { ...surcharges },
    extraPrices: { ...value.extraPrices as Record<ExtraId, number> },
  } };
}

// Parse decimal rubles as digits so the stored value never depends on floating-point rounding.
export function parseRubles(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const kopecks = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return kopecks <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(kopecks) : null;
}
export function rublesInput(kopecks: number): string {
  if (!money(kopecks)) throw new RangeError('Некорректная сумма.');
  return (BigInt(kopecks) / 100n).toString() + ',' + (kopecks % 100).toString().padStart(2, '0');
}
export function formatMoney(kopecks: number): string {
  const [whole, fraction] = rublesInput(kopecks).split(',');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ',' + fraction + '\u00a0₽';
}
function storageFor(storage?: StorageAccess) {
  return storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
}
export function loadPricing(storage?: StorageAccess): {
  pricing: PricingSettings; status: 'ready' | 'empty' | 'invalid' | 'unavailable';
} {
  try {
    const target = storageFor(storage);
    if (!target) return { pricing: structuredClone(defaultPricing), status: 'unavailable' };
    const raw = target.getItem(PRICING_KEY);
    if (raw === null) return { pricing: structuredClone(defaultPricing), status: 'empty' };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { pricing: structuredClone(defaultPricing), status: 'invalid' }; }
    const result = validatePricingSettings(value);
    return result.ok ? { pricing: result.pricing, status: 'ready' }
      : { pricing: structuredClone(defaultPricing), status: 'invalid' };
  } catch { return { pricing: structuredClone(defaultPricing), status: 'unavailable' }; }
}
export function savePricing(pricing: PricingSettings, storage?: StorageAccess): PricingResult {
  const result = validatePricingSettings(pricing);
  if (!result.ok) return result;
  try {
    const target = storageFor(storage);
    if (!target) return { ok: false, error: 'Хранилище цен недоступно.' };
    target.setItem(PRICING_KEY, JSON.stringify(result.pricing));
    return result;
  } catch { return { ok: false, error: 'Цены не сохранены. Хранилище браузера недоступно или заполнено.' }; }
}

export function calculateOrderPrice(input: PriceOrderInput, pricing: PricingSettings, catalog: PriceCatalog): OrderPriceResult {
  const validated = validatePricingSettings(pricing);
  if (!validated.ok) return validated;
  const settings = validated.pricing;
  if (!Array.isArray(input.shawarmas) || input.shawarmas.length > 3 || !Array.isArray(input.extras)) {
    return { ok: false, error: 'В заказе может быть до трёх шаурм.' };
  }
  const shawarmas: PricedShawarma[] = [];
  for (const [index, recipe] of input.shawarmas.entries()) {
    const ids = recipe.ingredientIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_FILLINGS || new Set(ids).size !== ids.length) {
      return { ok: false, error: `Проверьте состав шаурмы ${index + 1}.` };
    }
    const composition: PricedShawarma['ingredients'] = [];
    const surcharges: PricedShawarma['surcharges'] = [];
    for (const id of ids as readonly IngredientId[]) {
      const item = catalog.ingredients.find(item => item.id === id);
      if (!item || (!ingredientIds.includes(id)&&!isCustomIngredientId(id))) return { ok: false, error: 'В составе найден неизвестный ингредиент.' };
      composition.push({ id, name: item.name });
      const surcharge=isCustomIngredientId(id)?item.surchargeKopecks:settings.ingredientSurcharges[id as CoreIngredientId];
      if(!money(surcharge))return {ok:false,error:'У ингредиента не задана корректная цена.'};
      if (!baseline.has(id) && surcharge > 0) {
        surcharges.push({ id, name: item.name, priceKopecks: surcharge });
      }
    }
    const totalKopecks = surcharges.reduce((sum, item) => sum + item.priceKopecks, settings.basePriceKopecks);
    if (!money(totalKopecks)) return { ok: false, error: 'Сумма шаурмы слишком велика для точного расчёта.' };
    shawarmas.push({ title: recipe.title, ingredients: composition, ...(recipe.strictOrder ? { strictOrder: true } : {}), basePriceKopecks: settings.basePriceKopecks, surcharges, totalKopecks });
  }
  const seen = new Set<ExtraId>();
  const extras: PricedOrder['extras'] = [];
  for (const extra of input.extras) {
    const item = catalog.extras.find(item => item.id === extra.id);
    if (!item || !extraIds.includes(extra.id) || seen.has(extra.id) ||
      !Number.isInteger(extra.quantity) || extra.quantity < 1 || extra.quantity > 20) {
      return { ok: false, error: 'Проверьте количество напитков и закусок (от 1 до 20 на позицию).' };
    }
    seen.add(extra.id);
    const unitPriceKopecks = settings.extraPrices[extra.id];
    const totalKopecks = unitPriceKopecks * extra.quantity;
    if (!money(totalKopecks)) return { ok: false, error: 'Сумма дополнения слишком велика для точного расчёта.' };
    extras.push({ id: extra.id, title: item.title, quantity: extra.quantity, unitPriceKopecks, totalKopecks });
  }
  const totalKopecks = [...shawarmas, ...extras].reduce((sum, item) => sum + item.totalKopecks, 0);
  if (!money(totalKopecks)) return { ok: false, error: 'Общая сумма слишком велика для точного расчёта.' };
  return { ok: true, order: { shawarmas, extras, totalKopecks } };
}
