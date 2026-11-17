import { useEffect, useState } from 'react';
import type { CatalogSettings } from './catalogSettings';
import { DEMO_PRICE_NOTICE, formatMoney, type PricingSettings } from './pricing';
import { LAST_ORDER_KEY, prepareRepeatOrder, readLastOrder, removeLastOrder, type LastOrderRead, type RepeatOrderDraft } from './lastOrder';
import IngredientOrder from './IngredientOrder';
import './lastOrder.css';

export type LastOrderPanelProps = {
  catalog: CatalogSettings;
  pricing: PricingSettings;
  disabled: boolean;
  refreshKey?: number;
  onRestore: (draft: RepeatOrderDraft) => string | null;
};
const readMessages = {
  empty: 'Завершённых заказов пока нет.',
  invalid: 'Сохранённый заказ повреждён. Его можно удалить.',
  unavailable: 'Хранилище последнего заказа недоступно.',
};
export default function LastOrderPanel({ catalog, pricing, disabled, refreshKey = 0, onRestore }: LastOrderPanelProps) {
  const [saved, setSaved] = useState<LastOrderRead>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => { setSaved(readLastOrder()); setMessage(''); setError(''); };
    refresh();
    const changed = (event: StorageEvent) => { if (event.key === LAST_ORDER_KEY || event.key === null) refresh(); };
    window.addEventListener('storage', changed);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', changed); window.removeEventListener('focus', refresh); };
  }, [refreshKey]);
  const prepared = saved?.status === 'ready' ? prepareRepeatOrder(saved.order, catalog, pricing) : undefined;
  function restore() {
    if (disabled) return;
    const current = readLastOrder();
    setSaved(current);
    setMessage('');
    setError('');
    if (current.status !== 'ready') return;
    const checked = prepareRepeatOrder(current.order, catalog, pricing);
    if (!checked.ok) { setError(checked.error); return; }
    try {
      const failure = onRestore(checked.draft);
      if (failure) { setError(failure); return; }
      setMessage('Весь заказ восстановлен в редакторе. Проверьте состав и текущую стоимость.');
    } catch { setError('Не удалось восстановить черновик. Сохранённый заказ остаётся доступен.'); }
  }
  return <section className="sc-last-order" aria-label="Последний заказ">
    <h2>Повторить последний заказ</h2>
    <p>Верните весь состав в редактор. Стоимость рассчитывается по текущим ценам.</p>
    {disabled&&<p role="status">Повтор доступен после возврата к редактированию заказа.</p>}
    {saved?.status === 'ready' && <>
      <ul className="sc-last-order-composition">
        {saved.order.shawarmas.map((recipe, index) => {
          const names = recipe.ingredientIds.map(id => catalog.ingredients.find(item => item.id === id)?.name ?? `Ингредиент ${id}`);
          return <li key={index}>
            <strong>Шаурма {index + 1}</strong>
            {recipe.strictOrder ? <IngredientOrder names={names}/> : <span>Лаваш, {names.join(', ')}</span>}
          </li>;
        })}
        {Object.entries(saved.order.extras).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => <li key={id}>
          <span>{catalog.extras.find(item => item.id === id)?.title ?? `Дополнение ${id}`}</span><strong>{quantity} шт.</strong>
        </li>)}
      </ul>
      <p>Гриль {saved.order.grill ? 'включён' : 'выключен'}.</p>
    </>}
    {prepared?.ok && <p className="sc-last-order-total">По текущим демо-ценам <strong>{formatMoney(prepared.price.totalKopecks)}</strong></p>}
    {prepared && !prepared.ok && <div className="sc-last-order-warning">
      <p>{prepared.error}</p>
      {!!prepared.issues.length && <ul>{prepared.issues.map((issue, index) => <li key={index}>
        {issue.shawarmaIndex !== undefined && `Шаурма ${issue.shawarmaIndex + 1} · `}{issue.label}
      </li>)}</ul>}
      <p>Проверьте наличие в настройках меню либо удалите сохранённый заказ и соберите новый.</p>
    </div>}
    {saved && saved.status !== 'ready' && <p role="status">{readMessages[saved.status]}</p>}
    <div className="sc-last-order-actions">
      <button type="button" className="sc-last-order-restore" disabled={disabled || !prepared?.ok} onClick={restore}>Восстановить весь заказ</button>
      {saved && saved.status !== 'empty' && <button type="button" disabled={disabled} onClick={() => {
        const result = removeLastOrder();
        if (!result.ok) { setError(result.error); return; }
        setSaved({ status: 'empty', order: null });
        setError('');
        setMessage('Сохранённый заказ удалён.');
      }}>Удалить сохранённый заказ</button>}
      {saved?.status === 'unavailable' && <button type="button" onClick={() => setSaved(readLastOrder())}>Проверить снова</button>}
    </div>
    {disabled && <p>Повтор доступен при редактировании нового заказа.</p>}
    {error && <p className="sc-last-order-warning" role="alert">{error}</p>}
    <p role="status">{message}</p>
    <small>{DEMO_PRICE_NOTICE}</small>
  </section>;
}
