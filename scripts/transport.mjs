// Keep transport diagnostics useful without copying credentials, URLs or raw messages.
const SAFE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND',
  'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_SSL_WRONG_VERSION_NUMBER', 'ABORT_ERR',
]);

export function transportErrorCodes(error) {
  const found = new Set();
  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4) return;
    seen.add(value);
    if (SAFE_CODES.has(value.code)) found.add(value.code);
    if (value.name === 'AbortError' || value.name === 'TimeoutError') found.add(value.name);
    visit(value.cause, depth + 1);
    if (Array.isArray(value.errors)) value.errors.slice(0, 4).forEach(e => visit(e, depth + 1));
  };
  visit(error);
  return [...found];
}

export async function diagnosticFetch(url, options, fetcher = globalThis.fetch) {
  try { return await fetcher(url, options); }
  catch (error) {
    const codes = transportErrorCodes(error);
    // Do not attach the raw cause: callers may serialize errors into public records.
    throw new Error(`Network request failed [${codes.join(', ') || 'UNKNOWN_TRANSPORT_ERROR'}]`);
  }
}
