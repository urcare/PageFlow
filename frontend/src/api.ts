const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const API = rawApiUrl.replace(/\/+$/, '').endsWith('/api')
  ? rawApiUrl.replace(/\/+$/, '')
  : `${rawApiUrl.replace(/\/+$/, '')}/api`;

export const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

export const TOKEN_KEY = 'pageflow-auth-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token) {
    headers.set('Authorization', 'Bearer ' + token);
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  const response = await fetch(`${API}${cleanPath}`, {
    ...options,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }

    const apiPayload = payload as { error?: string; details?: string };
    const message = apiPayload.details && import.meta.env.DEV
      ? `${apiPayload.error || 'Request failed.'} ${apiPayload.details}`
      : (apiPayload.error || 'Request failed.');

    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const trackEvent = (
  slug: string,
  event_type: 'page_view' | 'cta1_click' | 'cta2_click'
) => {
  const url = `${API}/public/pages/${encodeURIComponent(slug)}/events`;
  const body = JSON.stringify({ event_type });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], {
      type: 'application/json'
    });

    navigator.sendBeacon(url, blob);
    return;
  }

  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body,
    keepalive: true
  }).catch(() => undefined);
};
