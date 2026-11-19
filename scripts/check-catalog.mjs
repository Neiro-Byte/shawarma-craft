import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const domainText = readFileSync(new URL('src/domain.ts', root), 'utf8');
const ast = ts.createSourceFile('domain.ts', domainText, ts.ScriptTarget.Latest, true);
const idType = ast.statements.find(s => ts.isTypeAliasDeclaration(s) && s.name.text === 'CoreIngredientId');
assert(idType && ts.isUnionTypeNode(idType.type), 'IngredientId must be a literal union');
const expectedIds = idType.type.types.map(t => t.literal.text);
const loadTs = async path => {
  const source = readFileSync(new URL(path, root), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const { MAX_FILLINGS, isSauceId } = await loadTs('src/domain.ts');
const { ingredients, recipePresets, menuSources, classicIds, classicRecipe, classicSource, recipeToBatches } = await loadTs('src/data.ts');
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label}: duplicate`);
unique(ingredients.map(i => i.id), 'ingredients');
assert.equal(ingredients.length, 24);
assert.deepEqual(ingredients.map(i => i.id).sort(), [...expectedIds].sort());
for (const item of ingredients) {
  assert(['protein','vegetable','extra','sauce'].includes(item.category));
  assert.equal(item.category === 'sauce', isSauceId(item.id));
  for (const field of ['name','emoji','note']) assert(item[field].trim(), `${item.id}: ${field}`);
  assert.match(item.color, /^#[a-f\d]{6}$/i);
}
unique(menuSources.map(s => s.id), 'sources');
for (const source of menuSources) {
  assert.equal(new URL(source.url).protocol, 'https:');
  assert(['moscow','reference'].includes(source.scope));
  assert.match(source.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert(source.name && source.note);
}
unique(recipePresets.map(p => p.id), 'presets');
assert(recipePresets.length >= 7 && recipePresets.length <= 8);
function checkBatches(batches, ids) {
  assert.deepEqual(batches.map(b => b.id), ids);
  unique(batches.map(b => b.key), 'batch keys');
  batches.forEach((b, i) => {
    assert.equal(b.layer, i);
    assert.equal(b.key, -(i + 1));
    assert.equal(b.settled, true);
  });
}
for (const recipe of recipePresets) {
  unique(recipe.ingredientIds, recipe.id);
  unique(recipe.sourceIds, `${recipe.id} sources`);
  assert(recipe.ingredientIds.length > 0 && recipe.ingredientIds.length <= MAX_FILLINGS);
  assert(recipe.ingredientIds.every(id => expectedIds.includes(id)));
  assert(recipe.sourceIds.length > 0 && recipe.sourceIds.every(id => menuSources.some(s => s.id === id)));
  assert(['classic','author'].includes(recipe.kind));
  checkBatches(recipeToBatches(recipe), recipe.ingredientIds);
}
assert.deepEqual(classicIds, ['lettuce','chicken','tomato','cucumber','white']);
assert.deepEqual(recipePresets.find(p => p.kind === 'classic').ingredientIds, classicIds);
assert(menuSources.some(s => s.url === classicSource && s.scope === 'reference'));
checkBatches(classicRecipe(), classicIds);
assert.notEqual(classicRecipe()[0], classicRecipe()[0]);
console.log(`PASS: ${ingredients.length} ingredients, ${recipePresets.length} presets, ${menuSources.length} sources; domain coverage, categories, limits, references and settled negative-key batches verified.`);
