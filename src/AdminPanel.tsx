import { useEffect, useId, useRef, useState } from 'react';
import { defaultCatalog, validateCatalogSettings, type CatalogSettings } from './catalogSettings';
import { MAX_FILLINGS, type IngredientId } from './domain';
import './adminPanel.css';

type AdminPanelProps = {
  catalog: CatalogSettings;
  onSave: (catalog: CatalogSettings) => string | null | Promise<string | null>;
  onClose: () => void;
  onPrices?: () => void;
  onProductInfo?: () => void;
};
const tabs = [
  { id: 'ingredients', title: 'Начинки и соусы' },
  { id: 'extras', title: 'Напитки и закуски' },
  { id: 'recipes', title: 'Рецепты' },
  { id: 'settings', title: 'Оформление' },
] as const;
type Tab = typeof tabs[number]['id'];

function TextField({ label, value, onChange, multiline = false }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean;
}) {
  return <label className="sc-admin-field"><span>{label}</span>
    {multiline
      ? <textarea value={value} rows={2} onChange={event => onChange(event.target.value)}/>
      : <input type="text" value={value} onChange={event => onChange(event.target.value)}/>}
  </label>;
}

export default function AdminPanel({ catalog, onSave, onClose, onPrices, onProductInfo }: AdminPanelProps) {
  const [draft, setDraft] = useState(() => structuredClone(catalog));
  const [baseline, setBaseline] = useState(() => JSON.stringify(catalog));
  const [tab, setTab] = useState<Tab>('ingredients');
  const [confirmation, setConfirmation] = useState<'close' | 'reset'>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const tabId = useId();
  const dirty = JSON.stringify(draft) !== baseline;

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(update: (current: CatalogSettings) => CatalogSettings) {
    setDraft(update);
    setMessage('');
    setError('');
  }
  async function save() {
    const result = validateCatalogSettings(draft);
    if (!result.ok) { setError(result.error); setMessage(''); return; }
    try {
      const failure = await onSave(result.catalog);
      if (failure) { setError(failure); setMessage(''); return; }
      setDraft(structuredClone(result.catalog));
      setBaseline(JSON.stringify(result.catalog));
      setError('');
      setMessage('Изменения сохранены.');
    } catch {
      setError('Не удалось сохранить изменения. Черновик сохранён в открытой панели, попробуйте ещё раз.');
    }
  }
  function toggleIngredient(recipeId: string, ingredientId: IngredientId) {
    change(current => ({
      ...current,
      recipes: current.recipes.map(recipe => {
        if (recipe.id !== recipeId) return recipe;
        const selected = recipe.ingredientIds.includes(ingredientId);
        if (!selected && recipe.ingredientIds.length >= MAX_FILLINGS) return recipe;
        return { ...recipe, ingredientIds: selected
          ? recipe.ingredientIds.filter(id => id !== ingredientId)
          : [...recipe.ingredientIds, ingredientId] };
      }),
    }));
  }

  return <section className="sc-admin" aria-labelledby={tabId + '-heading'}>
    <header className="sc-admin-header" inert={!!confirmation}>
      <div><h1 id={tabId + '-heading'} ref={headingRef} tabIndex={-1}>Настройка меню</h1>
        <p>Настройки этого браузера. Изменения применяются после сохранения.</p></div>
      {onProductInfo&&<button type="button" disabled={dirty} title={dirty?'Сначала сохраните изменения меню':undefined} onClick={onProductInfo}>Аллергены и острота</button>}
      {onPrices&&<button type="button" disabled={dirty} title={dirty?'Сначала сохраните изменения меню':undefined} onClick={onPrices}>Настройка цен</button>}
      <button type="button" onClick={() => dirty ? setConfirmation('close') : onClose()}>Закрыть</button>
    </header>
    <div className="sc-admin-tabs" role="tablist" aria-label="Разделы настройки меню" inert={!!confirmation}>
      {tabs.map((item, index) => <button
        type="button" role="tab" key={item.id} id={tabId + '-' + item.id}
        ref={tab === item.id ? tabRef : undefined}
        aria-selected={tab === item.id} aria-controls={tabId + '-panel'}
        tabIndex={tab === item.id ? 0 : -1}
        onClick={() => setTab(item.id)}
        onKeyDown={event => {
          let next: number;
          switch (event.key) {
            case 'ArrowRight': next = (index + 1) % tabs.length; break;
            case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
            case 'Home': next = 0; break;
            case 'End': next = tabs.length - 1; break;
            default: return;
          }
          event.preventDefault();
          setTab(tabs[next].id);
          document.getElementById(tabId + '-' + tabs[next].id)?.focus();
        }}
      >{item.title}</button>)}
    </div>
    <div className="sc-admin-content" role="tabpanel" id={tabId + '-panel'} aria-labelledby={tabId + '-' + tab} inert={!!confirmation}>
      {tab === 'ingredients' && draft.ingredients.map(item => <fieldset className="sc-admin-card" key={item.id}>
        <legend>{item.emoji} {item.name || 'Ингредиент'}</legend>
        <TextField label="Название" value={item.name} onChange={name => change(current => ({
          ...current, ingredients: current.ingredients.map(value => value.id === item.id ? { ...value, name } : value),
        }))}/>
        <TextField label="Описание" multiline value={item.note} onChange={note => change(current => ({
          ...current, ingredients: current.ingredients.map(value => value.id === item.id ? { ...value, note } : value),
        }))}/>
        <label className="sc-admin-check"><input type="checkbox" checked={item.available} onChange={event => {
          const available = event.target.checked;
          change(current => ({ ...current, ingredients: current.ingredients.map(value => value.id === item.id ? { ...value, available } : value) }));
        }}/>Доступен в меню</label>
      </fieldset>)}
      {tab === 'extras' && draft.extras.map(item => <fieldset className="sc-admin-card" key={item.id}>
        <legend>{item.title || 'Дополнение'}</legend>
        <TextField label="Название" value={item.title} onChange={title => change(current => ({
          ...current, extras: current.extras.map(value => value.id === item.id ? { ...value, title } : value),
        }))}/>
        <TextField label="Описание" multiline value={item.note} onChange={note => change(current => ({
          ...current, extras: current.extras.map(value => value.id === item.id ? { ...value, note } : value),
        }))}/>
        <label className="sc-admin-check"><input type="checkbox" checked={item.available} onChange={event => {
          const available = event.target.checked;
          change(current => ({ ...current, extras: current.extras.map(value => value.id === item.id ? { ...value, available } : value) }));
        }}/>Доступно в меню</label>
      </fieldset>)}
      {tab === 'recipes' && <>
        <button type="button" className="sc-admin-new" disabled={draft.recipes.length >= 40} onClick={() => change(current => ({
          ...current,
          recipes: [...current.recipes, {
            id: 'custom-' + crypto.randomUUID(), title: 'Новый рецепт', emoji: '🌯',
            description: '', ingredientIds: [], sourceIds: [], kind: 'author', available: false,
          }],
        }))}>Добавить авторский рецепт</button>
        {draft.recipes.map(recipe => <fieldset className="sc-admin-card" key={recipe.id}>
          <legend>{recipe.emoji} {recipe.title || 'Рецепт'}</legend>
          <TextField label="Название рецепта" value={recipe.title} onChange={title => change(current => ({
            ...current, recipes: current.recipes.map(value => value.id === recipe.id ? { ...value, title } : value),
          }))}/>
          <TextField label="Описание рецепта" multiline value={recipe.description} onChange={description => change(current => ({
            ...current, recipes: current.recipes.map(value => value.id === recipe.id ? { ...value, description } : value),
          }))}/>
          <fieldset className="sc-admin-ingredients">
            <legend>Состав · {recipe.ingredientIds.length} из {MAX_FILLINGS}</legend>
            {draft.ingredients.map(item => {
              const selected = recipe.ingredientIds.includes(item.id);
              return <label key={item.id} className="sc-admin-check">
                <input type="checkbox" checked={selected}
                  disabled={!selected && recipe.ingredientIds.length >= MAX_FILLINGS}
                  onChange={() => toggleIngredient(recipe.id, item.id)}/>
                {item.name}{!item.available && <small>Недоступен в меню</small>}
              </label>;
            })}
          </fieldset>
          <label className="sc-admin-check"><input type="checkbox" checked={recipe.available} onChange={event => {
            const available = event.target.checked;
            change(current => ({ ...current, recipes: current.recipes.map(value => value.id === recipe.id ? { ...value, available } : value) }));
          }}/>Рецепт доступен в меню</label>
          {!defaultCatalog.recipes.some(value => value.id === recipe.id) && <button type="button" className="sc-admin-delete"
            onClick={() => change(current => ({ ...current, recipes: current.recipes.filter(value => value.id !== recipe.id) }))}>
            Удалить рецепт «{recipe.title || 'Новый рецепт'}»
          </button>}
        </fieldset>)}
      </>}
      {tab === 'settings' && <fieldset className="sc-admin-card">
        <legend>Оформление и приготовление</legend>
        <TextField label="Название" value={draft.settings.title} onChange={title => change(current => ({
          ...current, settings: { ...current.settings, title },
        }))}/>
        <TextField label="Слоган" value={draft.settings.slogan} onChange={slogan => change(current => ({
          ...current, settings: { ...current.settings, slogan },
        }))}/>
        <label className="sc-admin-check"><input type="checkbox" checked={draft.settings.grillDefault} onChange={event => {
          const grillDefault = event.target.checked;
          change(current => ({ ...current, settings: { ...current.settings, grillDefault } }));
        }}/>Включать гриль по умолчанию</label>
      </fieldset>}
    </div>
    <footer className="sc-admin-footer" inert={!!confirmation}>
      {error && <p className="sc-admin-error" role="alert">{error}</p>}
      <p role="status">{message || (dirty ? 'Есть несохранённые изменения.' : 'Все изменения сохранены.')}</p>
      <div className="sc-admin-actions">
        <button type="button" className="sc-admin-save" disabled={!dirty} onClick={save}>Сохранить изменения</button>
        <button type="button" onClick={() => setConfirmation('reset')}>Сбросить каталог</button>
      </div>
    </footer>
    {confirmation && <div className="sc-admin-confirm-backdrop">
      <div className="sc-admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby={tabId + '-confirm'}
        aria-describedby={tabId + '-confirm-description'}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setConfirmation(undefined); tabRef.current?.focus(); }
          if (event.key === 'Tab') {
            const buttons = event.currentTarget.querySelectorAll('button');
            const target = event.shiftKey ? buttons[buttons.length - 1] : buttons[0];
            const boundary = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
            if (document.activeElement === boundary) { event.preventDefault(); target?.focus(); }
          }
        }}>
        <h2 id={tabId + '-confirm'}>{confirmation === 'close' ? 'Закрыть без сохранения?' : 'Вернуть исходный каталог?'}</h2>
        <p id={tabId + '-confirm-description'}>{confirmation === 'close'
          ? 'Правки в этом черновике будут потеряны.'
          : 'Текущий черновик заменится исходным меню. Для применения нажмите «Сохранить изменения».'}</p>
        <div className="sc-admin-actions">
          <button type="button" autoFocus onClick={() => { setConfirmation(undefined); tabRef.current?.focus(); }}>Отмена</button>
          <button type="button" className="sc-admin-delete" onClick={() => {
            if (confirmation === 'close') { onClose(); return; }
            change(() => structuredClone(defaultCatalog));
            setConfirmation(undefined);
            headingRef.current?.focus();
          }}>{confirmation === 'close' ? 'Закрыть без сохранения' : 'Вернуть исходный каталог'}</button>
        </div>
      </div>
    </div>}
  </section>;
}
