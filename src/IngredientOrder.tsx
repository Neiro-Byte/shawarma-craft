export default function IngredientOrder({ names }: { names: readonly string[] }) {
  return <div className="ingredient-order">
    <strong>Порядок начинки</strong>
    <ol>{names.map((name, index) => <li key={index}>{name}</li>)}</ol>
  </div>;
}
