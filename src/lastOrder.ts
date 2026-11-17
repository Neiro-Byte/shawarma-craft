import { MAX_FILLINGS, type IngredientId } from './domain';
import type { ExtraId } from './extraMenuCatalog';
import type { CatalogSettings } from './catalogSettings';
import { MAX_EXTRA_QUANTITY, MAX_SHAWARMA_QUANTITY, type ExtraQuantities } from './orderDraft';
import { calculateOrderPrice, type PricedOrder, type PricingSettings } from './pricing';

export const LAST_ORDER_KEY = 'shawarma-craft:last-completed-order:v1';
// Unknown historical IDs remain readable so availability checks can explain every missing item.
export type LastOrder = {
  version: 1;
  shawarmas: { baseId: string | null; ingredientIds: string[]; strictOrder?: boolean }[];
  extras: Record<string, number>;
  grill: boolean;
};
export type RepeatOrderDraft = {
  shawarmas: { baseId: string | null; ingredientIds: IngredientId[]; strictOrder?: boolean }[];
  extras: ExtraQuantities;
  grill: boolean;
};
export type LastOrderRead =
  | { status: 'ready'; order: LastOrder }
  | { status: 'empty' | 'invalid' | 'unavailable'; order: null };
export type RepeatIssue = { kind: 'recipe' | 'ingredient' | 'extra'; id: string; label: string; shawarmaIndex?: number };
export type RepeatOrderResult =
  | { ok: true; draft: RepeatOrderDraft; price: PricedOrder }
  | { ok: false; error: string; issues: RepeatIssue[] };
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type WriteResult = { ok: true } | { ok: false; error: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[-a-zA-Z0-9_]{1,80}$/.test(value);
}
export function validateLastOrder(value: unknown): LastOrder | null {
  if (!record(value) || value.version !== 1 || typeof value.grill !== 'boolean' ||
    !Array.isArray(value.shawarmas) || value.shawarmas.length > MAX_SHAWARMA_QUANTITY || !record(value.extras)) return null;
  const shawarmas: LastOrder['shawarmas'] = [];
  for (const recipe of value.shawarmas) {
    if (!record(recipe) || (recipe.baseId !== null && !id(recipe.baseId)) ||
      (recipe.strictOrder !== undefined && typeof recipe.strictOrder !== 'boolean') ||
      !Array.isArray(recipe.ingredientIds) || !recipe.ingredientIds.length ||
      recipe.ingredientIds.length > MAX_FILLINGS || !recipe.ingredientIds.every(id) ||
      new Set(recipe.ingredientIds).size !== recipe.ingredientIds.length) return null;
    shawarmas.push({ baseId: recipe.baseId as string | null, ingredientIds: [...recipe.ingredientIds],
      ...(recipe.strictOrder ? { strictOrder: true } : {}) });
  }
  const entries = Object.entries(value.extras);
  if (entries.some(([key, count]) =>
    !id(key) || typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > MAX_EXTRA_QUANTITY)) return null;
  if (!shawarmas.length && !entries.some(([, count]) => (count as number) > 0)) return null;
  return { version: 1, shawarmas, extras: Object.fromEntries(entries) as Record<string, number>, grill: value.grill };
}
function storageFor(storage?: StorageAccess) {
  return storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
}
export function readLastOrder(storage?: StorageAccess): LastOrderRead {
  try {
    const target = storageFor(storage);
    if (!target) return { status: 'unavailable', order: null };
    const raw = target.getItem(LAST_ORDER_KEY);
    if (raw === null) return { status: 'empty', order: null };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { status: 'invalid', order: null }; }
    const order = validateLastOrder(value);
    return order ? { status: 'ready', order } : { status: 'invalid', order: null };
  } catch { return { status: 'unavailable', order: null }; }
}
export function saveCompletedOrder(completed: { status: 'served'; order: LastOrder }, storage?: StorageAccess): WriteResult {
  if (completed.status !== 'served') return { ok: false, error: 'Можно сохранить только завершённый заказ.' };
  const order = validateLastOrder(completed.order);
  if (!order) return { ok: false, error: 'Состав завершённого заказа повреждён.' };
  try {
    const target = storageFor(storage);
    if (!target) return { ok: false, error: 'Сохранение последнего заказа недоступно.' };
    target.setItem(LAST_ORDER_KEY, JSON.stringify(order));
    return { ok: true };
  } catch { return { ok: false, error: 'Последний заказ не сохранён. Хранилище браузера недоступно или заполнено.' }; }
}
export function removeLastOrder(storage?: StorageAccess): WriteResult {
  try {
    const target = storageFor(storage);
    if (!target) return { ok: false, error: 'Удаление последнего заказа недоступно.' };
    target.removeItem(LAST_ORDER_KEY);
    return { ok: true };
  } catch { return { ok: false, error: 'Не удалось удалить последний заказ из браузера.' }; }
}

export function prepareRepeatOrder(saved: LastOrder, catalog: CatalogSettings, pricing: PricingSettings): RepeatOrderResult {
  const order = validateLastOrder(saved);
  if (!order) return { ok: false, error: 'Состав сохранённого заказа повреждён.', issues: [] };
  const issues: RepeatIssue[] = [];
  for (const [shawarmaIndex, recipe] of order.shawarmas.entries()) {
    if (recipe.baseId !== null) {
      const preset = catalog.recipes.find(item => item.id === recipe.baseId);
      if (!preset?.available) issues.push({ kind: 'recipe', id: recipe.baseId,
        label: preset?.title ?? `Рецепт ${recipe.baseId}`, shawarmaIndex });
    }
    for (const ingredientId of recipe.ingredientIds) {
      const item = catalog.ingredients.find(item => item.id === ingredientId);
      if (!item?.available) issues.push({ kind: 'ingredient', id: ingredientId,
        label: item?.name ?? `Ингредиент ${ingredientId}`, shawarmaIndex });
    }
  }
  for (const [extraId, quantity] of Object.entries(order.extras)) {
    if (quantity === 0) continue;
    const item = catalog.extras.find(item => item.id === extraId);
    if (!item?.available) issues.push({ kind: 'extra', id: extraId, label: item?.title ?? `Дополнение ${extraId}` });
  }
  if (issues.length) return { ok: false, error: 'Повтор недоступен. Проверьте недоступные позиции в меню.', issues };
  const draft: RepeatOrderDraft = {
    shawarmas: order.shawarmas.map(recipe => ({ ...recipe, ingredientIds: [...recipe.ingredientIds] as IngredientId[] })),
    extras: Object.fromEntries(Object.entries(order.extras).filter(([, count]) => count > 0)) as ExtraQuantities,
    grill: order.grill,
  };
  const calculated = calculateOrderPrice({
    shawarmas: draft.shawarmas.map(recipe => ({
      title: catalog.recipes.find(item => item.id === recipe.baseId)?.title ?? 'Свой рецепт',
      ingredientIds: recipe.ingredientIds,
      strictOrder: recipe.strictOrder,
    })),
    extras: Object.entries(draft.extras).map(([extraId, quantity]) => ({ id: extraId as ExtraId, quantity: quantity! })),
  }, pricing, catalog);
  if (!calculated.ok) return { ok: false, error: calculated.error, issues: [] };
  return { ok: true, draft, price: calculated.order };
}
