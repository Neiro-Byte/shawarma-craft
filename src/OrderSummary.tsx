import IngredientOrder from './IngredientOrder';
import { DEMO_PRICE_NOTICE, formatMoney, type PricedOrder } from './pricing';
import './orderSummary.css';

export type OrderSummaryProps = {
  order: PricedOrder;
  heading?: string;
  onEdit?: (index: number) => void;
};
export default function OrderSummary({ order, heading = 'Состав и стоимость', onEdit }: OrderSummaryProps) {
  return <section className="sc-order-summary" aria-label={heading}>
    <h2>{heading}</h2>
    <p className="sc-order-summary-notice">{DEMO_PRICE_NOTICE}</p>
    {!order.shawarmas.length && !order.extras.length && <p>Заказ пока пуст.</p>}
    <div className="sc-order-summary-cards">{order.shawarmas.map((recipe, index) => (
      <article className="sc-order-summary-card" key={index}>
        <h3>Шаурма {index + 1} · {recipe.title}</h3>
        {recipe.strictOrder ? <IngredientOrder names={recipe.ingredients.map(item => item.name)}/>
          : <p>Лаваш, {recipe.ingredients.map(item => item.name).join(', ')}</p>}
        <dl>
          <div><dt>Базовая цена</dt><dd>{formatMoney(recipe.basePriceKopecks)}</dd></div>
          {recipe.surcharges.map(item => <div key={item.id}><dt>Доплата · {item.name}</dt><dd>+{formatMoney(item.priceKopecks)}</dd></div>)}
          <div className="sc-order-summary-subtotal"><dt>За шаурму</dt><dd>{formatMoney(recipe.totalKopecks)}</dd></div>
        </dl>
        {onEdit && <button type="button" aria-label={`Изменить шаурму ${index + 1}`} onClick={() => onEdit(index)}>Изменить состав</button>}
      </article>
    ))}</div>
    {order.extras.length > 0 && <section className="sc-order-summary-extras" aria-label="Напитки и закуски">
      <h3>Напитки и закуски</h3>
      <ul>{order.extras.map(item => <li key={item.id}>
        <span>{item.title}<small>{item.quantity} шт. × {formatMoney(item.unitPriceKopecks)}</small></span>
        <strong>{formatMoney(item.totalKopecks)}</strong>
      </li>)}</ul>
    </section>}
    <div className="sc-order-summary-total"><span>Итого по демо-ценам</span><strong>{formatMoney(order.totalKopecks)}</strong></div>
  </section>;
}
