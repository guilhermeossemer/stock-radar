import { fetchYahooHistory } from './yahoo.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const ticker = Array.isArray(req.query.ticker) ? req.query.ticker[0] : req.query.ticker;
  const interval = Array.isArray(req.query.interval) ? req.query.interval[0] : req.query.interval || '1d';
  const range = Array.isArray(req.query.range) ? req.query.range[0] : req.query.range || '6mo';

  if (!ticker) {
    return res.status(400).json({ success: false, error: 'Parâmetro ticker é obrigatório' });
  }

  try {
    const data = await fetchYahooHistory(ticker, interval, range);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[api/history] ', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
