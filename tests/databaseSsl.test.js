import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { normalizeDatabaseSsl } from '../src/config/databaseSsl.js';
import { X509Certificate } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';

test('Supabase direct and pooled URLs load the trusted CA and verify server identity', () => {
  for (const host of ['db.project.supabase.co', 'aws-0-ap-south-1.pooler.supabase.com']) {
    for (const suffix of ['', '?sslmode=require', '?sslmode=verify-full']) {
      const normalized = normalizeDatabaseSsl(`postgresql://postgres:password@${host}:5432/postgres${suffix}`);
      const client = new Client({ connectionString: normalized });
      const ssl = client.connectionParameters.ssl;
      assert.equal(new URL(normalized).searchParams.get('sslmode'), 'verify-full');
      assert.notEqual(ssl.rejectUnauthorized, false);
      const ca = new X509Certificate(ssl.ca);
      assert.equal(ca.ca, true);
      assert.equal(ca.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
      assert.equal(ssl.checkServerIdentity, undefined);
      assert.ok(checkServerIdentity(host, { subjectaltname: 'DNS:attacker.invalid' }));
    }
  }
});

test('Supabase detection ignores lookalike domains and preserves custom trust roots', () => {
  const lookalike = 'postgresql://localhost.supabase.co.attacker.invalid/app?sslmode=verify-full';
  assert.equal(normalizeDatabaseSsl(lookalike), lookalike);
  const custom = 'postgresql://db.project.supabase.co/app?sslmode=verify-full&sslrootcert=custom.crt';
  assert.equal(normalizeDatabaseSsl(custom), custom);
});

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
