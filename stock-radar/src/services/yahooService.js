const API_BASE = '/api';

function ensureOk(response, body) {
  if (!response.ok) {
    throw new Error(body?.error || `Erro na API: ${response.status}`);
  }
  if (!body?.success) {
    throw new Error(body?.error || 'Resposta inválida da API');
  }
  return body.data;
}

async function requestApi(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  const body = await res.json();
  return ensureOk(res, body);
}

export async function fetchQuote(ticker, market = 'stocks') {
  if (!ticker) {
    throw new Error('Ticker inválido');
  }
  const endpoint = market === 'crypto' ? `${API_BASE}/cryptoQuote` : `${API_BASE}/quote`;
  return requestApi(endpoint, { ticker });
}

export async function fetchHistory(ticker, interval = '1d', range = '6mo') {
  if (!ticker) {
    throw new Error('Ticker inválido');
  }
  return requestApi(`${API_BASE}/history`, { ticker, interval, range });
}
