import { fetchQuoteData } from './yahoo.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const ticker = Array.isArray(req.query.ticker) ? req.query.ticker[0] : req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ success: false, error: 'Parâmetro ticker é obrigatório' });
  }

  try {
    const data = await fetchQuoteData(ticker);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[api/quote] ', error);
    return res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
}
