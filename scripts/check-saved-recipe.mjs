import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const modules = new Map();
function compile(path) {
  if (modules.has(path)) return modules.get(path);
  let source = readFileSync(new URL(path, root), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  outputText = outputText.replace(/from ['"]\.\/(data|domain)['"]/g, (_, name) => `from '${compile(`src/${name}.ts`)}'`);
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  modules.set(path, url);
  return url;
}
const { validateSavedRecipe, parseSavedRecipe, readSavedRecipe, saveSavedRecipe, SAVED_RECIPE_KEY, MAX_RECIPE_TITLE_LENGTH } = await import(compile('src/savedRecipe.ts'));
const { MAX_FILLINGS } = await import(compile('src/domain.ts'));
const { ingredients } = await import(compile('src/data.ts'));
const sample = { version: 1, title: 'Мой рецепт', ingredientIds: ['chicken', 'white'], grill: true };
let checks = 0;
function rejects(value) { assert.equal(validateSavedRecipe(value).ok, false); checks++; }
assert.equal(validateSavedRecipe(sample).ok, true); checks++;
for (const value of [null, [], true, 'recipe', 5, {}, {...sample, version:2}, {...sample, version:'1'}, {...sample, version:undefined}, {...sample, title:''}, {...sample, title:'   '}, {...sample, title:5}, {...sample, title:'x'.repeat(MAX_RECIPE_TITLE_LENGTH + 1)}, {...sample, grill:1}, {...sample, grill:'false'}, {...sample, grill:undefined}, {...sample, ingredientIds:[]}, {...sample, ingredientIds:'chicken'}, {...sample, ingredientIds:['unknown']}, {...sample, ingredientIds:['__proto__']}, {...sample, ingredientIds:[null]}, {...sample, ingredientIds:[5]}, {...sample, ingredientIds:['chicken','chicken']}, {...sample, ingredientIds:new Array(1)}, {...sample, ingredientIds:ingredients.slice(0, MAX_FILLINGS + 1).map(i=>i.id)}]) rejects(value);
for (const raw of ['', '{', '{"version":1', 'undefined', 'null', '[]', '"text"']) { assert.equal(parseSavedRecipe(raw).ok, false); checks++; }
assert.equal(parseSavedRecipe(JSON.stringify(sample)).ok, true); checks++;
assert.equal(validateSavedRecipe({...sample, ingredientIds:['tahini'], grill:false, title:'x'.repeat(MAX_RECIPE_TITLE_LENGTH)}).ok, true); checks++;
assert.equal(validateSavedRecipe({...sample, ingredientIds:ingredients.slice(0,MAX_FILLINGS).map(i=>i.id)}).ok, true); checks++;
const detached = validateSavedRecipe(sample); assert(detached.ok);
detached.recipe.ingredientIds.push('beef'); assert.equal(sample.ingredientIds.length,2); checks++;
const values = new Map([['unrelated', 'preserve me']]); const accesses=[];
const storage = {
  getItem(key) { accesses.push(['get',key]); return values.get(key) ?? null; },
  setItem(key,value) { accesses.push(['set',key]); values.set(key,value); },
};
assert.deepEqual(readSavedRecipe(storage),{status:'empty'}); checks++;
assert.equal(saveSavedRecipe(sample,storage).ok,true); checks++;
assert.deepEqual(readSavedRecipe(storage),{status:'ready',recipe:sample}); checks++;
assert.equal(values.get('unrelated'),'preserve me');
assert(accesses.every(([,key])=>key===SAVED_RECIPE_KEY)); checks++;
const previous=values.get(SAVED_RECIPE_KEY);
assert.equal(saveSavedRecipe({...sample,ingredientIds:['unknown']},storage).ok,false);
assert.equal(values.get(SAVED_RECIPE_KEY),previous); checks++;
for (const raw of ['{',JSON.stringify({...sample,version:42}),JSON.stringify({...sample,ingredientIds:['future-id']})]) {
  values.set(SAVED_RECIPE_KEY,raw);
  assert.equal(readSavedRecipe(storage).status,'error');
  assert.equal(values.get(SAVED_RECIPE_KEY),raw); checks++;
}
for (const unavailable of [null, {getItem(){throw new Error('Denied')},setItem(){throw new Error('Quota')}}]) {
  assert.equal(readSavedRecipe(unavailable).status,'error');
  assert.equal(saveSavedRecipe(sample,unavailable).ok,false); checks++;
}
assert.equal(typeof window,'undefined');
assert.equal(readSavedRecipe().status,'error');
assert.equal(saveSavedRecipe(sample).ok,false); checks++;
Object.defineProperty(globalThis,'window',{configurable:true,value:{get localStorage(){throw new Error('SecurityError')}}});
assert.equal(readSavedRecipe().status,'error');
assert.equal(saveSavedRecipe(sample).ok,false); checks++;
delete globalThis.window;
console.log(`PASS: ${checks} saved-recipe checks; schema, malformed JSON, limits, detached values, own key, denied access, quota and absent browser verified.`);
