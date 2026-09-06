import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticFetch, transportErrorCodes } from './transport.mjs';
import { fetchText } from './lib.mjs';

test('transport diagnostics preserve nested connection and DNS cause codes', () => {
  const timeout = new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
  assert.deepEqual(transportErrorCodes(timeout), ['UND_ERR_CONNECT_TIMEOUT']);
  const aggregate = new AggregateError([{ code: 'ENETUNREACH' }, { code: 'ECONNREFUSED' }, { code: 'ENETUNREACH' }]);
  assert.deepEqual(transportErrorCodes({ cause: aggregate }), ['ENETUNREACH', 'ECONNREFUSED']);
  assert.deepEqual(transportErrorCodes({ cause: { code: 'ENOTFOUND' } }), ['ENOTFOUND']);
  assert.deepEqual(transportErrorCodes({ cause: { code: 'CERT_HAS_EXPIRED' } }), ['CERT_HAS_EXPIRED']);
});

test('public error text excludes raw messages, credentials, query strings and unknown codes', async () => {
  const secret = 'PRIVATE_API_KEY';
  const cause = { code: 'UND_ERR_CONNECT_TIMEOUT', message: secret };
  cause.cause = cause;
  assert.deepEqual(transportErrorCodes(cause), ['UND_ERR_CONNECT_TIMEOUT']);
  await assert.rejects(() => diagnosticFetch(`https://user:${secret}@example.invalid/?key=${secret}`, {}, async () => {
    throw new TypeError(secret, { cause });
  }), error => error.message === 'Network request failed [UND_ERR_CONNECT_TIMEOUT]' && !error.cause);
  await assert.rejects(() => diagnosticFetch('unused', {}, async () => { throw { code: secret, message: secret }; }), /UNKNOWN_TRANSPORT_ERROR/);
});

test('successful requests preserve options and response; abort errors remain recognizable', async () => {
  const signal = AbortSignal.abort();
  const options = { signal, redirect: 'follow' };
  const response = { ok: true };
  assert.equal(await diagnosticFetch('unused', options, async (url, received) => {
    assert.equal(url, 'unused'); assert.equal(received, options); return response;
  }), response);
  await assert.rejects(() => diagnosticFetch('unused', {}, async () => { throw { name: 'AbortError' }; }), /AbortError/);
});

test('the production evidence fetcher keeps the safe cause in its thrown error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('raw credential', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); };
  try { await assert.rejects(() => fetchText('https://sum.su.or.kr:8888/bible/today'), /Network request failed \[UND_ERR_CONNECT_TIMEOUT\]/); }
  finally { globalThis.fetch = original; }
});
