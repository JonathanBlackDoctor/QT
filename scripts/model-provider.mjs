import { sleep } from './lib.mjs';

// Prefer the existing Gemini setup, but keep QT running with GitHub Models
// when the Google AI Studio account has no prepaid credits.
// Both providers receive only the same evidence-grounded prompts.
export class ModelProviderError extends Error {
  constructor(message, { provider, status = null, permanent = false } = {}) {
    super(message);
    this.name = 'ModelProviderError';
    this.provider = provider;
    this.status = status;
    this.permanent = permanent;
  }
}

export async function generateModelText({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  env = process.env,
  fetchImpl = fetch,
  sleepImpl = sleep,
}) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const githubToken = env.GITHUB_MODELS_TOKEN?.trim();
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const githubEnabled = Boolean(githubToken) && !['false', '0', 'off'].includes(
    String(env.QT_GITHUB_MODELS_ENABLED || 'true').trim().toLowerCase(),
  );

  // Only configure providers with explicit credentials. Never treat a gateway's
  // health-check "OK" as a completed commentary.
  const providers = [
    ...(geminiKey ? [{
      name: 'Gemini',
      invoke: () => callGemini({ geminiKey, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl }),
    }] : []),
    ...(githubEnabled ? [{
      name: 'GitHub Models backup',
      invoke: () => callGithubModels({ githubToken, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl }),
    }] : []),
    ...(openaiKey ? [{
      name: 'OpenAI backup',
      invoke: () => callOpenAI({ openaiKey, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl }),
    }] : []),
  ];
  if (!providers.length) {
    throw new ModelProviderError(
      'No QT model credentials configured. Set GEMINI_API_KEY or OPENAI_API_KEY, or enable GitHub Models.',
      { provider: 'configuration', permanent: true },
    );
  }

  const errors = [];
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      return await provider.invoke();
    } catch (error) {
      const safeError = error instanceof ModelProviderError ? error :
        new ModelProviderError(provider.name + ' request failed unexpectedly', { provider: 'unknown' });
      errors.push({ name: provider.name, error: safeError });
      if (i + 1 < providers.length) {
        console.warn(provider.name + ' unavailable (' + (safeError.status || 'request error') +
          '); trying ' + providers[i + 1].name + '.');
      }
    }
  }
  if (errors.length === 1) throw errors[0].error;
  throw new ModelProviderError(
    errors.map(({ name, error }) => name + ' failed: ' + error.message).join('; '),
    {
      provider: 'all',
      status: errors.at(-1).error.status,
      permanent: errors.every(({ error }) => error.permanent),
    },
  );
}

async function callGemini({ geminiKey, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl }) {
  // Allow repository variables to override the documented, stable default.
  const models = [...new Set([
    env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
    env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-2.5-pro',
  ].filter(Boolean))];
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json', maxOutputTokens: 8192 },
  };

  let lastError;
  for (const model of models) {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(geminiKey);
    for (let attempt = 1; attempt <= 3; attempt++) {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        lastError = new ModelProviderError('Gemini ' + model + ' network request failed', { provider: 'gemini' });
        if (attempt < 3) { await sleepImpl(1500 * attempt); continue; }
        break;
      }

      if (response.ok) {
        const json = await response.json();
        const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('')?.trim();
        if (!text) {
          lastError = new ModelProviderError('Gemini ' + model + ' returned an empty response', { provider: 'gemini' });
          break;
        }
        console.log('Gemini model used: ' + model);
        return text;
      }

      // Never print the remote response body or URLs with API keys.
      const bodyText = await response.text();
      const creditsGone = response.status === 402 ||
        /prepayment credits are depleted|billing.*(required|depleted)|RESOURCE_EXHAUSTED.*prepay/i.test(bodyText);
      lastError = new ModelProviderError(
        creditsGone
          ? 'Gemini prepaid credits are depleted (HTTP 402). Add credits in Google AI Studio billing.'
          : 'Gemini ' + model + ' HTTP ' + response.status,
        { provider: 'gemini', status: response.status, permanent: creditsGone || [400, 401, 403].includes(response.status) },
      );
      // A billing-blocked key cannot be fixed by selecting a different Gemini model.
      if (creditsGone) throw lastError;
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        await sleepImpl(1500 * attempt);
        continue;
      }
      break;
    }
    if (model !== models.at(-1)) console.warn('Gemini ' + model + ' failed; trying alternate Gemini model.');
  }
  throw lastError;
}

function completionText(json) {
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() :
    Array.isArray(content) ? content.map(part => part?.text || '').join('').trim() : '';
}

async function callGithubModels({ githubToken, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl }) {
  const model = env.GITHUB_MODELS_MODEL?.trim() || 'openai/gpt-4.1-mini';
  const messages = [
    { role: 'system', content: systemPrompt + '\\nReturn only a valid JSON object.' },
    { role: 'user', content: userPrompt },
  ];
  // Some accounts return HTTP 200 text/plain "OK" on the chat route, not
  // a completion. Try the Responses API route once before giving up.
  const routes = [
    { endpoint: 'https://models.github.ai/inference/chat/completions', kind: 'chat' },
    { endpoint: 'https://models.github.ai/inference/responses', kind: 'responses' },
  ];
  let lastError;
  for (const route of routes) {
    const body = route.kind === 'chat'
      ? { model, messages, temperature, max_tokens: 8192, response_format: { type: 'json_object' } }
      : { model, input: messages, temperature, max_output_tokens: 8192 };
    for (let attempt = 1; attempt <= 3; attempt++) {
      let response;
      try {
        response = await fetchImpl(route.endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/vnd.github+json',
            authorization: 'Bearer ' + githubToken,
            'content-type': 'application/json',
            'x-github-api-version': '2022-11-28',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
        });
      } catch {
        lastError = new ModelProviderError('GitHub Models network request failed', { provider: 'github-models' });
        if (attempt < 3) { await sleepImpl(1500 * attempt); continue; }
        throw lastError;
      }

      if (response.ok) {
        const raw = await response.text();
        let json;
        try { json = JSON.parse(raw); }
        catch {
          lastError = new ModelProviderError(
            'GitHub Models ' + route.kind + ' returned HTTP 200 without a JSON model completion (gateway only).',
            { provider: 'github-models', status: response.status, permanent: true },
          );
          break; // Don't repeat a gateway health-check. Try the alternate route.
        }
        const text = route.kind === 'chat' ? completionText(json) :
          (typeof json?.output_text === 'string' ? json.output_text.trim() :
            (json?.output || []).flatMap(item => item?.content || [])
              .map(part => part?.text || '').join('').trim());
        if (text) {
          console.log('GitHub Models backup used via ' + route.kind + ': ' + model);
          return text;
        }
        lastError = new ModelProviderError(
          'GitHub Models ' + route.kind + ' returned no model completion despite HTTP 200.',
          { provider: 'github-models', status: response.status, permanent: true },
        );
        break;
      }

      await response.text(); // Never log API response bodies or credentials.
      lastError = new ModelProviderError(
        'GitHub Models ' + route.kind + ' HTTP ' + response.status +
          (response.status === 403 ? ' (check Models access and models: read permission)' : ''),
        { provider: 'github-models', status: response.status, permanent: [400, 401, 402, 403, 404, 405].includes(response.status) },
      );
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        await sleepImpl(1500 * attempt);
        continue;
      }
      // A missing/unsupported chat route might have a working Responses route.
      if (route.kind === 'chat' && [404, 405].includes(response.status)) break;
      throw lastError;
    }
  }
  throw lastError;
}

async function callOpenAI({ openaiKey, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl }) {
  const model = env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt + '\\nReturn only a valid JSON object.' },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_completion_tokens: 8192,
    response_format: { type: 'json_object' },
  };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + openaiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      lastError = new ModelProviderError('OpenAI network request failed', { provider: 'openai' });
      if (attempt < 3) { await sleepImpl(1500 * attempt); continue; }
      throw lastError;
    }
    if (response.ok) {
      let json;
      try { json = await response.json(); }
      catch {
        throw new ModelProviderError('OpenAI did not return a JSON completion', {
          provider: 'openai', status: response.status, permanent: true,
        });
      }
      const text = completionText(json);
      if (!text) {
        throw new ModelProviderError('OpenAI returned no model completion', {
          provider: 'openai', status: response.status, permanent: true,
        });
      }
      console.log('OpenAI backup used: ' + model);
      return text;
    }
    // Only inspect for a standard quota code; never echo the response body.
    const raw = await response.text();
    const quotaExceeded = response.status === 429 && /insufficient_quota|billing_hard_limit_reached/.test(raw);
    lastError = new ModelProviderError(
      quotaExceeded ? 'OpenAI API quota/billing is exhausted.' : 'OpenAI HTTP ' + response.status,
      { provider: 'openai', status: response.status,
        permanent: quotaExceeded || [400, 401, 402, 403, 404].includes(response.status) },
    );
    if (!quotaExceeded && [429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
      await sleepImpl(1500 * attempt);
      continue;
    }
    break;
  }
  throw lastError;
}
