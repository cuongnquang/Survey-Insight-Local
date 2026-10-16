const API = 'https://sheets.googleapis.com/v4/spreadsheets';

const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

function isRetryable(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function backoffDelay(attempt) {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return exp + Math.floor(Math.random() * 250);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET a Google Sheets API path with retry/backoff for transient failures
 * (429 / 5xx / network). 401 is treated as an auth error and never retried —
 * the caller must re-authenticate (re-request an access token) instead.
 *
 * Options are injectable for testing.
 */
export async function apiGet(
  path,
  token,
  { retries = DEFAULT_RETRIES, fetchImpl = fetch, sleep = defaultSleep } = {}
) {
  const url = `${API}/${path}`;
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (netErr) {
      if (attempt < retries) {
        await sleep(backoffDelay(attempt));
        attempt += 1;
        continue;
      }
      const err = new Error(`Không kết nối được Google Sheets: ${netErr.message || netErr}`);
      err.cause = netErr;
      throw err;
    }

    if (res.ok) return res.json();

    const status = res.status;
    if (status === 401) {
      const err = new Error('Phiên đăng nhập Google đã hết hạn. Hãy kết nối lại Google rồi thử lại.');
      err.status = 401;
      err.authError = true;
      throw err;
    }

    if (isRetryable(status) && attempt < retries) {
      const retryAfter = Number(res.headers?.get?.('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffDelay(attempt);
      await sleep(Math.min(delay, MAX_DELAY_MS * 2));
      attempt += 1;
      continue;
    }

    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch {
      /* ignore */
    }
    const err = new Error(`Google Sheets API lỗi ${status}${detail ? `: ${detail}` : ''}`);
    err.status = status;
    throw err;
  }
}

export function parseSpreadsheetId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  const m2 = s.match(/^([a-zA-Z0-9-_]{20,})$/);
  return m2 ? m2[1] : null;
}

export async function getSpreadsheetMeta(spreadsheetId, token) {
  const data = await apiGet(
    `${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title,gridProperties)`,
    token
  );
  return {
    title: data.properties?.title || '',
    sheets: (data.sheets || []).map((s) => ({
      id: s.properties?.sheetId,
      title: s.properties?.title,
      rows: s.properties?.gridProperties?.rowCount,
      cols: s.properties?.gridProperties?.columnCount,
    })),
  };
}

export async function getSheetValues(spreadsheetId, sheetTitle, token) {
  const range = `${encodeURIComponent(sheetTitle)}!A:ZZ`;
  const data = await apiGet(
    `${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    token
  );
  return data.values || [];
}
