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
  const githubEnabled = Boolean(githubToken) && !['false', '0', 'off'].includes(
    String(env.QT_GITHUB_MODELS_ENABLED || 'true').trim().toLowerCase(),
  );

  let geminiError = null;
  if (geminiKey) {
    try {
      return await callGemini({ geminiKey, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl });
    } catch (error) {
      geminiError = error;
      if (!githubEnabled) throw error;
      console.warn('Gemini unavailable (' + (error.status || 'request error') + '); trying GitHub Models backup.');
    }
  }

  if (!githubEnabled) {
    throw geminiError || new ModelProviderError(
      'No QT model is configured: set GEMINI_API_KEY or enable the GitHub Models backup.',
      { provider: 'configuration', permanent: true },
    );
  }

  try {
    return await callGithubModels({ githubToken, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl });
  } catch (githubError) {
    if (!geminiError) throw githubError;
    throw new ModelProviderError(
      'Gemini failed: ' + geminiError.message + '; GitHub Models backup failed: ' + githubError.message,
      { provider: 'both', status: githubError.status, permanent: Boolean(geminiError.permanent && githubError.permanent) },
    );
  }
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

async function callGithubModels({ githubToken, systemPrompt, userPrompt, temperature, env, fetchImpl, sleepImpl }) {
  const model = env.GITHUB_MODELS_MODEL?.trim() || 'openai/gpt-4.1-mini';
  const endpoint = 'https://models.github.ai/inference/chat/completions';
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt + '\nReturn only a valid JSON object.' },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  };

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
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
      break;
    }

    if (response.ok) {
      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      const text = typeof content === 'string' ? content.trim() :
        Array.isArray(content) ? content.map(p => p.text || '').join('').trim() : '';
      if (text) {
        console.log('GitHub Models backup used: ' + model);
        return text;
      }
      lastError = new ModelProviderError('GitHub Models returned an empty response', { provider: 'github-models' });
      break;
    }

    await response.text(); // consume, but never log credentials or response payloads
    lastError = new ModelProviderError(
      'GitHub Models ' + model + ' HTTP ' + response.status +
        (response.status === 403 ? ' (check Models access and models: read permission)' : ''),
      { provider: 'github-models', status: response.status, permanent: [400, 401, 402, 403, 404].includes(response.status) },
    );
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
      await sleepImpl(1500 * attempt);
      continue;
    }
    break;
  }
  throw lastError;
}
