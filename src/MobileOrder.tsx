import { useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronUp, ShoppingBag } from 'lucide-react';
import IngredientOrder from './IngredientOrder';
import './mobileOrder.css';

type OrderStatus = 'editing' | 'preparing' | 'ready' | 'recovery';

type MobileOrderProps = {
  shawarmas: { title: string; filled: boolean; steps?: string[] }[];
  extras: { title: string; quantity: number }[];
  activeIndex: number;
  total?: string;
  status: OrderStatus;
  onEdit: (index: number) => void;
  onContinue: () => void;
  grill: boolean;
  liveKitchen: boolean;
  kitchenMessage?: string;
  onCheckout?: () => void;
  onQuickCheckout?: () => void;
};

const statusCopy: Record<OrderStatus, { message?: string; action: string }> = {
  editing: { action: 'К приготовлению' },
  preparing: { message: 'Заказ готовится', action: 'Смотреть приготовление' },
  ready: { message: 'Заказ готов', action: 'К итогу заказа' },
  recovery: { message: 'Нужно восстановить заказ', action: 'К восстановлению' },
};

export default function MobileOrder({
  shawarmas, extras, activeIndex, total, status, onEdit, onContinue, grill, liveKitchen, kitchenMessage, onCheckout, onQuickCheckout,
}: MobileOrderProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const extraCount = extras.reduce((sum, item) => sum + item.quantity, 0);
  const { action } = statusCopy[status];
  const message = kitchenMessage ?? statusCopy[status].message;

  function closePanel() {
    setExpanded(false);
    toggleRef.current?.focus({ preventScroll: true });
  }

  return (
    <aside
      className="sc-mobile-order"
      aria-label="Мой заказ"
      onKeyDown={event => {
        if (event.key !== 'Escape' || !expanded) return;
        event.preventDefault();
        closePanel();
      }}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
      }}
    >
      {expanded && <div className="sc-mobile-order-backdrop" aria-hidden="true" onClick={closePanel}/>}
      <div className="sc-mobile-order-sheet">
        <button
          type="button"
          className="sc-mobile-order-toggle"
          ref={toggleRef}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded(value => !value)}
        >
          <ShoppingBag size={19} aria-hidden="true"/>
          <span>
            <strong>Мой заказ</strong>
            <span>Шаурма {shawarmas.length} · Доп. {extraCount}</span>
          </span>
          {total&&<span className="sc-mobile-order-total">{total}</span>}
          <ChevronUp className="sc-mobile-order-chevron" size={20} aria-hidden="true"/>
        </button>
        <div id={panelId} className="sc-mobile-order-panel" hidden={!expanded}>
          <div className="sc-mobile-order-list">
            {message && <p className="sc-mobile-order-status" role="status">{message}</p>}
            {!shawarmas.length && !extraCount && <p>Заказ пока пуст.</p>}
            {!!shawarmas.length && (
              <ul aria-label="Шаурма">
                {shawarmas.map(({ title, filled, steps }, index) => (
                  <li key={index}>
                    <div>
                      <strong>Шаурма {index + 1}</strong>
                      {status === 'editing' && activeIndex === index && <span className="sc-mobile-order-current">Выбрана</span>}
                      <p>{filled ? title : 'Без начинки'}</p>
                      {!!steps?.length && <IngredientOrder names={steps}/>}
                    </div>
                    {status === 'editing' && (
                      <button
                        type="button"
                        className="sc-mobile-order-edit"
                        aria-label={`Изменить шаурму ${index + 1}`}
                        onClick={() => {
                          closePanel();
                          onEdit(index);
                        }}
                      >
                        Изменить
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {shawarmas.length>0&&<p className="sc-mobile-order-grill">{grill?'Поджарить на гриле':'Без гриля'}</p>}
            {extraCount > 0 && (
              <ul aria-label="Напитки и закуски">
                {extras.map(({ title, quantity }) => (
                  <li key={title}><span>{title}</span><span className="sc-mobile-order-quantity">{quantity} шт.</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="sc-mobile-order-actions">
            {onCheckout&&<p className="sc-mobile-order-demo">{liveKitchen?'Заказ на кухню · без оплаты':'Демо-заказ · без оплаты'}</p>}
            <button type="button" onClick={() => {
              closePanel();
              (onCheckout ?? onContinue)();
            }}>
              {onCheckout ? (onQuickCheckout ? 'Приготовить в 3D' : (liveKitchen?'Отправить на кухню':'Оформить демо-заказ')) : action}<ArrowUpRight size={17} aria-hidden="true"/>
            </button>
            {onQuickCheckout&&<button type="button" className="sc-mobile-order-quick" onClick={() => {
              closePanel();
              onQuickCheckout();
            }}>Оформить без 3D</button>}
          </div>
        </div>
      </div>
    </aside>
  );
}
