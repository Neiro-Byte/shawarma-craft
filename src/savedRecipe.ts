import { ingredients } from './data';
import { MAX_FILLINGS,isCustomIngredientId, type IngredientId } from './domain';

export const SAVED_RECIPE_KEY = 'shawarma-craft:favorite-recipe';
export const SAVED_RECIPE_VERSION = 1;
export const MAX_RECIPE_TITLE_LENGTH = 80;
export type SavedRecipe = { version: 1; title: string; ingredientIds: IngredientId[]; grill: boolean };
export type RecipeValidation = { ok: true; recipe: SavedRecipe } | { ok: false; message: string };
export type RecipeStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type SavedRecipeRead = { status: 'ready'; recipe: SavedRecipe } | { status: 'empty' } | { status: 'error'; message: string };
const knownIds = new Set<string>(ingredients.map(item => item.id));
const invalid = (message: string): RecipeValidation => ({ ok: false, message });

// Pure validation: returns a detached value and never changes the input.
export function validateSavedRecipe(value: unknown): RecipeValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Сохранённый рецепт повреждён. Сохрани рецепт заново.');
  const recipe = value as Record<string, unknown>;
  if (recipe.version !== SAVED_RECIPE_VERSION) return invalid('Версия сохранённого рецепта не поддерживается. Сохрани рецепт заново.');
  if (typeof recipe.title !== 'string' || !recipe.title.trim() || recipe.title.length > MAX_RECIPE_TITLE_LENGTH) return invalid('Название сохранённого рецепта некорректно. Сохрани рецепт заново.');
  if (typeof recipe.grill !== 'boolean') return invalid('Настройка гриля в сохранённом рецепте повреждена.');
  const ids = recipe.ingredientIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_FILLINGS) return invalid(`В сохранённом рецепте должно быть от 1 до ${MAX_FILLINGS} начинок.`);
  if (!Array.from(ids).every(id => typeof id === 'string' && (knownIds.has(id)||isCustomIngredientId(id)))) return invalid('В сохранённом рецепте есть неизвестные ингредиенты. Сохрани рецепт заново.');
  if (new Set(ids).size !== ids.length) return invalid('В сохранённом рецепте повторяются ингредиенты.');
  return { ok: true, recipe: { version: SAVED_RECIPE_VERSION, title: recipe.title.trim(), ingredientIds: [...ids] as IngredientId[], grill: recipe.grill } };
}

export function parseSavedRecipe(raw: string): RecipeValidation {
  try { return validateSavedRecipe(JSON.parse(raw)); }
  catch { return invalid('Сохранённый рецепт повреждён и не восстановлен. Сохрани рецепт заново.'); }
}

function getStorage(storage?: RecipeStorage | null): RecipeStorage {
  if (storage !== undefined) {
    if (!storage) throw new Error('Storage unavailable');
    return storage;
  }
  if (typeof window === 'undefined') throw new Error('Storage unavailable');
  return window.localStorage;
}

export function readSavedRecipe(storage?: RecipeStorage | null): SavedRecipeRead {
  try {
    const raw = getStorage(storage).getItem(SAVED_RECIPE_KEY);
    if (raw === null) return { status: 'empty' };
    const result = parseSavedRecipe(raw);
    return result.ok ? { status: 'ready', recipe: result.recipe } : { status: 'error', message: result.message };
  } catch {
    return { status: 'error', message: 'Не удалось прочитать рецепт: хранилище этого браузера недоступно.' };
  }
}

export function saveSavedRecipe(value: unknown, storage?: RecipeStorage | null): RecipeValidation {
  const result = validateSavedRecipe(value);
  if (!result.ok) return result;
  try {
    getStorage(storage).setItem(SAVED_RECIPE_KEY, JSON.stringify(result.recipe));
    return result;
  } catch {
    return invalid('Рецепт не сохранён: хранилище браузера недоступно или заполнено.');
  }
}
