import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupKitchen } from './backup-kitchen.mjs';

const root = await mkdtemp(join(tmpdir(), 'shawarma-backup-check-'));
let writer;
try {
  const dataDir = join(root, '.shawarma-local');
  await mkdir(dataDir);
  const sourcePath = join(dataDir, 'kitchen.sqlite');
  writer = new DatabaseSync(sourcePath);
  writer.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE orders (id INTEGER PRIMARY KEY, request_id TEXT, payload_hash TEXT, status TEXT, order_json TEXT, grill INTEGER, created_at TEXT);
    CREATE TABLE menu (id INTEGER PRIMARY KEY, catalog_json TEXT, pricing_json TEXT);
    INSERT INTO orders VALUES (1, 'opaque-token', 'payload-hash', 'accepted', '{"shawarmas":[]}', 1, '2026-11-18');
    INSERT INTO menu VALUES (1, '{"ingredients":[]}', '{"version":1}');
  `);
  assert((await stat(sourcePath + '-wal')).size > 0);
  const [first, second] = await Promise.all([
    backupKitchen({ projectRoot: root }), backupKitchen({ projectRoot: root }),
  ]);
  assert.notEqual(first.path, second.path);
  for (const result of [first, second]) {
    assert.equal(result.orders, 1);
    assert.equal(result.menus, 1);
    assert.equal((await stat(result.path)).mode & 0o777, 0o600);
    const restored = new DatabaseSync(result.path, { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT request_id FROM orders').get().request_id, 'opaque-token');
      assert.equal(restored.prepare('SELECT pricing_json FROM menu').get().pricing_json, '{"version":1}');
    } finally { restored.close(); }
  }
  writer.exec("INSERT INTO orders VALUES (2, 'second-token', 'hash', 'ready', '{}', 0, 'later')");
  assert.equal(writer.prepare('SELECT count(*) AS count FROM orders').get().count, 2);
  const bytes = await readFile(first.path);
  assert.equal((await backupKitchen({ projectRoot: root })).orders, 2);
  assert.deepEqual(await readFile(first.path), bytes, 'A later backup must not overwrite an existing copy');
  assert.equal((await stat(join(dataDir, 'backups'))).mode & 0o777, 0o700);

  await mkdir(join(root, 'empty'));
  await assert.rejects(backupKitchen({ projectRoot: root, dataDir: 'empty' }), { code: 'ENOENT' });
  assert.deepEqual(await readdir(join(root, 'empty')), [], 'Missing source must not create files');
  await mkdir(join(root, 'public'));
  await assert.rejects(backupKitchen({ projectRoot: root, dataDir: 'public' }), /public/);
  await mkdir(join(root, 'bad'));
  const broken = new DatabaseSync(join(root, 'bad', 'kitchen.sqlite'));
  broken.exec('CREATE TABLE unrelated (id INTEGER)');
  broken.close();
  await assert.rejects(backupKitchen({ projectRoot: root, dataDir: 'bad' }));
  assert.deepEqual(await readdir(join(root, 'bad', 'backups')), [], 'Failed verification must remove its copy');
  await mkdir(join(root, 'linked'));
  await symlink(sourcePath, join(root, 'linked', 'kitchen.sqlite'));
  await assert.rejects(backupKitchen({ projectRoot: root, dataDir: 'linked' }), /обычный файл/);
  console.log('PASS kitchen backup: live WAL data, isolated copies, restrictive permissions, missing source, validation cleanup and path guards.');
} finally {
  writer?.close();
  await rm(root, { recursive: true, force: true });
}
