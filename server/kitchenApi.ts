import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { TLSSocket } from 'node:tls';
import type { Plugin } from 'vite';
import { defaultCatalog, validateCatalogSettings, type CatalogSettings } from '../src/catalogSettings';
import { MAX_CATALOG_IMAGES_LENGTH } from '../src/ingredientLibrary';
import { MAX_FILLINGS, type IngredientId } from '../src/domain';
import { isPaymentMethod, ONLINE_PAYMENT_UNAVAILABLE, type PaymentMethod } from '../src/payment';
import type { ExtraId } from '../src/extraMenuCatalog';
import {
  calculateOrderPrice, defaultPricing, validatePricingSettings, type PriceOrderInput, type PricedOrder, type PricingSettings,
} from '../src/pricing';

const requireRuntime = createRequire(import.meta.url);
const apiPrefix = '/api/kitchen';
const sessionCookie = 'shawarma_staff';
const sessionDuration = 12 * 60 * 60 * 1000;
const loginWindow = 10 * 60 * 1000;
const maxBodySize = 128 * 1024;
const requestIdPattern = /^[a-zA-Z0-9_-]{24,128}$/;
const statusValues = ['accepted', 'preparing', 'ready'] as const;
type Status = typeof statusValues[number];
type StoredOrder = {
  id: number;
  request_id: string;
  payload_hash: string;
  status: Status;
  order_json: string;
  grill: number;
  payment_method: PaymentMethod;
  created_at: string;
};
type SharedMenu = { catalog: CatalogSettings | null; pricing: PricingSettings | null };
type Next = (error?: unknown) => void;

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

function orderResponse(row: StoredOrder) {
  return {
    id: row.id,
    order: JSON.parse(row.order_json) as PricedOrder,
    grill: row.grill === 1,
    paymentMethod: row.payment_method ?? 'cashier',
    status: row.status,
    createdAt: row.created_at,
  };
}

function writeJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage,limit=maxBodySize): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'Ожидается запрос в формате JSON.');
  }
  if (Number(request.headers['content-length']) > limit) {
    request.resume();
    throw new ApiError(413, 'Слишком большой запрос.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) {
      request.resume();
      throw new ApiError(413, 'Слишком большой запрос.');
    }
    chunks.push(bytes);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Не удалось прочитать запрос.');
  }
  if (!record(value)) throw new ApiError(400, 'Не удалось прочитать запрос.');
  return value;
}

function extractOrder(value: unknown): { input: PriceOrderInput; expectedTotal: number } {
  if (!record(value) || !Array.isArray(value.shawarmas) || value.shawarmas.length > 3 ||
      !Array.isArray(value.extras) || value.extras.length > 8 ||
      (value.shawarmas.length === 0 && value.extras.length === 0) ||
      typeof value.totalKopecks !== 'number' || !Number.isSafeInteger(value.totalKopecks) || value.totalKopecks < 0) {
    throw new ApiError(400, 'Проверьте состав заказа.');
  }
  const shawarmas = value.shawarmas.map(recipe => {
    if (!record(recipe) || typeof recipe.title !== 'string' || !recipe.title.trim() || recipe.title.length > 1500 ||
        !Array.isArray(recipe.ingredients) || !recipe.ingredients.length || recipe.ingredients.length > MAX_FILLINGS ||
        (recipe.strictOrder !== undefined && typeof recipe.strictOrder !== 'boolean')) {
      throw new ApiError(400, 'Проверьте состав шаурмы.');
    }
    return {
      title: recipe.title.trim(),
      ingredientIds: recipe.ingredients.map(item => {
        if (!record(item) || typeof item.id !== 'string') throw new ApiError(400, 'Проверьте состав шаурмы.');
        return item.id as IngredientId;
      }),
      strictOrder: recipe.strictOrder === true,
    };
  });
  const extras = value.extras.map(item => {
    if (!record(item) || typeof item.id !== 'string' || typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      throw new ApiError(400, 'Проверьте количество напитков и закусок.');
    }
    return { id: item.id as ExtraId, quantity: item.quantity };
  });
  return { input: { shawarmas, extras }, expectedTotal: value.totalKopecks };
}

function createKitchenHandler(root: string, publicDir: string, outDir: string) {
  const codespaceOrigin = process.env.CODESPACES === 'true' ? process.env.SHAWARMA_CODESPACE_ORIGIN : undefined;
  const configuredPin = process.env.SHAWARMA_STAFF_PIN?.trim();
  const pinHash = configuredPin && configuredPin.length >= 4 && configuredPin.length <= 64
    ? digest(configuredPin) : undefined;
  const sessions = new Map<string, number>();
  const loginAttempts = new Map<string, { count: number; expires: number }>();
  const dataDir = resolve(root, process.env.SHAWARMA_KITCHEN_DATA_DIR || '.shawarma-local');
  let database: DatabaseSync | undefined;

  function db() {
    if (database) return database;
    const publicLocations = [publicDir, outDir].filter(Boolean);
    if (publicLocations.some(dir => {
      const fromPublic = relative(resolve(root, dir), dataDir);
      return !isAbsolute(fromPublic) && fromPublic !== '..' && !fromPublic.startsWith('..' + sep);
    })) throw new Error('Kitchen data must be outside public build output');
    const { DatabaseSync } = requireRuntime('node:sqlite') as typeof import('node:sqlite');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const opened = new DatabaseSync(resolve(dataDir, 'kitchen.sqlite'));
    try {
      opened.exec(`
        PRAGMA busy_timeout = 3000;
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY,
          request_id TEXT NOT NULL UNIQUE,
          payload_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'preparing', 'ready')),
          order_json TEXT NOT NULL,
          grill INTEGER NOT NULL CHECK (grill IN (0, 1)),
          payment_method TEXT NOT NULL DEFAULT 'cashier' CHECK (payment_method IN ('cashier', 'online_card')),
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS menu (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          catalog_json TEXT,
          pricing_json TEXT
        );
      `);
      // A short write transaction serializes migration across multiple server instances.
      opened.exec('BEGIN IMMEDIATE');
      try {
        const columns = opened.prepare('PRAGMA table_info(orders)').all();
        if (!columns.some(column => column.name === 'payment_method')) {
          opened.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cashier' CHECK (payment_method IN ('cashier', 'online_card'))");
        }
        opened.exec('COMMIT');
      } catch (error) {
        opened.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      opened.close();
      throw error;
    }
    database = opened;
    return database;
  }

  function readMenu(): SharedMenu {
    if (!pinHash) return { catalog: null, pricing: null };
    const row = db().prepare('SELECT catalog_json, pricing_json FROM menu WHERE id = 1').get();
    return {
      catalog: typeof row?.catalog_json === 'string' ? JSON.parse(row.catalog_json) as CatalogSettings : null,
      pricing: typeof row?.pricing_json === 'string' ? JSON.parse(row.pricing_json) as PricingSettings : null,
    };
  }

  function writeMenu(body: Record<string, unknown>): SharedMenu {
    const catalog = body.catalog === undefined ? undefined : validateCatalogSettings(body.catalog);
    const pricing = body.pricing === undefined ? undefined : validatePricingSettings(body.pricing);
    if (!catalog && !pricing) throw new ApiError(400, 'Передайте меню или цены.');
    if (catalog?.ok === false) throw new ApiError(400, catalog.error);
    if (pricing?.ok === false) throw new ApiError(400, pricing.error);
    const storedCatalog = catalog?.ok ? JSON.stringify(catalog.catalog) : null;
    const storedPricing = pricing?.ok ? JSON.stringify(pricing.pricing) : null;
    db().prepare(`
      INSERT INTO menu (id, catalog_json, pricing_json) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET catalog_json = coalesce(excluded.catalog_json, menu.catalog_json),
        pricing_json = coalesce(excluded.pricing_json, menu.pricing_json)
    `).run(storedCatalog, storedPricing);
    return readMenu();
  }

  function cookieToken(request: IncomingMessage) {
    return request.headers.cookie?.split(';').map(item => item.trim())
      .find(item => item.startsWith(sessionCookie + '='))?.slice(sessionCookie.length + 1);
  }

  function sessionHeader(request: IncomingMessage, token: string, maxAge: number) {
    const secure = (codespaceOrigin || (request.socket as TLSSocket).encrypted) ? '; Secure' : '';
    return `${sessionCookie}=${token}; Path=${apiPrefix}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }

  function authenticated(request: IncomingMessage) {
    const token = cookieToken(request);
    const expiration = token && sessions.get(token);
    if (!token || !expiration) return false;
    if (Date.now() < expiration) return true;
    sessions.delete(token);
    return false;
  }

  async function login(request: IncomingMessage, response: ServerResponse) {
    if (!pinHash) throw new ApiError(503, 'Вход сотрудников ещё не настроен.');
    const body = await readBody(request);
    const now = Date.now();
    for (const [ip, attempt] of loginAttempts) {
      if (attempt.expires <= now) loginAttempts.delete(ip);
    }
    const ip = request.socket.remoteAddress ?? 'unknown';
    const recent = loginAttempts.get(ip) ?? { count: 0, expires: now + loginWindow };
    if (recent.count >= 5) throw new ApiError(429, 'Слишком много попыток. Попробуйте через несколько минут.');
    if (typeof body.pin !== 'string' || body.pin.length > 64 || !timingSafeEqual(pinHash, digest(body.pin.trim()))) {
      loginAttempts.set(ip, { ...recent, count: recent.count + 1 });
      throw new ApiError(401, 'Неверный код сотрудника.');
    }
    loginAttempts.delete(ip);
    for (const [token, expiry] of sessions) {
      if (expiry <= now) sessions.delete(token);
    }
    const previousToken = cookieToken(request);
    if (previousToken) sessions.delete(previousToken);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, now + sessionDuration);
    response.setHeader('Set-Cookie', sessionHeader(request, token, sessionDuration / 1000));
    writeJson(response, 200, { configured: true, authenticated: true });
  }

  function createOrder(body: Record<string, unknown>) {
    const { requestId, grill } = body;
    if (typeof requestId !== 'string' || !requestIdPattern.test(requestId) || typeof grill !== 'boolean') {
      throw new ApiError(400, 'Не удалось проверить номер запроса и настройку гриля.');
    }
    const paymentMethod = body.paymentMethod === undefined ? 'cashier' : body.paymentMethod;
    if (!isPaymentMethod(paymentMethod)) throw new ApiError(400, 'Выберите доступный способ оплаты.');
    // There is no gateway integration yet. Selection alone must never fake a paid order.
    if (paymentMethod === 'online_card') throw new ApiError(409, ONLINE_PAYMENT_UNAVAILABLE);
    const { input, expectedTotal } = extractOrder(body.order);
    const legacyHash = digest(JSON.stringify({ grill, input, expectedTotal })).toString('hex');
    const hash = digest(JSON.stringify({ grill, input, expectedTotal, paymentMethod })).toString('hex');
    const byRequest = db().prepare('SELECT * FROM orders WHERE request_id = ?');
    const retry = () => {
      const row = byRequest.get(requestId) as StoredOrder | undefined;
      const legacyCashierRetry = row?.payment_method === 'cashier' && row.payload_hash === legacyHash;
      if (row && row.payload_hash !== hash && !legacyCashierRetry) {
        throw new ApiError(409, 'Этот запрос уже связан с другим заказом.');
      }
      return row;
    };

    const prior = retry();
    if (prior) return { created: false, order: { ...orderResponse(prior), requestId } };

    const menu = readMenu();
    const catalog = menu.catalog ?? defaultCatalog;
    const pricing = menu.pricing ?? defaultPricing;
    if (input.shawarmas.some(recipe => recipe.ingredientIds.some(id =>
      !catalog.ingredients.some(item => item.id === id && item.available))) ||
      input.extras.some(extra => !catalog.extras.some(item => item.id === extra.id && item.available))) {
      throw new ApiError(409, 'Некоторые позиции больше недоступны. Обновите меню и проверьте заказ.');
    }
    const priced = calculateOrderPrice(input, pricing, catalog);
    if (!priced.ok) throw new ApiError(400, priced.error);
    if (priced.order.totalKopecks !== expectedTotal) {
      throw new ApiError(409, 'Цены обновились. Проверьте новый итог перед оформлением.');
    }
    const inserted = db().prepare(`
      INSERT INTO orders (request_id, payload_hash, order_json, grill, payment_method, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO NOTHING RETURNING *
    `).get(requestId, hash, JSON.stringify(priced.order), Number(grill), paymentMethod, new Date().toISOString()) as StoredOrder | undefined;
    const row = inserted ?? retry();
    if (!row) throw new Error('Order insert returned no row');
    return { created: Boolean(inserted), order: { ...orderResponse(row), requestId } };
  }

  function requireStaff(request: IncomingMessage) {
    if (!pinHash) throw new ApiError(503, 'Вход сотрудников ещё не настроен.');
    if (!authenticated(request)) throw new ApiError(401, 'Войдите в экран кухни.');
  }

  async function route(request: IncomingMessage, response: ServerResponse, path: URL) {
    const method = request.method ?? 'GET';
    const endpoint = path.pathname.slice(apiPrefix.length);
    if (method !== 'GET') {
      const scheme = (request.socket as TLSSocket).encrypted ? 'https' : 'http';
      const host = request.headers.host;
      const origin = request.headers.origin;
      if (origin && origin !== `${scheme}://${host}` && origin !== codespaceOrigin) {
        throw new ApiError(403, 'Запрос с другого сайта заблокирован.');
      }
    }

    if (endpoint === '/session' && method === 'GET') {
      return writeJson(response, 200, { configured: Boolean(pinHash), authenticated: authenticated(request) });
    }
    if (endpoint === '/login' && method === 'POST') return login(request, response);
    if (endpoint === '/logout' && method === 'POST') {
      const token = cookieToken(request);
      if (token) sessions.delete(token);
      response.setHeader('Set-Cookie', sessionHeader(request, '', 0));
      return writeJson(response, 200, { configured: Boolean(pinHash), authenticated: false });
    }
    if (endpoint === '/menu') {
      if (method === 'GET') return writeJson(response, 200, readMenu());
      if (method === 'PUT') {
        requireStaff(request);
        return writeJson(response, 200, writeMenu(await readBody(request,MAX_CATALOG_IMAGES_LENGTH+512*1024)));
      }
    }
    if (endpoint === '/orders') {
      if (method === 'POST') {
        if (!pinHash) throw new ApiError(503, 'Приём заказов кухней ещё не настроен.');
        const { created, order } = createOrder(await readBody(request));
        return writeJson(response, created ? 201 : 200, order);
      }
      if (method === 'GET') {
        requireStaff(request);
        const recent = db().prepare(`
          SELECT * FROM orders ORDER BY CASE status WHEN 'ready' THEN 1 ELSE 0 END,
            CASE status WHEN 'ready' THEN -id ELSE id END LIMIT 200
        `).all() as StoredOrder[];
        return writeJson(response, 200, { orders: recent.map(orderResponse) });
      }
    }
    const number = /^\/orders\/(\d+)$/.exec(endpoint);
    if (number) {
      if (!pinHash) throw new ApiError(503, 'Приём заказов кухней ещё не настроен.');
      const id = Number(number[1]);
      if (!Number.isSafeInteger(id)) throw new ApiError(404, 'Заказ не найден.');
      if (method === 'GET') {
        const token = path.searchParams.get('requestId');
        if (!token || !requestIdPattern.test(token)) throw new ApiError(404, 'Заказ не найден.');
        const row = db().prepare('SELECT status FROM orders WHERE id = ? AND request_id = ?').get(id, token);
        if (!row) throw new ApiError(404, 'Заказ не найден.');
        return writeJson(response, 200, { id, status: row.status });
      }
      if (method === 'PATCH') {
        requireStaff(request);
        const { status } = await readBody(request);
        if (status !== 'preparing' && status !== 'ready') throw new ApiError(400, 'Неизвестный статус заказа.');
        const previous: Status = status === 'preparing' ? 'accepted' : 'preparing';
        const changed = db().prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ? RETURNING *')
          .get(status, id, previous) as StoredOrder | undefined;
        if (changed) return writeJson(response, 200, orderResponse(changed));
        const current = db().prepare('SELECT * FROM orders WHERE id = ?').get(id) as StoredOrder | undefined;
        if (!current) throw new ApiError(404, 'Заказ не найден.');
        if (current.status === status) return writeJson(response, 200, orderResponse(current));
        throw new ApiError(409, 'Статус уже изменился. Обновите список заказов.');
      }
    }
    throw new ApiError(404, 'Действие кухни не найдено.');
  }

  return {
    middleware(request: IncomingMessage, response: ServerResponse, next: Next) {
      const path = new URL(request.url ?? '/', 'http://local.invalid');
      if (path.pathname !== apiPrefix && !path.pathname.startsWith(apiPrefix + '/')) return next();
      void route(request, response, path).catch(error => {
        if (error instanceof ApiError) return writeJson(response, error.status, { error: error.message });
        writeJson(response, 500, { error: 'Хранилище кухни временно недоступно.' });
      });
    },
    close() {
      database?.close();
      database = undefined;
    },
  };
}

export function kitchenApi(): Plugin {
  return {
    name: 'shawarma-kitchen-api',
    config() {
      return { server: { fs: { deny: [
        '.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.shawarma-local/**', '**/kitchen.sqlite*',
      ] } } };
    },
    configureServer(server) {
      const kitchen = createKitchenHandler(server.config.root, server.config.publicDir, server.config.build.outDir);
      server.middlewares.use(kitchen.middleware);
      server.httpServer?.once('close', kitchen.close);
    },
    configurePreviewServer(server) {
      const kitchen = createKitchenHandler(server.config.root, server.config.publicDir, server.config.build.outDir);
      server.middlewares.use(kitchen.middleware);
      server.httpServer.once('close', kitchen.close);
    },
  };
}
