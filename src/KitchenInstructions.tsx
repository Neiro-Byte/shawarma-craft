import { useState } from 'react';
import type { PricedOrder, PricedShawarma } from './pricing';

function KitchenSteps({ recipe, index, grill }: { recipe: PricedShawarma; index: number; grill: boolean }) {
  const [completed, setCompleted] = useState(0);

  return <fieldset className="kitchen-steps">
    <legend>Шаурма {index + 1} · {recipe.title}</legend>
    <ol>
      {recipe.ingredients.map(({ id, name }, step) => (
        <li key={id}>
          <label>
            <input type="checkbox" checked={step < completed}
              disabled={step !== completed && step !== completed - 1}
              onChange={event => setCompleted(step + Number(event.target.checked))}/>
            <span>{step + 1}. {name}</span>
          </label>
        </li>
      ))}
    </ol>
    <p role="status">{completed === recipe.ingredients.length
      ? (grill ? 'Начинка готова. Завернуть и поджарить на гриле.' : 'Начинка готова. Завернуть шаурму.')
      : `Добавлено ${completed} из ${recipe.ingredients.length}`}</p>
  </fieldset>;
}

export default function KitchenInstructions({ order, grill }: { order: PricedOrder; grill: boolean }) {
  if (!order.shawarmas.some(recipe => recipe.strictOrder)) return null;

  return <section id="kitchen-instructions" className="sc-order-summary kitchen-instructions" aria-labelledby="kitchen-instructions-title">
    <h2 id="kitchen-instructions-title">Порядок для кухни</h2>
    <p>Добавляйте начинку в лаваш по шагам. Отмечайте каждый ингредиент после добавления.</p>
    <div className="sc-order-summary-cards">
      {order.shawarmas.map((recipe, index) => recipe.strictOrder &&
        <KitchenSteps key={index} index={index} recipe={recipe} grill={grill}/>)}
    </div>
  </section>;
}
