const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const USERINFO_SCOPES = 'openid email profile';

let scriptPromise = null;

export function loadGisScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const script = existing || document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google Identity Services tải xong nhưng không khả dụng.'));
    };
    script.onerror = () => reject(new Error('Không tải được Google Identity Services. Kiểm tra kết nối mạng.'));
    if (!existing) document.head.append(script);
  });
  return scriptPromise;
}

export async function requestAccessToken({ clientId, scope = SHEETS_SCOPE }) {
  if (!clientId) throw new Error('Chưa cấu hình Google OAuth Client ID.');
  await loadGisScript();
  return new Promise((resolve, reject) => {
    let settled = false;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: `${scope} ${USERINFO_SCOPES}`,
      callback: (resp) => {
        if (settled) return;
        settled = true;
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        resolve({
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3600 * 1000),
          scope: resp.scope,
        });
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(err?.message || 'Đăng nhập Google bị hủy hoặc bị chặn.'));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export function revokeToken(accessToken) {
  if (!accessToken || !window.google?.accounts?.oauth2?.revoke) return Promise.resolve();
  return new Promise((resolve) => {
    window.google.accounts.oauth2.revoke(accessToken, () => resolve());
  });
}

export async function fetchUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}
