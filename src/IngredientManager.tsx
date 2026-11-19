import { useEffect, useId, useRef, useState } from 'react';
import type { CatalogSettings } from './catalogSettings';
import { ingredients as coreIngredients } from './data';
import { isCustomIngredientId, type CoreIngredientId, type IngredientCategory, type IngredientId, type Item } from './domain';
import { ingredientFromLibrary, ingredientImageSource, ingredientLibrary, MAX_INGREDIENTS, uploadIngredientImage } from './ingredientLibrary';
import { formatMoney, parseRubles, rublesInput } from './pricing';
import './ingredientManager.css';

type MenuIngredient = CatalogSettings['ingredients'][number];
type IngredientManagerProps = {
  items: MenuIngredient[];
  onChange: (update: (current: CatalogSettings) => CatalogSettings) => void;
  onBusyChange: (busy: boolean) => void;
  onInvalidChange: (error: string) => void;
};
const categories: Record<IngredientCategory, string> = { protein: 'Мясо и белок', vegetable: 'Овощи', extra: 'Добавки', sauce: 'Соусы' };
const normalize = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
const validSurcharge = (value: string) => {
  const amount = parseRubles(value);
  return amount !== null && amount <= 10000000 ? amount : null;
};

function Picture({ item }: { item: Pick<Item, 'image' | 'emoji'> }) {
  const src = ingredientImageSource(item.image);
  const [broken, setBroken] = useState<string>();
  return <span className="sc-ingredient-picture" aria-hidden="true">
    {src && broken !== src ? <img src={src} alt="" width={72} height={72} loading="lazy" decoding="async" onError={() => setBroken(src)}/> : <span>{item.emoji}</span>}
  </span>;
}

export default function IngredientManager({ items, onChange, onBusyChange, onInvalidChange }: IngredientManagerProps) {
  const [selectedId, setSelectedId] = useState<IngredientId>(items[0].id);
  const [menuQuery, setMenuQuery] = useState('');
  const [menuCategory, setMenuCategory] = useState<IngredientCategory | 'all'>('all');
  const [menuLimit, setMenuLimit] = useState(24);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryCategory, setLibraryCategory] = useState<IngredientCategory | 'all'>('all');
  const [onlyNew, setOnlyNew] = useState(true);
  const [libraryLimit, setLibraryLimit] = useState(12);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const editor = useRef<HTMLFieldSetElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const focusNew = useRef(false);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const id = useId();
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  const custom = isCustomIngredientId(selected.id);
  const atLimit = items.length >= MAX_INGREDIENTS;
  const existing = new Set(items.map(item => item.id));
  const menuItems = items.filter(item => (menuCategory === 'all' || item.category === menuCategory) && normalize(item.name).includes(normalize(menuQuery)));
  const libraryItems = ingredientLibrary.filter(item => (!onlyNew || !existing.has(item.id)) &&
    (libraryCategory === 'all' || item.category === libraryCategory) && normalize(item.name).includes(normalize(libraryQuery)));
  const priceValue = priceInputs[selected.id] ?? rublesInput(selected.surchargeKopecks ?? 0);
  const invalidPrice = custom && validSurcharge(priceValue) === null;
  const invalidItem = items.find(item => isCustomIngredientId(item.id) && priceInputs[item.id] !== undefined && validSurcharge(priceInputs[item.id]) === null);
  const defaultImage = ingredientLibrary.find(item => item.id === selected.id)?.image ?? `library:${selected.visualId ?? 'tomato'}`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; busyCallback.current(false); };
  }, []);
  useEffect(() => {
    onInvalidChange(invalidItem ? `Проверьте доплату за «${invalidItem.name || 'Новый ингредиент'}». Введите от 0 до 100 000 рублей, до двух знаков после запятой.` : '');
  }, [invalidItem?.id, invalidItem?.name, onInvalidChange]);
  useEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    editor.current?.scrollIntoView({ block: 'nearest' });
    nameInput.current?.focus({ preventScroll: true });
  }, [selected.id]);

  function patch(id: IngredientId, update: Partial<MenuIngredient>) {
    onChange(current => ({ ...current, ingredients: current.ingredients.map(item => item.id === id ? { ...item, ...update } : item) }));
    setError('');
  }
  function choose(itemId: IngredientId) {
    focusNew.current = true;
    setSelectedId(itemId);
    setError('');
  }
  function reveal(itemId: IngredientId) {
    setMenuQuery(''); setMenuCategory('all'); setSelectedId(itemId); setLibraryOpen(false);
    focusNew.current = true;
  }
  function addLibrary(key: string) {
    const item = ingredientFromLibrary(key);
    if (!item || existing.has(item.id) || atLimit) return;
    onChange(current => current.ingredients.length >= MAX_INGREDIENTS || current.ingredients.some(value => value.id === item.id)
      ? current : { ...current, ingredients: [...current.ingredients, { ...item, available: true }] });
    reveal(item.id);
    setMessage(`«${item.name}» добавлен в черновик меню с подходящей картинкой. Сохраните изменения.`);
  }
  function addOwn() {
    if (atLimit) return;
    const ingredientId: IngredientId = `custom-${crypto.randomUUID()}`;
    const item: MenuIngredient = { id: ingredientId, name: 'Новый ингредиент', note: '', available: false,
      category: 'vegetable', emoji: '🥗', color: '#85a64d', visualId: 'tomato', image: 'library:tomato', surchargeKopecks: 0 };
    onChange(current => current.ingredients.length >= MAX_INGREDIENTS ? current : { ...current, ingredients: [...current.ingredients, item] });
    reveal(ingredientId);
    setMessage('Новый ингредиент добавлен в черновик. Укажите название, картинку, доплату и включите доступность.');
  }
  function changeCategory(category: IngredientCategory) {
    const previousVisual = coreIngredients.find(item => item.id === selected.visualId);
    const changeVisual = (category === 'sauce') !== (previousVisual?.category === 'sauce');
    patch(selected.id, { category, ...(changeVisual ? { visualId: category === 'sauce' ? 'white' : 'tomato' } : {}) });
  }
  async function upload(file: File) {
    if (uploading) return;
    const ingredientId = selected.id;
    setUploading(true); onBusyChange(true); setError('');
    try {
      const image = await uploadIngredientImage(file);
      if (!mounted.current) return;
      patch(ingredientId, { image });
      setMessage('Фото подготовлено для телефона. Нажмите «Сохранить изменения», чтобы применить его.');
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить фото. Попробуйте другое изображение.');
    } finally {
      if (mounted.current) { setUploading(false); onBusyChange(false); }
    }
  }

  return <div className="sc-ingredient-manager">
    <div className="sc-ingredient-manager-heading"><div><h2>Начинки и соусы</h2><p>{items.length} из {MAX_INGREDIENTS} позиций. Выберите продукт, чтобы изменить его карточку.</p></div>
      <div className="sc-admin-actions">
        <button type="button" disabled={atLimit || uploading} onClick={addOwn}>Добавить свой ингредиент</button>
        <button type="button" disabled={uploading} aria-expanded={libraryOpen} aria-controls={id + '-library'} onClick={() => setLibraryOpen(value => !value)}>Библиотека · {ingredientLibrary.length}</button>
      </div>
    </div>
    {atLimit && <p role="status">Достигнут лимит меню. Ненужные продукты можно скрыть переключателем доступности.</p>}
    {message && <p className="sc-ingredient-manager-status" role="status">{message}</p>}
    {error && <p className="sc-admin-error" role="alert">{error}</p>}
    {libraryOpen && <section id={id + '-library'} className="sc-ingredient-library" aria-label="Библиотека ингредиентов">
      <h3>Добавить из библиотеки</h3><p>Для каждой позиции уже подобрана картинка. После добавления её можно заменить своим фото.</p>
      <div className="sc-ingredient-filters">
        <label className="sc-admin-field"><span>Найти в библиотеке</span><input type="search" placeholder="Например, индейка или песто" value={libraryQuery} onChange={event => { setLibraryQuery(event.target.value); setLibraryLimit(12); }}/></label>
        <label className="sc-admin-field"><span>Категория библиотеки</span><select value={libraryCategory} onChange={event => { setLibraryCategory(event.target.value as IngredientCategory | 'all'); setLibraryLimit(12); }}>
          <option value="all">Все категории</option>{Object.entries(categories).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select></label>
      </div>
      <label className="sc-admin-check"><input type="checkbox" checked={onlyNew} onChange={event => { setOnlyNew(event.target.checked); setLibraryLimit(12); }}/>Только ещё не добавленные</label>
      <ul className="sc-ingredient-library-grid">{libraryItems.slice(0, libraryLimit).map(item => <li key={item.libraryKey}>
        <Picture item={item}/><strong>{item.name}</strong><small>{categories[item.category]}</small>
        <span>{isCustomIngredientId(item.id) ? `Доплата ${formatMoney(item.surchargeKopecks)}` : 'Цена в настройках меню'}</span>
        <button type="button" disabled={existing.has(item.id) || atLimit || uploading} onClick={() => addLibrary(item.libraryKey)} aria-label={existing.has(item.id) ? `${item.name} уже в меню` : `Добавить ${item.name}`}>{existing.has(item.id) ? 'Уже в меню' : 'Добавить'}</button>
      </li>)}</ul>
      {!libraryItems.length && <p>Ничего не найдено. Измените запрос или добавьте свой ингредиент.</p>}
      {libraryItems.length > libraryLimit && <button type="button" className="sc-ingredient-more" onClick={() => setLibraryLimit(value => value + 12)}>Показать ещё · осталось {libraryItems.length - libraryLimit}</button>}
    </section>}
    <div className="sc-ingredient-filters">
      <label className="sc-admin-field"><span>Найти в своём меню</span><input type="search" value={menuQuery} placeholder="Название продукта" onChange={event => { setMenuQuery(event.target.value); setMenuLimit(24); }}/></label>
      <label className="sc-admin-field"><span>Категория меню</span><select value={menuCategory} onChange={event => { setMenuCategory(event.target.value as IngredientCategory | 'all'); setMenuLimit(24); }}>
        <option value="all">Все категории</option>{Object.entries(categories).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
      </select></label>
    </div>
    <div className="sc-ingredient-menu-grid" aria-label="Ингредиенты текущего меню">{menuItems.slice(0, menuLimit).map(item => <button type="button" key={item.id} disabled={uploading} aria-pressed={selected.id === item.id} onClick={() => choose(item.id)}>
      <Picture item={item}/><strong>{item.name || 'Новый ингредиент'}</strong><small>{item.available ? 'В меню' : 'Скрыт'}</small>
    </button>)}</div>
    {!menuItems.length && <p>В меню нет совпадений. Измените поиск.</p>}
    {menuItems.length > menuLimit && <button type="button" className="sc-ingredient-more" onClick={() => setMenuLimit(value => value + 24)}>Показать ещё · осталось {menuItems.length - menuLimit}</button>}
    <fieldset ref={editor} className="sc-admin-card sc-ingredient-editor">
      <legend>{selected.emoji} {selected.name || 'Новый ингредиент'}</legend>
      <div className="sc-ingredient-editor-picture"><Picture item={selected}/><div>
        <label className="sc-admin-field"><span>{uploading ? 'Подготавливаем фото…' : 'Загрузить своё фото'}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file);
          }}/>
        </label>
        <button type="button" disabled={uploading || selected.image === defaultImage} onClick={() => patch(selected.id, { image: defaultImage })}>Вернуть картинку из библиотеки</button>
        <p>PNG, JPEG или WebP до 8 МБ. Фото автоматически уменьшается для мобильного меню.</p>
      </div></div>
      <div className="sc-ingredient-editor-fields">
        <label className="sc-admin-field"><span>Название</span><input ref={nameInput} type="text" maxLength={60} value={selected.name} onChange={event => patch(selected.id, { name: event.target.value })}/></label>
        <label className="sc-admin-field sc-ingredient-note"><span>Описание</span><textarea rows={2} maxLength={180} value={selected.note} onChange={event => patch(selected.id, { note: event.target.value })}/></label>
        {custom ? <>
          <label className="sc-admin-field"><span>Категория ингредиента</span><select value={selected.category} onChange={event => changeCategory(event.target.value as IngredientCategory)}>
            {Object.entries(categories).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select></label>
          <label className="sc-admin-field"><span>Значок</span><input type="text" maxLength={12} value={selected.emoji} onChange={event => patch(selected.id, { emoji: event.target.value })}/></label>
          <label className="sc-admin-field"><span>Внешний вид в 3D</span><select value={selected.visualId ?? 'tomato'} onChange={event => patch(selected.id, { visualId: event.target.value as CoreIngredientId })}>
            {coreIngredients.filter(item => (selected.category === 'sauce') === (item.category === 'sauce')).map(item => <option key={item.id} value={item.id}>Как {item.name.toLocaleLowerCase('ru')}</option>)}
          </select></label>
          <label className="sc-admin-field"><span>Цвет в 3D</span><input type="color" value={selected.color} onChange={event => patch(selected.id, { color: event.target.value })}/></label>
          <label className="sc-admin-field"><span>Доплата за порцию, ₽</span><input type="text" inputMode="decimal" autoComplete="off" value={priceValue} aria-invalid={invalidPrice} aria-describedby={id + '-price-help'} onChange={event => {
            const value = event.target.value; setPriceInputs(current => ({ ...current, [selected.id]: value }));
            const surchargeKopecks = validSurcharge(value); if (surchargeKopecks !== null) patch(selected.id, { surchargeKopecks });
          }}/><small id={id + '-price-help'}>{invalidPrice ? 'Введите от 0 до 100 000 рублей, до двух знаков после запятой.' : 'За одну порцию этого ингредиента в каждой шаурме. Например, 25,50.'}</small></label>
        </> : <p className="sc-ingredient-core-price">{categories[selected.category]}. Доплата за стандартный ингредиент меняется в разделе «Настройка цен» вверху панели.</p>}
      </div>
      <label className="sc-admin-check"><input type="checkbox" checked={selected.available} onChange={event => patch(selected.id, { available: event.target.checked })}/>Доступен покупателю в меню</label>
      <p className="sc-ingredient-editor-help">Картинка показывается в меню, выбранные вид и цвет — в 3D-кухне. Чтобы временно убрать продукт, отключите его доступность.</p>
    </fieldset>
  </div>;
}
