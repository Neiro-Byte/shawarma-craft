import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'shawarma-kitchen-test-'));
const credentials = randomBytes(16).toString('hex');
const open = new Set();
const vite = await createVite({ root, configFile: false, server: { middlewareMode: true, hmr: false } });

try {
  const { kitchenApi } = await vite.ssrLoadModule('/server/kitchenApi.ts');
  const { defaultCatalog } = await vite.ssrLoadModule('/src/catalogSettings.ts');
  const { calculateOrderPrice, defaultPricing } = await vite.ssrLoadModule('/src/pricing.ts');

  async function listen(pin) {
    const server = httpServer();
    process.env.SHAWARMA_STAFF_PIN = pin;
    process.env.SHAWARMA_KITCHEN_DATA_DIR = dataDir;
    kitchenApi().configureServer({
      config: { root, publicDir: join(root, 'public'), build: { outDir: 'dist' } },
      middlewares: { use: middleware => server.on('request', (req, res) => {
        middleware(req, res, () => { res.writeHead(404); res.end(); });
      }) },
      httpServer: server,
    });
    open.add(server);
    server.on('close', () => open.delete(server));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    return async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
      const response = await fetch(origin + '/api/kitchen' + path, {
        method, headers: { ...headers, ...(cookie && { Cookie: cookie }),
          ...(body && { 'Content-Type': 'application/json' }) },
        ...(body && { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
    };
  }

  const disabled = await listen('');
  assert.deepEqual((await disabled('/session')).body, { configured: false, authenticated: false });
  assert.equal((await disabled('/orders', { method: 'POST', body: {} })).status, 503);

  const api = await listen(credentials);
  const second = await listen(credentials);
  assert.equal((await api('/orders')).status, 401);
  assert.equal((await api('/menu', { method: 'PUT', body: { catalog: defaultCatalog } })).status, 401);
  assert.equal((await api('/login', { method: 'POST', body: { pin: 'wrong' } })).status, 401);
  assert.equal((await api('/login', { method: 'POST', headers: { Origin: 'http://external.invalid' }, body: { pin: credentials } })).status, 403);
  const login = await api('/login', { method: 'POST', body: { pin: credentials } });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly; SameSite=Strict/);
  const cookie = login.cookie.split(';')[0];
  assert.equal((await api('/session', { cookie })).body.authenticated, true);

  const catalog = structuredClone(defaultCatalog);
  catalog.settings.slogan = 'Проверка общего меню';
  const pricing = { ...defaultPricing, basePriceKopecks: 29000 };
  assert.equal((await api('/menu', { method: 'PUT', cookie, body: { catalog } })).status, 200);
  assert.equal((await api('/menu', { method: 'PUT', cookie, body: { pricing } })).status, 200);
  const shared = (await second('/menu')).body;
  assert.equal(shared.catalog.settings.slogan, 'Проверка общего меню');
  assert.equal(shared.pricing.basePriceKopecks, 29000);
  assert.equal((await api('/menu', { method: 'PUT', cookie, body: { pricing: {} } })).status, 400);

  const { order } = calculateOrderPrice({
    shawarmas: [{ title: 'Классическая', ingredientIds: ['white', 'chicken'], strictOrder: true }],
    extras: [{ id: 'ayran', quantity: 2 }],
  }, pricing, catalog);
  const requestId = randomBytes(16).toString('hex');
  const body = { requestId, order, grill: true };
  const wrongTotal = { ...body, order: { ...order, totalKopecks: 1 } };
  assert.equal((await api('/orders', { method: 'POST', body: wrongTotal })).status, 409);

  const [a, b] = await Promise.all([
    api('/orders', { method: 'POST', body }), second('/orders', { method: 'POST', body }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.deepEqual(a.body, b.body);
  assert.equal(a.body.status, 'accepted');
  assert.deepEqual(a.body.order.shawarmas[0].ingredients.map(item => item.id), ['white', 'chicken']);
  assert.equal(a.body.order.shawarmas[0].strictOrder, true);
  assert.equal((await api('/orders', { method: 'POST', body: { ...body, grill: false } })).status, 409);
  assert.equal((await api('/orders', { cookie })).body.orders.length, 1);

  const path = '/orders/' + a.body.id;
  assert.equal((await api(path)).status, 404);
  assert.equal((await api(path + '?requestId=' + randomBytes(16).toString('hex'))).status, 404);
  assert.equal((await api(path, { method: 'PATCH', body: { status: 'preparing' } })).status, 401);
  assert.equal((await api(path, { method: 'PATCH', cookie, body: { status: 'ready' } })).status, 409);
  assert.equal((await api(path, { method: 'PATCH', cookie, body: { status: 'preparing' } })).status, 200);
  assert.equal((await api(path, { method: 'PATCH', cookie, body: { status: 'ready' } })).status, 200);
  assert.deepEqual((await second(path + '?requestId=' + requestId)).body, { id: a.body.id, status: 'ready' });
  const restarted = await listen(credentials);
  assert.deepEqual((await restarted(path + '?requestId=' + requestId)).body, { id: a.body.id, status: 'ready' });
  await api('/logout', { method: 'POST', cookie });
  assert.equal((await api('/session', { cookie })).body.authenticated, false);
  const rejected = await Promise.all(Array.from({ length: 6 }, () =>
    api('/login', { method: 'POST', body: { pin: 'wrong' } })));
  assert.deepEqual(rejected.map(result => result.status).sort(), [401, 401, 401, 401, 401, 429]);

  console.log('PASS kitchen: shared catalog/prices, staff auth and logout, duplicate protection, persisted status and private tracking.');
} finally {
  await Promise.all([...open].map(server => new Promise(resolve => server.close(resolve))));
  await vite.close();
  await rm(dataDir, { recursive: true, force: true });
}
