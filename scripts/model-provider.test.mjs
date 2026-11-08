import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModelText, ModelProviderError } from './model-provider.mjs';

const prompts = { systemPrompt: 'Use verified references only.', userPrompt: 'Return JSON.' };
const ok = (payload) => new Response(JSON.stringify(payload), { status: 200 });
const geminiReply = { candidates: [{ content: { parts: [{ text: '{"result":"from Gemini"}' }] } }] };
const githubReply = { choices: [{ message: { content: '{"result":"from GitHub Models"}' } }] };
const noDelay = async () => {};

test('HTTP 402 on Gemini skips costly Gemini retries and uses GitHub Models backup', async () => {
  const seen = [];
  const result = await generateModelText({
    ...prompts,
    env: { GEMINI_API_KEY: 'secret-gemini', GITHUB_MODELS_TOKEN: 'secret-github' },
    sleepImpl: noDelay,
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      if (url.includes('generativelanguage')) return new Response('{"error":{"code":402,"status":"RESOURCE_EXHAUSTED"}}', { status: 402 });
      return ok(githubReply);
    },
  });
  assert.equal(result, '{"result":"from GitHub Models"}');
  assert.equal(seen.length, 2);
  assert.match(seen[0].url, /gemini-2\.5-flash/);
  assert.match(seen[1].url, /models\.github\.ai\/inference\/chat\/completions/);
  assert.equal(seen[1].options.headers.authorization, 'Bearer secret-github');
  assert.equal(JSON.parse(seen[1].options.body).model, 'openai/gpt-4.1-mini');
});

test('without Gemini key, a configured GitHub Models token can create JSON', async () => {
  let requests = 0;
  const text = await generateModelText({
    ...prompts,
    env: { GITHUB_MODELS_TOKEN: 'token' },
    fetchImpl: async () => { requests++; return ok(githubReply); },
  });
  assert.equal(text, '{"result":"from GitHub Models"}');
  assert.equal(requests, 1);
});

test('a Gemini 404 can still fall back to the alternate Gemini model', async () => {
  const urls = [];
  const text = await generateModelText({
    ...prompts,
    env: { GEMINI_API_KEY: 'token' },
    fetchImpl: async url => {
      urls.push(url);
      return urls.length === 1 ? new Response('not found', { status: 404 }) : ok(geminiReply);
    },
  });
  assert.equal(text, '{"result":"from Gemini"}');
  assert.equal(urls.length, 2);
  assert.match(urls[1], /gemini-2\.5-pro/);
});

test('402 without a backup reports permanent billing failure after one request', async () => {
  let calls = 0;
  await assert.rejects(
    generateModelText({
      ...prompts,
      env: { GEMINI_API_KEY: 'super-secret' },
      fetchImpl: async () => { calls++; return new Response('prepayment credits are depleted', { status: 402 }); },
    }),
    e => e instanceof ModelProviderError && e.permanent &&
      e.message.includes('credits are depleted') && !e.message.includes('super-secret'),
  );
  assert.equal(calls, 1);
});

test('when both providers are blocked, provide a permanent, sanitized explanation', async () => {
  await assert.rejects(
    generateModelText({
      ...prompts,
      env: { GEMINI_API_KEY: 'do-not-print', GITHUB_MODELS_TOKEN: 'do-not-print-github' },
      fetchImpl: async url => url.includes('generativelanguage')
        ? new Response('prepayment credits are depleted', { status: 402 })
        : new Response('forbidden', { status: 403 }),
    }),
    e => e.permanent && /prepaid credits/.test(e.message) && /GitHub Models/.test(e.message) &&
      !e.message.includes('do-not-print'),
  );
});

test('a disabled backup never receives evidence or a token', async () => {
  let calls = 0;
  await assert.rejects(
    generateModelText({
      ...prompts,
      env: { GEMINI_API_KEY: 'key', GITHUB_MODELS_TOKEN: 'token', QT_GITHUB_MODELS_ENABLED: 'false' },
      fetchImpl: async () => { calls++; return new Response('payment required', { status: 402 }); },
    }),
    e => e.permanent && e.provider === 'gemini',
  );
  assert.equal(calls, 1);
});

test('a temporarily rate-limited Gemini API retries before using any backup', async () => {
  let calls = 0;
  const text = await generateModelText({
    ...prompts,
    env: { GEMINI_API_KEY: 'key', GITHUB_MODELS_TOKEN: 'token' },
    sleepImpl: noDelay,
    fetchImpl: async () => {
      calls++;
      return calls === 1 ? new Response('busy', { status: 429 }) : ok(geminiReply);
    },
  });
  assert.equal(text, '{"result":"from Gemini"}');
  assert.equal(calls, 2);
});

test('a non-JSON HTTP 200 from GitHub Models fails permanently without repeating', async () => {
  let calls = 0;
  await assert.rejects(
    generateModelText({
      ...prompts,
      env: { GITHUB_MODELS_TOKEN: 'token' },
      fetchImpl: async () => { calls++; return new Response('OK\n', { status: 200 }); },
    }),
    e => e instanceof ModelProviderError && e.permanent && /without a JSON model completion/.test(e.message),
  );
  assert.equal(calls, 2); // chat gateway and Responses API fallback
});

test('a JSON HTTP 200 without a model completion fails permanently', async () => {
  let calls = 0;
  await assert.rejects(
    generateModelText({
      ...prompts,
      env: { GITHUB_MODELS_TOKEN: 'token' },
      fetchImpl: async () => { calls++; return ok({ status: 'OK' }); },
    }),
    e => e instanceof ModelProviderError && e.permanent && /no model completion/.test(e.message),
  );
  assert.equal(calls, 2); // chat gateway and Responses API fallback
});

test('GitHub Models Responses API is tried after a non-JSON chat gateway', async () => {
  const endpoints = [];
  const result = await generateModelText({
    ...prompts,
    env: { GITHUB_MODELS_TOKEN: 'token' },
    fetchImpl: async (url, opts) => {
      endpoints.push(url);
      if (url.endsWith('/chat/completions')) return new Response('OK\\n', { status: 200 });
      assert.deepEqual(JSON.parse(opts.body).input.map(x => x.role), ['system', 'user']);
      return ok({ output: [{ content: [{ type: 'output_text', text: '{"result":"responses"}' }] }] });
    },
  });
  assert.equal(result, '{"result":"responses"}');
  assert.deepEqual(endpoints.map(x => x.split('/').at(-1)), ['completions', 'responses']);
});

test('OpenAI backup is used only when configured and prior providers cannot answer', async () => {
  const urls = [];
  const text = await generateModelText({
    ...prompts,
    env: { GEMINI_API_KEY: 'gemini', GITHUB_MODELS_TOKEN: 'github', OPENAI_API_KEY: 'openai-secret' },
    fetchImpl: async (url, opts) => {
      urls.push(url);
      if (url.includes('generativelanguage')) return new Response('prepayment credits are depleted', { status: 402 });
      if (url.includes('models.github.ai')) return new Response('OK\\n', { status: 200 });
      assert.equal(opts.headers.authorization, 'Bearer openai-secret');
      assert.equal(JSON.parse(opts.body).model, 'gpt-4.1-mini');
      return ok({ choices: [{ message: { content: '{"result":"OpenAI"}' } }] });
    },
  });
  assert.equal(text, '{"result":"OpenAI"}');
  assert.equal(urls.length, 4);
  assert.match(urls.at(-1), /api\.openai\.com/);
});

test('OpenAI is usable as sole provider and never exposes billing errors or keys', async () => {
  const result = await generateModelText({
    ...prompts,
    env: { OPENAI_API_KEY: 'a-secret' },
    fetchImpl: async (url, options) => {
      assert.match(url, /api\.openai\.com/);
      assert.equal(options.headers.authorization, 'Bearer a-secret');
      return ok({ choices: [{ message: { content: '{"ok":true}' } }] });
    },
  });
  assert.equal(result, '{"ok":true}');
  let calls = 0;
  await assert.rejects(generateModelText({
    ...prompts,
    env: { OPENAI_API_KEY: 'private-api-key' },
    fetchImpl: async () => {
      calls++;
      return new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 });
    },
  }), e => e.permanent && !e.message.includes('private-api-key') &&
      /billing|quota/.test(e.message));
  assert.equal(calls, 1);
});
