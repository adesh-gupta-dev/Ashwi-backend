import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabaseTarget, describeDatabaseFailure } from '../src/config/databaseDiagnostics.js';

const target = { host: 'localhost', port: 5432, user: 'app_user', database: 'ashwi_chat' };

test('aggregate connection errors identify the actual listening-address failure', () => {
  const error = new AggregateError([Object.assign(new Error(), { code: 'ECONNREFUSED' })]);
  assert.match(describeDatabaseFailure(error, { ...target, port: 3307 }), /localhost:3307/);
  assert.match(describeDatabaseFailure(error, target), /DB_PORT\/PGPORT/);
});

test('authentication and missing databases have distinct recovery instructions', () => {
  assert.match(describeDatabaseFailure({ code: '28P01' }, target), /DB_USER and DB_PASSWORD/);
  assert.match(describeDatabaseFailure({ code: '3D000' }, target), /ashwi_chat.*does not exist/);
});

test('connection string credentials and query secrets never appear in diagnostics', () => {
  const safeTarget = getDatabaseTarget({ connectionString: 'postgresql://app_user:private-password@localhost:5432/ashwi_chat?secret=private-query' });
  const message = describeDatabaseFailure({ code: '28P01', message: 'private-password' }, safeTarget);
  assert.doesNotMatch(JSON.stringify(safeTarget) + message, /private-password|private-query/);
  assert.equal(safeTarget.user, 'app_user');
  assert.equal(safeTarget.database, 'ashwi_chat');
});

test('invalid URLs, resolution failures and timeouts produce useful safe messages', () => {
  assert.match(getDatabaseTarget({ connectionString: 'invalid' }).host, /invalid DATABASE_URL/);
  assert.match(describeDatabaseFailure({ code: 'ENOTFOUND' }, target), /DB_HOST\/PGHOST/);
  assert.match(describeDatabaseFailure(new Error('Connection timeout'), target), /did not respond/);
});
