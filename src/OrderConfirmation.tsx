import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import OrderSummary from './OrderSummary';
import type { PricedOrder } from './pricing';
import { paymentOptions, type PaymentMethod } from './payment';
import './orderConfirmation.css';

type OrderConfirmationProps = {
  order: PricedOrder;
  grill: boolean;
  withAnimation: boolean;
  notice?: string;
  demo: boolean;
  initialPaymentMethod?: PaymentMethod;
  onCancel: () => void;
  onConfirm: (method: PaymentMethod) => boolean;
};

export default function OrderConfirmation({ order, grill, withAnimation, notice, demo, initialPaymentMethod = 'cashier', onCancel, onConfirm }: OrderConfirmationProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirming = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialPaymentMethod);
  const paymentName = useId();
  const titleId = useId();
  const warningId = useId();

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    if (!element) return;
    element.showModal();
    cancel.current?.focus({ preventScroll: true });
    return () => {
      if (element.open) element.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  function confirm() {
    if (confirming.current) return;
    confirming.current = true;
    if (!onConfirm(paymentMethod)) confirming.current = false;
  }

  return <dialog ref={dialog} className="sc-confirm-order" aria-labelledby={titleId} aria-describedby={warningId}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <div className="sc-confirm-order-header">
      <h2 id={titleId}>Проверь свой заказ</h2>
      <button type="button" className="sc-confirm-order-close" onClick={onCancel} aria-label="Закрыть подтверждение заказа"><X size={20} aria-hidden="true"/></button>
    </div>
    <div className="sc-confirm-order-content">
      <p className="sc-confirm-order-warning" id={warningId}>После подтверждения изменить состав заказа будет нельзя.</p>
      {notice && <p className="sc-confirm-order-review" role="alert">{notice}</p>}
      <fieldset className="sc-confirm-order-payment">
        <legend>Способ оплаты</legend>
        {demo && <p className="sc-confirm-order-demo">Демо — деньги не списываются.</p>}
        {paymentOptions(demo).map(option => <label key={option.id} className={option.disabled ? 'is-disabled' : ''}>
          <input type="radio" name={paymentName} value={option.id} checked={paymentMethod === option.id} disabled={option.disabled}
            onChange={event => { if (event.target.checked) setPaymentMethod(option.id); }}/>
          <span><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span>
        </label>)}
      </fieldset>
      <OrderSummary order={order} heading="Ты заказываешь"/>
      {order.shawarmas.length > 0 && <p className="sc-confirm-order-grill"><strong>Гриль</strong><span>{grill ? 'Поджарить все шаурмы' : 'Без поджаривания'}</span></p>}

    </div>
    <div className="sc-confirm-order-actions">
      <button ref={cancel} type="button" className="sc-confirm-order-back" onClick={onCancel}>Вернуться к составу</button>
      <button type="button" className="sc-confirm-order-submit" onClick={confirm}>{withAnimation ? 'Подтвердить и готовить' : 'Подтвердить заказ'}</button>
    </div>
  </dialog>;
}
