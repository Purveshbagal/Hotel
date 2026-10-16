const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('cached connections migrate after hot reload without losing restaurant data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hotel-db-reload-'));
  const context = vm.createContext({
    Buffer, console,
    process: {
      env: { ...process.env, DATABASE_PATH: path.join(directory, 'test.db'), ADMIN_PASSWORD: 'test-only-password' },
      cwd: () => process.cwd(),
    },
  });
  let migrations;
  const load = (filename) => {
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    const localRequire = (name) => {
      if (name === './schema' && migrations) return { MIGRATIONS: migrations };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
      return require(name);
    };
    vm.runInContext(`(function(exports, require, module) { ${source}\n})`, context, { filename })(module.exports, localRequire, module);
    return module.exports;
  };

  let connection;
  try {
    const schema = load(path.resolve('src/lib/schema.ts')).MIGRATIONS;
    migrations = schema.slice(0, 2);
    const beforeReload = load(path.resolve('src/lib/db.ts'));
    connection = beforeReload.getDb();
    assert.equal(connection.pragma('user_version', { simple: true }), 2);
    assert.throws(() => connection.prepare('SELECT * FROM restaurant_tables'), /no such table/);
    beforeReload.run(`INSERT INTO restaurant_orders(order_no, order_type, table_no, status, subtotal, tax_amount,
      total, settlement, payment_method, completed_at) VALUES ('LEGACY-1', 'dine_in', 'T01', 'completed', 100, 5,
      105, 'paid', 'cash', datetime('now','localtime'))`);
    beforeReload.all('SELECT * FROM restaurant_orders');
    assert.ok(context.__hmsStatements.size > 0);

    migrations = schema;
    const afterReload = load(path.resolve('src/lib/db.ts'));
    assert.strictEqual(afterReload.getDb(), connection);
    assert.equal(connection.pragma('user_version', { simple: true }), schema.length);
    assert.equal(context.__hmsStatements.size, 0);
    assert.equal(afterReload.get('SELECT table_no FROM restaurant_tables').table_no, 'T01');
    const payment = afterReload.get('SELECT method, amount FROM restaurant_payments');
    assert.equal(payment.method, 'cash');
    assert.equal(payment.amount, 105);
    assert.equal(afterReload.scalar('SELECT COUNT(*) FROM restaurant_orders'), 1);

    // Connections created by the old code have no in-memory migration marker.
    vm.runInContext('delete globalThis.__hmsMigrationCount', context);
    assert.strictEqual(afterReload.getDb(), connection);
    assert.equal(afterReload.scalar('SELECT COUNT(*) FROM restaurant_payments'), 1);

    migrations = [...schema, 'CREATE TABLE reload_probe(id INTEGER); INVALID SQL;'];
    assert.throws(() => load(path.resolve('src/lib/db.ts')).getDb());
    assert.equal(connection.pragma('user_version', { simple: true }), schema.length);
    assert.equal(context.__hmsMigrationCount, schema.length);
    assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'reload_probe'").get().n, 0);

    migrations = [...schema, 'CREATE TABLE reload_probe(id INTEGER);'];
    const retry = load(path.resolve('src/lib/db.ts'));
    assert.strictEqual(retry.getDb(), connection);
    assert.equal(connection.pragma('user_version', { simple: true }), migrations.length);
    assert.equal(connection.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(connection.pragma('foreign_key_check').length, 0);
  } finally {
    connection?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
