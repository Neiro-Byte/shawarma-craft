import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));

function inside(directory, path) {
  const child = relative(directory, path);
  return !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep);
}

function verifyDatabase(database) {
  const check = database.prepare('PRAGMA quick_check').all();
  if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') {
    throw new Error('Проверка целостности копии не пройдена.');
  }
  // Verify the application tables and columns, including databases with no orders yet.
  database.prepare('SELECT id, request_id, payload_hash, status, order_json, grill, created_at FROM orders LIMIT 1').all();
  database.prepare('SELECT id, catalog_json, pricing_json FROM menu LIMIT 1').all();
  return {
    orders: database.prepare('SELECT count(*) AS count FROM orders').get().count,
    menus: database.prepare('SELECT count(*) AS count FROM menu').get().count,
  };
}

export async function backupKitchen({ projectRoot = defaultRoot, dataDir = process.env.SHAWARMA_KITCHEN_DATA_DIR || '.shawarma-local' } = {}) {
  const root = await realpath(projectRoot);
  const directory = await realpath(resolve(root, dataDir));
  for (const publicFolder of ['public', 'dist']) {
    const candidate = resolve(root, publicFolder);
    const publicPath = await realpath(candidate).catch(error => {
      if (error.code === 'ENOENT') return candidate;
      throw error;
    });
    if (inside(publicPath, directory)) throw new Error('База и копии должны находиться вне public и dist.');
  }
  const sourcePath = resolve(directory, 'kitchen.sqlite');
  const sourceInfo = await lstat(sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error('Ожидается обычный файл kitchen.sqlite.');

  const backupDirectory = resolve(directory, 'backups');
  await mkdir(backupDirectory, { mode: 0o700 }).catch(error => {
    if (error.code !== 'EEXIST') throw error;
  });
  const folderInfo = await lstat(backupDirectory);
  if (!folderInfo.isDirectory() || folderInfo.isSymbolicLink()) throw new Error('Каталог копий должен быть обычной папкой.');
  await chmod(backupDirectory, 0o700);

  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const destination = resolve(backupDirectory, `kitchen-${timestamp}-${randomUUID()}.sqlite`);
  const reserved = await open(destination, 'wx', 0o600);
  await reserved.close();
  let source;
  let copied;
  let verified = false;
  try {
    source = new DatabaseSync(sourcePath, { readOnly: true });
    source.exec('PRAGMA busy_timeout = 3000');
    await backup(source, destination);
    copied = new DatabaseSync(destination, { readOnly: true });
    const summary = verifyDatabase(copied);
    await chmod(destination, 0o600);
    verified = true;
    return { path: destination, ...summary };
  } finally {
    try {
      copied?.close();
    } finally {
      try {
        source?.close();
      } finally {
        if (!verified) await unlink(destination);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await backupKitchen();
    console.log(`Копия проверена. Заказов — ${result.orders}. Файл — ${result.path}`);
  } catch (error) {
    console.error(error.code === 'ENOENT' ? 'База кухни не найдена. Пустая база не создавалась.' : error.message);
    process.exitCode = 1;
  }
}
