import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
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
const extraDataDirs = [];
const vite = await createVite({ root, configFile: false, server: { middlewareMode: true, hmr: false } });

try {
  const { kitchenApi } = await vite.ssrLoadModule('/server/kitchenApi.ts');
  const { defaultCatalog } = await vite.ssrLoadModule('/src/catalogSettings.ts');
  const { calculateOrderPrice, defaultPricing } = await vite.ssrLoadModule('/src/pricing.ts');

  async function listen(pin, targetDataDir = dataDir) {
    const server = httpServer();
    process.env.SHAWARMA_STAFF_PIN = pin;
    process.env.SHAWARMA_KITCHEN_DATA_DIR = targetDataDir;
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
  assert.equal(a.body.paymentMethod, 'cashier', 'Legacy omitted methods default to cashier');
  assert.equal(Object.hasOwn(a.body, 'paid'), false, 'Choosing a method cannot fabricate payment confirmation');
  const cashierRetry = await api('/orders', { method: 'POST', body: { ...body, paymentMethod: 'cashier' } });
  assert.equal(cashierRetry.status, 200);
  assert.deepEqual(cashierRetry.body, a.body);
  for (const paymentMethod of ['cash', 'paid', null, true, 7]) {
    assert.equal((await api('/orders', { method: 'POST', body: { ...body, paymentMethod } })).status, 400);
  }
  const online = await api('/orders', { method: 'POST', body: {
    ...body, requestId: randomBytes(16).toString('hex'), paymentMethod: 'online_card', demo: true, paid: true,
  } });
  assert.equal(online.status, 409, 'The server must block online checkout until a gateway exists, regardless of client flags');
  assert.match(online.body.error, /Онлайн-оплата пока не подключена/);

  assert.deepEqual(a.body.order.shawarmas[0].ingredients.map(item => item.id), ['white', 'chicken']);
  assert.equal(a.body.order.shawarmas[0].strictOrder, true);
  assert.equal((await api('/orders', { method: 'POST', body: { ...body, grill: false } })).status, 409);
  const queue = (await api('/orders', { cookie })).body.orders;
  assert.equal(queue.length, 1, 'Rejected payment requests cannot create extra orders');
  assert.equal(queue[0].paymentMethod, 'cashier');

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
  const restartedLogin = await restarted('/login', { method: 'POST', body: { pin: credentials } });
  const restartedQueue = (await restarted('/orders', { cookie: restartedLogin.cookie.split(';')[0] })).body.orders;
  assert.equal(restartedQueue[0].paymentMethod, 'cashier', 'Payment method persists across server restarts');

  // Open a database from before payment metadata existed. Existing orders and their
  // old request hashes must survive migration and keep retrying without duplicates.
  const legacyDir = await mkdtemp(join(tmpdir(), 'shawarma-kitchen-legacy-payment-'));
  extraDataDirs.push(legacyDir);
  const legacyDb = new DatabaseSync(join(legacyDir, 'kitchen.sqlite'));
  legacyDb.exec(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted', order_json TEXT NOT NULL,
    grill INTEGER NOT NULL, created_at TEXT NOT NULL
  )`);
  const legacyRequestId = randomBytes(16).toString('hex');
  const legacyInput = {
    shawarmas: [{ title: 'Классическая', ingredientIds: ['white', 'chicken'], strictOrder: true }],
    extras: [{ id: 'ayran', quantity: 2 }],
  };
  const legacyHash = createHash('sha256').update(JSON.stringify({
    grill: true, input: legacyInput, expectedTotal: order.totalKopecks,
  })).digest('hex');
  legacyDb.prepare('INSERT INTO orders (id, request_id, payload_hash, order_json, grill, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(77, legacyRequestId, legacyHash, JSON.stringify(order), 1, new Date().toISOString());
  legacyDb.close();
  const migratedApi = await listen(credentials, legacyDir);
  const migratedRetry = await migratedApi('/orders', { method: 'POST', body: {
    requestId: legacyRequestId, order, grill: true, paymentMethod: 'cashier',
  } });
  assert.equal(migratedRetry.status, 200, 'A legacy accepted order retains its idempotent retry after migration');
  assert.equal(migratedRetry.body.id, 77);
  assert.equal(migratedRetry.body.paymentMethod, 'cashier');
  const migratedDb = new DatabaseSync(join(legacyDir, 'kitchen.sqlite'));
  assert(migratedDb.prepare('PRAGMA table_info(orders)').all().some(column => column.name === 'payment_method'));
  assert.equal(migratedDb.prepare('SELECT payment_method FROM orders WHERE id = 77').get().payment_method, 'cashier');
  assert.equal(migratedDb.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 1);
  migratedDb.close();
  const migrationRestart = await listen(credentials, legacyDir);
  assert.equal((await migrationRestart('/orders', { method: 'POST', body: {
    requestId: legacyRequestId, order, grill: true,
  } })).body.id, 77, 'Migration is safe to repeat on the next start');
  // Two real, small PNG rasters with bounded ancillary metadata exercise a menu
  // body above the public-order limit without requiring an image encoder package.
  function pngChunk(type, data) {
    const name = Buffer.from(type);
    const content = Buffer.concat([name, data]);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, content, checksum]);
  }
  function menuImage(label) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
      pngChunk('tEXt', Buffer.from('Comment\0' + label + 'a'.repeat(59000))),
      pngChunk('IDAT', deflateSync(Buffer.from([0, 120, 160, 80]))), pngChunk('IEND', Buffer.alloc(0)),
    ]);
    return 'data:image/png;base64,' + png.toString('base64');
  }
  const customCatalog = structuredClone(catalog);
  customCatalog.ingredients[0].image = menuImage('one');
  customCatalog.ingredients[1].image = menuImage('two');
  const customIngredient = {
    id: 'custom-test-avocado', name: 'Авокадо', note: '', category: 'vegetable', emoji: '🥑',
    color: '#85a64d', visualId: 'lettuce', surchargeKopecks: 1234, image: 'library:avocado', available: true,
  };
  customCatalog.ingredients.push(customIngredient);
  const customPricing = structuredClone(defaultPricing);
  const largeMenu = { catalog: customCatalog, pricing: customPricing };
  assert(Buffer.byteLength(JSON.stringify(largeMenu)) > 128 * 1024);
  assert.equal((await api('/menu', { method: 'PUT', body: largeMenu })).status, 401, 'A larger menu limit remains staff-only');
  const savedCustom = await api('/menu', { method: 'PUT', cookie, body: largeMenu });
  assert.equal(savedCustom.status, 200, 'Two valid uploaded image payloads above 128 KiB fit the staff menu budget');
  assert.equal(savedCustom.body.catalog.ingredients.find(item => item.id === customIngredient.id).surchargeKopecks, 1234);
  const customPrice = calculateOrderPrice({
    shawarmas: [{ title: 'С авокадо', ingredientIds: ['chicken', customIngredient.id] }], extras: [],
  }, customPricing, customCatalog);
  assert.equal(customPrice.ok, true);
  assert.equal(customPrice.order.totalKopecks, 26234);
  const customBody = { requestId: randomBytes(16).toString('hex'), order: customPrice.order, grill: true, paymentMethod: 'cashier' };
  const forgedTotal = await api('/orders', { method: 'POST', body: {
    ...customBody, order: { ...customPrice.order, totalKopecks: 25000 },
  } });
  assert.equal(forgedTotal.status, 409, 'The client cannot discard the catalog custom-ingredient surcharge');
  const forgedRows = structuredClone(customBody);
  forgedRows.order.shawarmas[0].basePriceKopecks = 1;
  forgedRows.order.shawarmas[0].surcharges[0].priceKopecks = 0;
  forgedRows.order.shawarmas[0].ingredients[1].name = 'Бесплатный ингредиент';
  const acceptedCustom = await api('/orders', { method: 'POST', body: forgedRows });
  assert.equal(acceptedCustom.status, 201);
  assert.equal(acceptedCustom.body.paymentMethod, 'cashier');
  assert.equal(acceptedCustom.body.order.totalKopecks, 26234);
  assert.equal(acceptedCustom.body.order.shawarmas[0].basePriceKopecks, 25000);
  assert.deepEqual(acceptedCustom.body.order.shawarmas[0].surcharges, [{ id: customIngredient.id, name: 'Авокадо', priceKopecks: 1234 }]);
  assert.equal(acceptedCustom.body.order.shawarmas[0].ingredients[1].name, 'Авокадо', 'Stored names also come from the catalog');
  const unknownCustom = structuredClone(customBody);
  unknownCustom.requestId = randomBytes(16).toString('hex');
  unknownCustom.order.shawarmas[0].ingredients[1].id = 'custom-not-in-menu';
  assert.equal((await api('/orders', { method: 'POST', body: unknownCustom })).status, 409);
  customIngredient.surchargeKopecks = 4321;
  assert.equal((await api('/menu', { method: 'PUT', cookie, body: { catalog: customCatalog } })).status, 200);
  assert.equal((await api('/orders', { method: 'POST', body: {
    ...customBody, requestId: randomBytes(16).toString('hex'),
  } })).status, 409, 'Changed custom prices invalidate a new submission with a stale total');
  const acceptedRetry = await api('/orders', { method: 'POST', body: customBody });
  assert.equal(acceptedRetry.status, 200);
  assert.equal(acceptedRetry.body.id, acceptedCustom.body.id);
  assert.equal(acceptedRetry.body.order.totalKopecks, 26234, 'Accepted order retries preserve their original server-priced snapshot');
  assert.equal((await api('/orders', { method: 'POST', body: {
    ...customBody, padding: 'x'.repeat(140 * 1024),
  } })).status, 413, 'Public orders retain the 128 KiB streaming/body limit');
  assert.equal((await api('/menu', { method: 'PUT', cookie, body: {
    ...largeMenu, padding: 'x'.repeat(3 * 1024 * 1024),
  } })).status, 413, 'The staff image/menu budget is still bounded');
  assert.equal((await api('/orders', { cookie })).body.orders.length, 2, 'Forged, unknown, stale and oversized submissions add no extra orders');
  await api('/logout', { method: 'POST', cookie });
  assert.equal((await api('/session', { cookie })).body.authenticated, false);
  const rejected = await Promise.all(Array.from({ length: 6 }, () =>
    api('/login', { method: 'POST', body: { pin: 'wrong' } })));
  assert.deepEqual(rejected.map(result => result.status).sort(), [401, 401, 401, 401, 401, 429]);

  console.log('PASS kitchen: shared catalog/custom prices, staff-only image budget and public body limits, unknown IDs, staff auth, method validation and gateway block, payment persistence, legacy payment migration/idempotency, duplicate protection, status and private tracking.');
} finally {
  await Promise.all([...open].map(server => new Promise(resolve => server.close(resolve))));
  await vite.close();
  await Promise.all([dataDir, ...extraDataDirs].map(dir => rm(dir, { recursive: true, force: true })));
}
