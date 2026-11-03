import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { normalizeDatabaseSsl } from '../src/config/databaseSsl.js';

test('legacy SSL aliases retain verified TLS without triggering the pg warning', () => {
  for (const mode of ['prefer', 'require', 'verify-ca']) {
    const input = `postgresql://app:p%40ss@db.example.com/app?sslmode=${mode}&application_name=ashwi`;
    const normalized = normalizeDatabaseSsl(input);
    assert.equal(new URL(normalized).searchParams.get('sslmode'), 'verify-full');
    const client = new Client({ connectionString: normalized });
    assert.ok(client.connectionParameters.ssl);
    assert.notEqual(client.connectionParameters.ssl.rejectUnauthorized, false);
    assert.equal(client.connectionParameters.password, 'p@ss');
    assert.equal(client.connectionParameters.host, 'db.example.com');
    assert.equal(new URL(normalized).searchParams.get('application_name'), 'ashwi');
  }
});

test('explicit modes, libpq compatibility, local URLs and invalid inputs are preserved', () => {
  for (const input of [
    'postgresql://localhost/app',
    'postgresql://db.example.com/app?sslmode=verify-full',
    'postgresql://db.example.com/app?sslmode=disable',
    'postgresql://db.example.com/app?sslmode=require&uselibpqcompat=true',
    'invalid',
  ]) assert.equal(normalizeDatabaseSsl(input), input);
});
