import { useEffect, useRef, useState } from 'react';
import type { CatalogSettings } from './catalogSettings';
import { classicIds } from './data';
import { defaultPricing, DEMO_PRICE_NOTICE, parseRubles, rublesInput, validatePricingSettings, type PricingSettings } from './pricing';
import './priceSettings.css';

export type PriceSettingsPanelProps = {
  pricing: PricingSettings;
  catalog: Pick<CatalogSettings, 'ingredients' | 'extras'>;
  onSave: (pricing: PricingSettings) => string | null | Promise<string | null>;
  onClose: () => void;
};
function fields(pricing: PricingSettings) {
  return {
    base: rublesInput(pricing.basePriceKopecks),
    ingredients: Object.fromEntries(Object.entries(pricing.ingredientSurcharges).map(([id, price]) => [id, rublesInput(price)])),
    extras: Object.fromEntries(Object.entries(pricing.extraPrices).map(([id, price]) => [id, rublesInput(price)])),
  };
}
function PriceField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="sc-prices-field"><span>{label}</span>
    <input type="text" inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} autoComplete="off"/>
    <span aria-hidden="true">₽</span>
  </label>;
}
export default function PriceSettingsPanel({ pricing, catalog, onSave, onClose }: PriceSettingsPanelProps) {
  const [draft, setDraft] = useState(() => fields(pricing));
  const [baseline, setBaseline] = useState(() => JSON.stringify(fields(pricing)));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<'reset' | 'close'>();
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(update: (value: typeof draft) => typeof draft) {
    setDraft(update);
    setError('');
    setMessage('');
  }
  async function save() {
    const candidate = {
      version: 1,
      basePriceKopecks: parseRubles(draft.base),
      ingredientSurcharges: Object.fromEntries(Object.entries(draft.ingredients).map(([id, value]) => [id, parseRubles(value)])),
      extraPrices: Object.fromEntries(Object.entries(draft.extras).map(([id, value]) => [id, parseRubles(value)])),
    };
    const checked = validatePricingSettings(candidate);
    if (!checked.ok) { setError(checked.error + ' В рублях допускается до двух знаков после запятой.'); return; }
    try {
      const failure = await onSave(checked.pricing);
      if (failure) { setError(failure); return; }
      const saved = fields(checked.pricing);
      setDraft(saved);
      setBaseline(JSON.stringify(saved));
      setError('');
      setMessage('Цены сохранены в этом браузере.');
    } catch { setError('Цены не сохранены. Черновик остаётся в открытой панели.'); }
  }
  return <section className="sc-prices" aria-label="Настройка демо-цен">
    <header className="sc-prices-header">
      <div><h1 ref={heading} tabIndex={-1}>Цены меню</h1><p>{DEMO_PRICE_NOTICE}</p>
        <p>Настройки этого браузера. Вводите цены в рублях.</p></div>
      <button type="button" onClick={() => dirty ? setConfirm('close') : onClose()}>Закрыть</button>
    </header>
    {confirm && <section className="sc-prices-confirm" aria-label="Подтверждение">
      <h2>{confirm === 'close' ? 'Закрыть без сохранения?' : 'Вернуть исходные демо-цены?'}</h2>
      <p>{confirm === 'close' ? 'Несохранённые цены будут потеряны.' : 'Черновик заменится исходными ценами. Для применения нажмите «Сохранить цены».'}</p>
      <div className="sc-prices-actions">
        <button type="button" autoFocus onClick={() => { setConfirm(undefined); heading.current?.focus(); }}>Отмена</button>
        <button type="button" onClick={() => {
          if (confirm === 'close') { onClose(); return; }
          change(() => fields(defaultPricing));
          setConfirm(undefined);
          heading.current?.focus();
        }}>{confirm === 'close' ? 'Закрыть без сохранения' : 'Вернуть исходные цены'}</button>
      </div>
    </section>}
    <div inert={!!confirm}>
      <fieldset><legend>Базовая цена шаурмы</legend>
        <PriceField label="Цена одной шаурмы" value={draft.base} onChange={base => change(current => ({ ...current, base }))}/>
        <p>Лаваш и классический состав входят в цену. Удаление базового ингредиента сохраняет базовую цену.</p>
        <p>Включены {catalog.ingredients.filter(item => classicIds.includes(item.id)).map(item => item.name).join(', ')}.</p>
      </fieldset>
      <fieldset><legend>Доплаты за ингредиенты</legend>
        <p>Каждый выбранный ингредиент сверх классического состава оплачивается один раз в каждой шаурме.</p>
        <div className="sc-prices-grid">{catalog.ingredients.filter(item => !classicIds.includes(item.id)).map(item => (
          <PriceField key={item.id} label={item.name} value={draft.ingredients[item.id]}
            onChange={value => change(current => ({ ...current, ingredients: { ...current.ingredients, [item.id]: value } }))}/>
        ))}</div>
      </fieldset>
      <fieldset><legend>Напитки и закуски · цена за штуку</legend>
        <div className="sc-prices-grid">{catalog.extras.map(item => (
          <PriceField key={item.id} label={item.title} value={draft.extras[item.id]}
            onChange={value => change(current => ({ ...current, extras: { ...current.extras, [item.id]: value } }))}/>
        ))}</div>
      </fieldset>
      <footer>
        {error && <p className="sc-prices-error" role="alert">{error}</p>}
        <p role="status">{message || (dirty ? 'Есть несохранённые изменения.' : 'Цены сохранены.')}</p>
        <div className="sc-prices-actions">
          <button className="sc-prices-save" type="button" disabled={!dirty} onClick={save}>Сохранить цены</button>
          <button type="button" onClick={() => setConfirm('reset')}>Сбросить демо-цены</button>
        </div>
      </footer>
    </div>
  </section>;
}
