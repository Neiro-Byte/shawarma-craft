import { useEffect, useState } from 'react';
import type { IngredientId } from './domain';
import { readSavedRecipe, saveSavedRecipe, SAVED_RECIPE_VERSION, type SavedRecipeRead } from './savedRecipe';
import './savedRecipe.css';

export type SavedRecipePanelProps = {
  ingredientIds: IngredientId[];
  grill: boolean;
  title: string;
  disabled: boolean;
  onRestore: (ingredientIds: IngredientId[], grill: boolean) => void;
};

export default function SavedRecipePanel({ ingredientIds, grill, title, disabled, onRestore }: SavedRecipePanelProps) {
  const [saved, setSaved] = useState<SavedRecipeRead>({ status: 'empty' });
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  // Read after mounting, never while rendering; SSR and denied storage are safe.
  useEffect(() => {
    const result = readSavedRecipe();
    setSaved(result);
    setMessage(result.status === 'error' ? result.message : '');
    setLoaded(true);
  }, []);

  function save() {
    if (disabled || !ingredientIds.length) return;
    const result = saveSavedRecipe({ version: SAVED_RECIPE_VERSION, title, ingredientIds, grill });
    if (!result.ok) { setMessage(result.message); return; }
    setSaved({ status: 'ready', recipe: result.recipe });
    setMessage('Рецепт сохранён на этом устройстве.');
  }

  function restore() {
    if (disabled || !loaded) return;
    // Re-read before restoring: another tab may have replaced or damaged this key.
    const result = readSavedRecipe();
    setSaved(result);
    if (result.status === 'error') { setMessage(result.message); return; }
    if (result.status === 'empty') { setMessage('Сохранённого рецепта пока нет.'); return; }
    onRestore([...result.recipe.ingredientIds], result.recipe.grill);
    setMessage(`Рецепт «${result.recipe.title}» восстановлен.`);
  }

  return <section className="sc-saved-recipe" aria-label="Любимый рецепт">
    <div className="sc-saved-recipe-copy"><h2>Любимый рецепт</h2><p>Только на этом устройстве, без регистрации</p>
      {loaded && <span>{saved.status === 'ready' ? `Сохранён: ${saved.recipe.title}` : saved.status === 'empty' ? 'Можно сохранить один рецепт. Новый заменит предыдущий.' : 'Сохранённый рецепт недоступен.'}</span>}
    </div>
    <div className="sc-saved-recipe-actions">
      <button type="button" onClick={save} disabled={!loaded || disabled || !ingredientIds.length}>Сохранить рецепт</button>
      <button type="button" onClick={restore} disabled={!loaded || disabled || saved.status !== 'ready'}>Восстановить рецепт</button>
    </div>
    <p className="sc-saved-recipe-status" role="status" aria-live="polite">{message}</p>
  </section>;
}
