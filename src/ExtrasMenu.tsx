import { useId, useState } from 'react';
import { extrasMenu, type ExtraCategory, type ExtraId, type ExtraMenuItem } from './extraMenuCatalog';
import './extrasMenu.css';
import {formatMoney} from './pricing';

function ExtraDrawing({id}:{id:ExtraId}) {
  const lightingId=useId();
  return <svg className="sc-extras-drawing" viewBox="0 0 180 130" aria-hidden="true" focusable="false">
    <ellipse cx="90" cy="113" rx="56" ry="8" fill="#71865b" opacity=".12"/>
    {id==='water' ? <g stroke="#658471" strokeWidth="2.5" strokeLinejoin="round">
      <rect x="75" y="12" width="30" height="13" rx="4" fill="#839a70"/>
      <path d="M77 25h26v15l10 14v48q0 10-10 10H77q-10 0-10-10V54l10-14z" fill="#dcebe2"/>
      <path d="M69 68h42v28q0 13-10 13H79q-10 0-10-13z" fill="#abcfc6" stroke="none"/>
      <rect x="68" y="57" width="44" height="27" rx="4" fill="#fff9e8"/>
      <path d="M90 62q-13 15 0 17 13-2 0-17z" fill="#8db5ac" stroke="none"/>
      <path d="M77 47v7m0 36v11" stroke="#fffdf2" strokeWidth="4" strokeLinecap="round"/>
    </g> : id==='ayran' ? <g stroke="#748967" strokeWidth="2.5" strokeLinejoin="round">
      <path d="M59 42h62l-8 64q-23 11-46 0z" fill="#fdf9eb"/>
      <path d="M63 64h54l-3 29H66z" fill="#c5d6ad" stroke="none"/>
      <ellipse cx="90" cy="42" rx="33" ry="9" fill="#ecedd9"/>
      <path d="M101 37l8-25h15" fill="none" stroke="#b68a61" strokeWidth="5" strokeLinecap="round"/>
      <path d="M80 78q10-15 20 0-10 15-20 0" fill="#7c9565" stroke="none"/>
    </g> : id==='cranberry'||id==='blackcurrant' ? <g stroke="#796955" strokeWidth="2.5" strokeLinejoin="round">
      <rect x="76" y="13" width="28" height="13" rx="3" fill="#8b9b71"/>
      <path d="M77 26h26v15q14 6 14 20v40q0 11-12 11H75q-12 0-12-11V61q0-14 14-20z" fill={id==='cranberry'?'#cb7668':'#91809f'}/>
      <rect x="64" y="59" width="52" height="33" rx="4" fill="#fff7e4" stroke="none"/>
      <path d="M78 45q-7 5-7 13" fill="none" stroke="#fff7e4" strokeWidth="4" strokeLinecap="round" opacity=".7"/>
      <g fill={id==='cranberry'?'#b85d50':'#756187'} stroke="none"><circle cx="84" cy="78" r="6"/><circle cx="96" cy="79" r="6"/><circle cx="91" cy="69" r="6"/></g>
      <path d="M91 65q7-12 15-5-7 7-15 5" fill="#829967" stroke="none"/>
    </g> : <g>
      <ellipse cx="90" cy="100" rx="63" ry="17" fill="#fff9e7" stroke="#c5cbaa" strokeWidth="2.5"/>
      {id==='fries' ? <g stroke="#b58a42" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M48 60Q90 42 132 60l-12 48H60z" fill="#a63828" stroke="#8f3225"/>
        {[[-27,-13,-14],[-12,-23,-5],[4,-20,8],[18,-12,18],[-4,-5,-12],[30,-2,22]].map(([x,y,r],i)=><g key={i} transform={`rotate(${r} ${90+x} 80)`}>
          <rect x={84+x} y={45+y} width="12" height="61" rx="3" fill={i%2?'#e9b64c':'#f8ce69'}/>
          <path d={`M${87+x} ${49+y}v26`} stroke="#ffe59c" strokeWidth="2" strokeLinecap="round"/>
        </g>)}
        <path d="M48 60l12 50h60l12-50Q90 87 48 60z" fill="#c94e35" stroke="#a63828" strokeWidth="2.5"/>
        <path d="M54 67q36 20 72 0M80 92l20-3" fill="none" stroke="#ffe9b9" strokeWidth="3" strokeLinecap="round"/>
      </g> : id==='bites' ? <g strokeLinejoin="round">
        <defs>
          <linearGradient id={lightingId} x2=".74" y2="1">
            <stop stopColor="#f9ce83"/><stop offset=".58" stopColor="#df943e"/><stop offset="1" stopColor="#a95b27"/>
          </linearGradient>
        </defs>
        <g fill={`url(#${lightingId})`} stroke="#9e562b" strokeWidth="1.8">
          <path d="M67 60l4-10 8-4 4-6 10-1 6 4 8-1 8 8-2 9 3 7-7 10-13 4-8-3-11 1-8-9z"/>
          <path d="M102 80l3-10 8-2 6-6 9 2 3 5 8 2 5 8-2 11-6 8-9 1-6 4-11-3-4-6-5-4z"/>
          <path d="M43 79l7-4 4-7 11-3 9 4 9-1 7 5 2 7 8 5-2 11-8 7-12 3-7-4-11 2-7-6-8-2-4-7z"/>
        </g>
        <path d="M75 56l5-3 4 2m5-9 4 2m8 5 4 2m-25 9 3 2m32 10 5-2 3 2m7 1 5 2m-17 8 3 3M52 83l5-3 4 1m4-9 4 3m9 1 5 2m-23 13 4 3m13-7 4 2m6 8 5-4" fill="none" stroke="#ffe1a2" strokeWidth="2.2" strokeLinecap="round" opacity=".85"/>
        <path d="M93 66l2 1m5-8 2 1m29 25 2 1m-12 10 2-1M52 91l2 2m19 3 2-1m7-11 2 1m7 2 2 2" stroke="#8f4924" strokeWidth="2.1" strokeLinecap="round"/>
      </g> : id==='cheeseBalls' ? <g>
        <defs>
          <radialGradient id={lightingId} cx=".32" cy=".26" r=".78">
            <stop stopColor="#ffdf8d"/><stop offset=".64" stopColor="#e9aa49"/><stop offset="1" stopColor="#b8722a"/>
          </radialGradient>
        </defs>
        <g fill={`url(#${lightingId})`} stroke="#ad6c30" strokeWidth="1.8">
          <circle cx="91" cy="60" r="20"/>
          <circle cx="122" cy="83" r="20"/>
          <circle cx="57" cy="82" r="20"/>
          <path d="M70 87c5-12 20-17 32-11 11 6 15 17 10 24-5 9-21 13-33 9-9-3-13-11-9-22z"/>
        </g>
        <path d="M79 85c6-7 16-8 25-3 6 4 8 9 5 14-4 6-17 7-25 4-8-3-10-9-5-15z" fill="#fff0b5" stroke="#d58b32" strokeWidth="1.6"/>
        <path d="M83 94c6 3 13 3 20-1m-19-5 6-2" fill="none" stroke="#f6c867" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M47 74q3-5 9-6m-11 13 2 2m14-8 2 1m0 10 3 1m15-34q4-5 9-5m3 9 2 2m6-6 2 2m10 18q4-4 9-4m-8 11 2 1m13-3 3 2m-6 10 3 1" fill="none" stroke="#fff1bd" strokeWidth="2.4" strokeLinecap="round"/>
      </g> : <g strokeLinejoin="round">
        <defs>
          <linearGradient id={lightingId} x2=".56" y2="1">
            <stop stopColor="#db8a52"/><stop offset=".54" stopColor="#a7502e"/><stop offset="1" stopColor="#692f23"/>
          </linearGradient>
        </defs>
        <g fill={`url(#${lightingId})`} stroke="#723821" strokeWidth="1.8">
          <path d="M43 69c-1-7 4-11 11-11 7-1 13-5 21-12 9-8 22-10 29-4 7 5 6 11 0 17l-9 7c-2 6-8 10-14 10-8 0-17 3-24 5-8 2-14-3-14-12z"/>
          <path d="M75 97c-4-5-1-10 4-13l15-8c5-3 8-10 12-15 6-8 19-12 28-6 10 5 12 17 6 25-6 8-15 11-26 12-11 1-18 6-26 10-5 3-10 1-13-5z"/>
        </g>
        <path d="M50 68c10 2 19-4 27-10l13-8m-31 24 12-4m9 21 18-9m11-12c5-7 13-9 20-6m-22 16 12-2m6 6 7-4" fill="none" stroke="#f5b37b" strokeWidth="2.7" strokeLinecap="round" opacity=".82"/>
        <path d="M80 64l4-3m9-4 3-2m-46 19 4 1m51 12 5-1m11-14 4-2m6 7 3-2" stroke="#6b3021" strokeWidth="2" strokeLinecap="round" opacity=".72"/>
      </g>}
    </g>}
  </svg>;
}

const MAX_QUANTITY = 20;
const categories = [
  { id: 'drink', title: 'Напитки' },
  { id: 'snack', title: 'Закуски' },
] as const;

type ExtrasMenuProps = {
  prices?: Partial<Record<ExtraId,number>>;
  items?: (ExtraMenuItem & {available?:boolean})[];
  quantities: Partial<Record<ExtraId, number>>;
  onChange: (id: ExtraId, delta: number) => void;
  disabled: boolean;
  onServe: () => void;
  quickOrder?: boolean;
};

export default function ExtrasMenu({ prices, items=extrasMenu, quantities, onChange, disabled, onServe, quickOrder = false }: ExtrasMenuProps) {
  const [category, setCategory] = useState<ExtraCategory>('drink');
  const total = items.reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);

  return <section id="extras" className="sc-extras" aria-label="Напитки и закуски">
    <div className="sc-extras-heading"><div><span className="sc-extras-eyebrow">ЕЩЁ НЕМНОГО ВКУСНОГО</span><h2>К шаурме — или просто так</h2><p>Напитки и закуски можно выбрать отдельно.</p></div><span className="sc-extras-demo">Демо-корзина: заказ не отправляется</span></div>
    <div className="sc-extras-tabs" role="group" aria-label="Категории дополнений">
      {categories.map(tab => (
        <button
          type="button"
          key={tab.id}
          aria-pressed={category === tab.id}
          className={category === tab.id ? 'sc-extras-tab sc-extras-tab-active' : 'sc-extras-tab'}
          disabled={disabled}
          onClick={() => setCategory(tab.id)}
        >
          {tab.title}
        </button>
      ))}
    </div>
    <div className="sc-extras-grid">
      {items.filter(item => item.category === category && (item.available!==false || (quantities[item.id]??0)>0)).map(item => {
        const count = quantities[item.id] ?? 0;

        return <article className={'sc-extras-card' + (count ? ' sc-extras-card-selected' : '')} key={item.id}>
          <div className="sc-extras-art"><ExtraDrawing id={item.id}/></div>
          <h3>{item.title}</h3>
          {prices?.[item.id]!==undefined&&<strong className="sc-extra-price">{formatMoney(prices[item.id]!)} · демо</strong>}
          <p>{item.note}</p>
          {item.available===false&&<p className="unavailable-item">Недоступно. Убери из заказа.</p>}
          {count > 0 ? (
            <div className="sc-extras-stepper" role="group" aria-label={`Количество: ${item.title}`}>
              <button type="button" disabled={disabled} onClick={() => onChange(item.id, -1)} aria-label={`Убрать одну позицию: ${item.title}`}>−</button>
              <span>{count}</span>
              <button type="button" disabled={disabled || item.available===false || count >= MAX_QUANTITY} onClick={() => onChange(item.id, 1)} aria-label={`Добавить ещё: ${item.title}`}>+</button>
            </div>
          ) : (
            <button type="button" className="sc-extras-add" disabled={disabled} onClick={() => onChange(item.id, 1)} aria-label={`Добавить: ${item.title}`}>
              Добавить <span aria-hidden="true">+</span>
            </button>
          )}
        </article>;
      })}
    </div>
    <div className="sc-extras-summary">
      <div role="status">
        <strong>Всего: {total} шт.</strong>
        {disabled && <p className="sc-extras-lock">Дополнения можно изменить при редактировании заказа.</p>}
      </div>
      {total > 0 && (
        <button type="button" className="sc-extras-serve" disabled={disabled} onClick={onServe}>
          {quickOrder ? 'Оформить только напитки и закуски' : 'Собрать напитки и закуски'}
        </button>
      )}
    </div>
    <p className="sc-extras-note">До {MAX_QUANTITY} шт. каждой позиции.</p>
  </section>;
}
