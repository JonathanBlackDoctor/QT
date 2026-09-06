// Bounded requests, checked redirects and redacted errors for project collectors.
export class SourceError extends Error {
  constructor(code, status = null) { super(code); this.code = code; this.status = status; }
}

export function safeDiagnosticUrl(value) {
  try { const u = new URL(value); return `${u.origin}${u.pathname}`; } catch { return '(invalid URL)'; }
}

export function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? all;
    const hex = entity[1].toLowerCase() === 'x';
    const n = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  });
}

export function plainText(html) {
  return decodeEntities(String(html ?? '')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|h[1-6]|li|text)>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function allowedSourceUrl(value, hosts) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443')
      && hosts.includes(u.hostname.toLowerCase());
  } catch { return false; }
}

export function createHttpClient({ fetchImpl = globalThis.fetch, timeoutMs = 12000, maxBytes = 4000000, retries = 1, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  return async function request(url, { hosts, method = 'GET', headers = {}, body } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        let current = url;
        for (let redirects = 0; redirects <= 4; redirects++) {
          if (!allowedSourceUrl(current, hosts ?? [])) throw new SourceError('disallowed_url');
          const res = await fetchImpl(current, { method, headers: { accept: 'text/html,application/json,application/xml;q=0.9', ...headers }, body, signal: ctrl.signal, redirect: 'manual' });
          if ([301,302,303,307,308].includes(res.status)) {
            await res.body?.cancel();
            const next = res.headers.get('location');
            if (!next || method !== 'GET' || redirects === 4) throw new SourceError('redirect_rejected');
            current = new URL(next, current).href;
            continue;
          }
          if (!res.ok) { await res.body?.cancel(); throw new SourceError(`http_${res.status}`, res.status); }
          if (Number(res.headers.get('content-length')) > maxBytes) { await res.body?.cancel(); throw new SourceError('response_too_large'); }
          const type = res.headers.get('content-type') || '';
          if (!/text|html|json|xml/i.test(type)) { await res.body?.cancel(); throw new SourceError('unsupported_content_type'); }
          const chunks = []; let size = 0;
          if (!res.body) throw new SourceError('empty_response');
          const reader = res.body.getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > maxBytes) { await reader.cancel(); throw new SourceError('response_too_large'); }
              chunks.push(Buffer.from(value));
            }
          } finally { reader.releaseLock(); }
          return { url: current, text: Buffer.concat(chunks).toString('utf8'), status: res.status };
        }
      } catch (error) {
        // Never expose request objects, signed caption URLs, or API keys in logs/cache.
        const safe = error instanceof SourceError ? error : new SourceError(ctrl.signal.aborted ? 'timeout' : 'network_error');
        if (attempt === retries || !['network_error','timeout','http_429','http_500','http_502','http_503','http_504'].includes(safe.code)) throw safe;
      } finally { clearTimeout(timer); }
      await sleep(500 * (attempt + 1));
    }
  };
}
