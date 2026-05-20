import { useState, useMemo, useCallback, useEffect } from "react";
import { fetchQuote } from "./services/yahooService.js";
import { analyzeStock } from "./utils/scoring.js";
import { analyzeCrypto } from "./utils/cryptoScoring.js";
import StockCard from "./components/StockCard.jsx";

const STOCK_STORAGE_KEY = "stockRadarTickers";
const CRYPTO_STORAGE_KEY = "stockRadarCryptoTickers";
const DEFAULT_TICKERS = [
  "ITUB4",
  "BBDC4",
  "BBAS3",
  "SANB4",
  "PETR4",
  "PRIO3",
  "VALE3",
  "USIM5",
  "MGLU3",
  "LREN3",
  "ALOS3",
  "AXIA3",
  "TAEE11",
  "CPFE3",
  "MRVE3",
  "CYRE3",
  "EZTC3",
  "RAIL3",
  "WEGE3",
  "SUZB3",
  "POMO4",
  "IRBR3",
  "RENT3",
  "GGBR4",
  "COGN3",
  "CXSE3",
  "SIMH3",
  "B3SA3",
  "CMIG4",
  "ORVR3",
  "VBBR3",
];
const DEFAULT_CRYPTO_TICKERS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "ARBUSDT",
  "SUIUSDT",
];
const TABS = [
  { key: "stocks", label: "Ações" },
  { key: "crypto", label: "Criptos" },
];

function loadSavedTickers(storageKey, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean);
  } catch (error) {
    console.warn("Failed to load saved tickers", error);
  }
  return fallback;
}

function getTickerList(input) {
  return input
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}

const FILTER_OPTIONS = [
  { key: "all", label: "Todas", className: "all" },
  { key: "COMPRA_FORTE", label: "Compra Forte", className: "compra_forte" },
  { key: "COMPRA", label: "Compra", className: "compra" },
  { key: "OBSERVACAO", label: "Observação", className: "observacao" },
  { key: "PULLBACK", label: "Pullback", className: "pullback" },
  { key: "ATENÇÃO", label: "Atenção", className: "atencao" },
  { key: "ESTICADO", label: "Esticado", className: "esticado" },
  { key: "RANGE", label: "Range", className: "range" },
  { key: "EVITAR", label: "Evitar", className: "evitar" },
];


// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("stocks");
  const [tickerInputs, setTickerInputs] = useState(() => ({
    stocks: loadSavedTickers(STOCK_STORAGE_KEY, DEFAULT_TICKERS).join(", "),
    crypto: loadSavedTickers(CRYPTO_STORAGE_KEY, DEFAULT_CRYPTO_TICKERS).join(", "),
  }));
  const [newTicker, setNewTicker] = useState("");
  const [results, setResults] = useState({ stocks: [], crypto: [] });
  const [errors, setErrors] = useState({ stocks: [], crypto: [] });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastScan, setLastScan] = useState({ stocks: null, crypto: null });
  const [filter, setFilter] = useState("all");
  const [scanDone, setScanDone] = useState({ stocks: false, crypto: false });
  const [proxyStatus, setProxyStatus] = useState("");

  const tickerInput = tickerInputs[activeTab];
  const tickers = useMemo(() => getTickerList(tickerInput), [tickerInput]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(getTickerList(tickerInputs.stocks)));
      localStorage.setItem(CRYPTO_STORAGE_KEY, JSON.stringify(getTickerList(tickerInputs.crypto)));
    } catch (error) {
      console.warn("Failed to save tickers", error);
    }
  }, [tickerInputs]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setScanDone((prev) => ({ ...prev, [activeTab]: false }));
    setResults((prev) => ({ ...prev, [activeTab]: [] }));
    setErrors((prev) => ({ ...prev, [activeTab]: [] }));
    setProgress({ done: 0, total: tickers.length });
    setProxyStatus("Coletando dados...");

    const good = [];
    const bad = [];

    // Concurrency control: for crypto, allow up to 2 concurrent requests; for stocks, keep sequential
    const concurrency = activeTab === "crypto" ? 2 : 1;
    const delayBetweenStarts = activeTab === "crypto" ? 500 : 0; // ms

    let index = 0;
    let inFlight = 0;

    await new Promise((resolve) => {
      const tryStart = () => {
        while (inFlight < concurrency && index < tickers.length) {
          const ticker = tickers[index++];
          inFlight++;

          (async (t) => {
            try {
              setProxyStatus(`Buscando ${t}...`);
              const raw = await fetchQuote(t, activeTab);
              const analyzed = activeTab === "crypto" ? analyzeCrypto(raw) : analyzeStock(raw);
              good.push(analyzed);
            } catch (error) {
              bad.push({ ticker: t, msg: error?.message || "Erro desconhecido" });
            } finally {
              inFlight--;
              setProgress({ done: Math.min(good.length + bad.length, tickers.length), total: tickers.length });
              setResults((prev) => ({ ...prev, [activeTab]: [...good].sort((a, b) => b.score - a.score) }));
              // start next after a small delay when in crypto mode
              if (delayBetweenStarts > 0) {
                setTimeout(() => {
                  if (index >= tickers.length && inFlight === 0) resolve();
                  else tryStart();
                }, delayBetweenStarts);
              } else {
                if (index >= tickers.length && inFlight === 0) resolve();
                else tryStart();
              }
            }
          })(ticker);

          // if we scheduled a start delay between tasks, break to let timer handle next start
          if (delayBetweenStarts > 0) break;
        }

        // all done
        if (index >= tickers.length && inFlight === 0) resolve();
      };

      tryStart();
    });

    setErrors((prev) => ({ ...prev, [activeTab]: bad }));
    setLastScan((prev) => ({ ...prev, [activeTab]: new Date() }));
    setLoading(false);
    setScanDone((prev) => ({ ...prev, [activeTab]: true }));
    setProxyStatus("");
  }, [tickers, activeTab]);

  const addTicker = () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    if (!tickers.includes(ticker)) {
      setTickerInputs((prev) => ({ ...prev, [activeTab]: [...tickers, ticker].join(", ") }));
    }
    setNewTicker("");
  };

  const removeTicker = (ticker) => {
    setTickerInputs((prev) => ({ ...prev, [activeTab]: tickers.filter((item) => item !== ticker).join(", ") }));
  };

  const currentResults = results[activeTab];
  const currentErrors = errors[activeTab];
  const currentScanDone = scanDone[activeTab];
  const currentLastScan = lastScan[activeTab];

  const filteredResults = useMemo(() => {
    if (filter === "all") return currentResults;
    return currentResults.filter((item) => item.category === filter);
  }, [filter, currentResults]);

  const counts = useMemo(
    () => FILTER_OPTIONS.reduce((acc, option) => {
      acc[option.key] = option.key === "all"
        ? currentResults.length
        : currentResults.filter((item) => item.category === option.key).length;
      return acc;
    }, {}),
    [currentResults]
  );

  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#060a0f;--surf:#0c1118;--surf2:#131a23;--border:#1e2733;
          --grn:#38c768;--red:#f5534a;--amber:#e8b84b;--blue:#4da8ff;--purple:#b78aff;
          --text:#dde6f0;--muted:#6a7585;
          --mono:'JetBrains Mono',monospace;--display:'Syne',sans-serif;
        }
        body{background:var(--bg);color:var(--text);font-family:var(--display);min-height:100vh}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
        .app{max-width:1360px;margin:0 auto;padding:28px 18px}

        .hdr{margin-bottom:22px}
        .logo{font-size:30px;font-weight:800;letter-spacing:-1.5px;background:linear-gradient(120deg,#4da8ff 20%,#38c768);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .sub{font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:3px}
        .last{font-size:11px;color:var(--blue);font-family:var(--mono);margin-top:3px}

        .tab-bar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}
        .tab{padding:10px 18px;border-radius:999px;background:var(--surf);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;cursor:pointer;transition:all .2s}
        .tab:hover{border-color:var(--blue)}
        .tab.active{background:linear-gradient(135deg,#1e8c3a,#1a5fb5);color:#fff;border-color:transparent;box-shadow:0 10px 30px rgba(0,0,0,.12)}

        .ctrl{background:var(--surf);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px}
        .ctrl-title{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px}
        .chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
        .chip{display:flex;align-items:center;gap:5px;background:var(--surf2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text)}
        .chip-x{cursor:pointer;color:var(--muted);background:none;border:none;font-size:15px;line-height:1;padding:0;transition:color .15s}
        .chip-x:hover{color:var(--red)}
        .add-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .add-in{background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--mono);font-size:13px;font-weight:700;text-transform:uppercase;width:120px;outline:none;transition:border-color .2s}
        .add-in:focus{border-color:var(--blue)}
        .add-in::placeholder{text-transform:none;font-weight:400;color:var(--muted)}
        .btn{padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-family:var(--display);font-weight:700;font-size:13px;transition:all .2s;white-space:nowrap}
        .btn-add{background:var(--surf2);border:1px solid var(--border);color:var(--text)}
        .btn-add:hover{border-color:var(--blue);color:var(--blue)}
        .btn-scan{background:linear-gradient(135deg,#1a5fb5,#1e8c3a);color:#fff;padding:10px 26px;font-size:14px;margin-left:auto;display:block;margin-top:14px}
        .btn-scan:hover:not(:disabled){filter:brightness(1.15);transform:translateY(-1px)}
        .btn-scan:disabled{opacity:.45;cursor:not-allowed}

        .prog{margin-bottom:16px}
        .prog-txt{font-size:11px;color:var(--muted);font-family:var(--mono);margin-bottom:5px}
        .prog-wrap{height:4px;background:var(--border);border-radius:2px;overflow:hidden}
        .prog-bar{height:100%;background:linear-gradient(90deg,var(--blue),var(--grn));border-radius:2px;transition:width .3s}

        .fbar{display:flex;gap:9px;margin-bottom:16px;flex-wrap:wrap}
        .fpill{display:flex;align-items:center;gap:7px;padding:6px 14px;border-radius:999px;cursor:pointer;font-size:12px;font-weight:700;border:1.5px solid;transition:all .2s}
        .fpill-all{border-color:var(--border);color:var(--muted)}.fpill-all.active,.fpill-all:hover{border-color:var(--blue);color:var(--blue)}
        .fpill-compra_forte{border-color:var(--grn);color:var(--grn)}.fpill-compra_forte.active{background:rgba(56,199,104,.1)}
        .fpill-compra{border-color:var(--blue);color:var(--blue)}.fpill-compra.active{background:rgba(77,168,255,.08)}
        .fpill-observacao{border-color:#d28d1b;color:#d28d1b}.fpill-observacao.active{background:rgba(210,141,27,.1)}
        .fpill-pullback{border-color:#f3c13a;color:#f3c13a}.fpill-pullback.active{background:rgba(243,193,58,.12)}
        .fpill-atencao{border-color:var(--amber);color:var(--amber)}.fpill-atencao.active{background:rgba(232,184,75,.1)}
        .fpill-esticado{border-color:var(--red);color:var(--red)}.fpill-esticado.active{background:rgba(245,83,74,.1)}
        .fpill-range{border-color:var(--purple);color:var(--purple)}.fpill-range.active{background:rgba(183,138,255,.1)}
        .fpill-evitar{border-color:var(--muted);color:var(--muted)}.fpill-evitar.active{background:rgba(106,117,133,.1)}
        .fcount{background:currentColor;color:var(--bg);width:19px;height:19px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}

        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:15px}

        .card{background:var(--surf);border:1px solid var(--border);border-radius:14px;padding:18px;position:relative;overflow:hidden;animation:fadeUp .5s ease both;transition:transform .2s,box-shadow .2s}
        .card:hover{transform:translateY(-3px);box-shadow:0 8px 32px rgba(0,0,0,.4)}
        .card-buy{border-color:rgba(56,199,104,.3)}.card-watch{border-color:rgba(232,184,75,.25)}
        @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}

        .stripe{position:absolute;top:0;left:0;right:0;height:3px;border-radius:14px 14px 0 0}
        .stripe-buy{background:linear-gradient(90deg,#38c768,#1e8c3a)}
        .stripe-watch{background:linear-gradient(90deg,#e8b84b,#c97d1a)}
        .stripe-wait{background:var(--border)}

        .ch{display:flex;justify-content:space-between;align-items:flex-start;margin:10px 0;gap:8px}
        .cticker{font-family:var(--mono);font-size:22px;font-weight:700;letter-spacing:-.5px}
        .cname{font-size:10px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}
        .cdelta{font-family:var(--mono);font-size:12px;font-weight:700;margin-top:4px}
        .cdelta.pos{color:var(--grn)}.cdelta.neg{color:var(--red)}
        .cprice{font-family:var(--mono);font-size:18px;font-weight:700}
        .badge{font-size:9px;font-weight:800;letter-spacing:1.2px;padding:3px 9px;border-radius:4px;margin-top:5px;display:inline-block}
        .badge-buy{background:rgba(56,199,104,.15);color:var(--grn);border:1px solid rgba(56,199,104,.3)}
        .badge-watch{background:rgba(232,184,75,.15);color:var(--amber);border:1px solid rgba(232,184,75,.3)}
        .badge-wait{background:rgba(106,117,133,.1);color:var(--muted);border:1px solid rgba(106,117,133,.2)}
        .cscore{font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px}

        .pips{display:flex;align-items:center;gap:5px;margin-bottom:13px}
        .pip{width:20px;height:5px;border-radius:2px;background:var(--border)}
        .pip-buy{background:var(--grn)}.pip-watch{background:var(--amber)}.pip-wait{background:var(--muted)}
        .rr-tag{font-family:var(--mono);font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-left:6px}
        .rr-tag.good{background:rgba(56,199,104,.12);color:var(--grn);border:1px solid rgba(56,199,104,.2)}
        .rr-tag.ok{background:rgba(232,184,75,.12);color:var(--amber);border:1px solid rgba(232,184,75,.2)}
        .rr-tag.bad{background:rgba(245,83,74,.12);color:var(--red);border:1px solid rgba(245,83,74,.2)}

        .block{background:var(--surf2);border-radius:9px;padding:11px;margin-bottom:9px}
        .block-title{font-size:9px;font-weight:700;color:var(--muted);letter-spacing:1.3px;text-transform:uppercase;margin-bottom:9px}
        .ema-row{display:flex;margin-bottom:9px}
        .ema-col{flex:1;display:flex;flex-direction:column;gap:2px}
        .ema-lbl{font-size:9px;color:var(--muted);font-family:var(--mono)}
        .ema-val{font-size:13px;font-weight:700;font-family:var(--mono);color:var(--blue)}
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .bar-track{position:relative;height:5px;background:var(--border);border-radius:3px;margin-bottom:5px}
        .bar-fill{position:absolute;top:0;left:0;height:100%;border-radius:3px;transition:width .9s ease}
        .bar-val{position:absolute;right:0;top:-16px;font-size:10px;font-family:var(--mono);color:var(--text)}
        .stoch-l{font-size:9px;color:var(--muted);font-family:var(--mono);display:block;margin-bottom:1px}
        .chk{display:flex;align-items:center;gap:6px;margin-top:5px}
        .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .dot.ok{background:var(--grn);box-shadow:0 0 6px var(--grn)}.dot.fail{background:var(--red)}
        .chk-ok{font-size:11px;color:var(--text)}.chk-fail{font-size:11px;color:var(--muted)}

        .sr-block{cursor:default}
        .sr-top{display:flex;justify-content:space-between;align-items:center;cursor:pointer}
        .sr-tags{display:flex;align-items:center;gap:5px}
        .sr-tag-s{font-family:var(--mono);font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(56,199,104,.12);color:var(--grn);border:1px solid rgba(56,199,104,.25)}
        .sr-tag-r{font-family:var(--mono);font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(245,83,74,.12);color:var(--red);border:1px solid rgba(245,83,74,.25)}
        .expand-btn{font-size:10px;color:var(--muted)}
        .alert-r{font-size:11px;font-weight:600;padding:6px 10px;border-radius:6px;margin-top:8px;background:rgba(245,83,74,.1);color:var(--red);border:1px solid rgba(245,83,74,.2)}
        .alert-s{font-size:11px;font-weight:600;padding:6px 10px;border-radius:6px;margin-top:8px;background:rgba(56,199,104,.1);color:var(--grn);border:1px solid rgba(56,199,104,.2)}
        .sr-body{margin-top:12px;display:flex;flex-direction:column;gap:3px}
        .sr-group-title{font-size:9px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin:6px 0 4px}
        .sr-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;border:1px solid}
        .sr-x{font-size:10px;background:rgba(255,255,255,.06);padding:1px 5px;border-radius:3px;color:var(--muted);font-family:var(--mono)}
        .sr-dist{font-family:var(--mono);font-size:11px;margin-left:auto}
        .mini-chart{position:relative;height:120px;background:var(--bg);border-radius:7px;border:1px solid var(--border);overflow:hidden;margin-bottom:10px}
        .mc-row{position:absolute;left:0;right:0;display:flex;align-items:center;gap:8px;padding:0 10px;transform:translateY(50%)}
        .mc-line{height:1px;flex:1}.mc-lbl{font-family:var(--mono);font-size:10px;white-space:nowrap}
        .candle-info{font-size:10px;color:var(--muted);font-family:var(--mono);text-align:right;margin-top:6px}

        .err-box{background:rgba(245,83,74,.07);border:1px solid rgba(245,83,74,.2);border-radius:10px;padding:12px 16px;margin-bottom:16px}
        .err-title{font-size:11px;font-weight:700;color:var(--red);margin-bottom:8px}
        .err-list{display:flex;flex-wrap:wrap;gap:7px}
        .err-item{font-family:var(--mono);font-size:11px;background:rgba(245,83,74,.1);color:var(--red);padding:3px 8px;border-radius:5px}

        .warn-box{background:rgba(232,184,75,.07);border:1px solid rgba(232,184,75,.25);border-radius:10px;padding:14px 16px;margin-bottom:16px;font-size:12px;color:var(--amber);font-family:var(--mono);line-height:1.8}
        .warn-box strong{color:var(--text)}
        .warn-box code{background:var(--surf2);padding:2px 6px;border-radius:4px;font-size:11px}

        .loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:16px}
        .spinner{width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--grn);border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .load-txt{color:var(--muted);font-family:var(--mono);font-size:13px}
        .load-sub{color:var(--blue);font-family:var(--mono);font-size:11px}
        .empty{text-align:center;padding:70px 20px;color:var(--muted)}
        .empty-ico{font-size:52px;margin-bottom:12px}

        .legend{margin-top:28px;padding:16px;background:var(--surf2);border-radius:10px;border:1px solid var(--border);font-size:11px;color:var(--muted);line-height:2;font-family:var(--mono)}
        .legend strong{color:var(--text)}

        @media (max-width: 900px) {
          .app { padding: 20px 12px; }
          .ctrl { padding: 16px; }
          .chips { gap: 6px; }
          .add-row { flex-direction: column; align-items: stretch; }
          .add-in, .btn-add, .btn-scan { width: 100%; }
          .btn-scan { margin-left: 0; margin-top: 10px; }
          .grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
          .two-col { grid-template-columns: 1fr; }
          .card-header { flex-direction: column; align-items: stretch; }
          .card { padding: 16px; }
          .sr-row { flex-direction: column; align-items: flex-start; }
          .sr-row .sr-dist { margin-left: 0; }
        }

        @media (max-width: 620px) {
          body { font-size: 14px; }
          .logo { font-size: 26px; }
          .sub, .last, .ctrl-title, .block-title, .cscore, .cdelta, .rr-tag, .chip { font-size: 11px; }
          .card { padding: 14px; }
          .pips { flex-wrap: wrap; gap: 6px; }
          .fbar { flex-direction: column; }
          .fpill { width: 100%; justify-content: center; }
          .mini-chart { height: 100px; }
        }

        .header-right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
        .ticker{font-family:var(--mono);font-size:22px;font-weight:800;letter-spacing:-0.5px}
        .name{font-size:12px;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
        .delta{font-family:var(--mono);font-size:12px;margin-top:7px}
        .delta.pos{color:var(--grn)}.delta.neg{color:var(--red)}
        .price{font-family:var(--mono);font-size:18px;font-weight:800}
        .pill{font-size:10px;font-weight:700;text-transform:uppercase;padding:5px 10px;border-radius:999px;border:1px solid;display:inline-flex;align-items:center;gap:5px}
        .pill-compra_forte{color:#2a6f38;border-color:rgba(56,199,104,.3);background:rgba(56,199,104,.08)}
        .pill-compra{color:#2a72d2;border-color:rgba(77,168,255,.3);background:rgba(77,168,255,.08)}
        .pill-observacao{color:#d28d1b;border-color:rgba(210,141,27,.3);background:rgba(210,141,27,.08)}
        .pill-pullback{color:#f3c13a;border-color:rgba(243,193,58,.3);background:rgba(243,193,58,.08)}
        .pill-atencao{color:#b47b1d;border-color:rgba(232,184,75,.3);background:rgba(232,184,75,.08)}
        .pill-esticado{color:#b72f23;border-color:rgba(245,83,74,.3);background:rgba(245,83,74,.08)}
        .pill-range{color:#6745a7;border-color:rgba(183,138,255,.3);background:rgba(183,138,255,.08)}
        .pill-evitar{color:#7d8698;border-color:rgba(106,117,133,.3);background:rgba(106,117,133,.08)}
        .score-badge{font-family:var(--mono);font-size:11px;font-weight:700;padding:4px 8px;border-radius:999px}
        .score-strong{background:rgba(56,199,104,.14);color:var(--grn)}
        .score-good{background:rgba(77,168,255,.14);color:var(--blue)}
        .score-fair{background:rgba(232,184,75,.14);color:var(--amber)}
        .score-weak{background:rgba(245,83,74,.14);color:var(--red)}
        .trend-badge{font-family:var(--mono);font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px}
        .trend-up{background:rgba(56,199,104,.12);color:var(--grn)}
        .trend-down{background:rgba(245,83,74,.12);color:var(--red)}
        .trend-range{background:rgba(183,138,255,.12);color:var(--purple)}
        .trend-transition{background:rgba(77,168,255,.12);color:var(--blue)}
        .info-badge{font-size:10px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.05);color:var(--text);border:1px solid rgba(255,255,255,.08)}
        .card-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
        .badge-row{display:flex;flex-wrap:wrap;gap:10px;padding:0 18px 18px}
        .card-compra_forte{border-color:rgba(56,199,104,.3)}
        .card-compra{border-color:rgba(77,168,255,.3)}
        .card-observacao{border-color:rgba(210,141,27,.3)}
        .card-pullback{border-color:rgba(243,193,58,.3)}
        .card-atencao{border-color:rgba(232,184,75,.3)}
        .card-esticado{border-color:rgba(245,83,74,.3)}
        .card-range{border-color:rgba(183,138,255,.3)}
        .card-evitar{border-color:rgba(106,117,133,.3)}
        .stripe-compra_forte{background:linear-gradient(90deg,#38c768,#1e8c3a)}
        .stripe-compra{background:linear-gradient(90deg,#4da8ff,#2a72d2)}
        .stripe-observacao{background:linear-gradient(90deg,#d2aa3f,#b47e18)}
        .stripe-pullback{background:linear-gradient(90deg,#f3c13a,#d18a16)}
        .stripe-atencao{background:linear-gradient(90deg,#e8b84b,#c97d1a)}
        .stripe-esticado{background:linear-gradient(90deg,#f5534a,#d8323)}
        .stripe-range{background:linear-gradient(90deg,#b78aff,#7f59d1)}
        .stripe-evitar{background:linear-gradient(90deg,#7d8698,#5f6571)}
        .metrics-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:0 18px 18px}
        .metric{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}
        .metric span{font-size:10px;color:var(--muted);text-transform:uppercase}
        .metric strong{font-size:14px;font-weight:700}
        .flex-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:0 18px 18px}
        .mini-block{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;text-align:center}
        .mini-block span{display:block;font-size:10px;color:var(--muted);text-transform:uppercase}
        .mini-block strong{display:block;margin-top:6px;font-size:14px;font-weight:700}
        .pattern-row{display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 18px}
        .pattern-badge{font-size:10px;padding:4px 8px;border-radius:999px;background:rgba(77,168,255,.12);color:var(--blue)}
        .summary-card{padding:0 18px 18px;display:flex;flex-direction:column;gap:8px}
        .summary-copy{font-size:11px;line-height:1.6;color:var(--text);}
        .summary-factors{display:flex;flex-wrap:wrap;gap:8px}
        .summary-chip{font-size:10px;padding:5px 9px;border-radius:999px;white-space:nowrap}
        .summary-chip-positive{background:rgba(56,199,104,.1);border:1px solid rgba(56,199,104,.2);color:var(--grn)}
        .summary-chip-negative{background:rgba(245,83,74,.1);border:1px solid rgba(245,83,74,.2);color:var(--red)}
      `}</style>

      <div className="app">
        <div className="hdr">
          <div className="logo">📈 StockRadar</div>
          <div className="sub">Análise Técnica · Yahoo Finance / Bybit · Dados Reais</div>
          {currentLastScan && <div className="last">Último scan: {currentLastScan.toLocaleTimeString("pt-BR")} · {currentLastScan.toLocaleDateString("pt-BR")}</div>}
        </div>

        <div className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!currentScanDone && !loading && (
          <div className="warn-box">
            <strong>⚠️ Importante:</strong> o scanner crypto usa Bybit API via backend, o scanner de ações usa Yahoo Finance. O app evita CORS no navegador usando API interna.
          </div>
        )}

        <div className="ctrl">
          <div className="ctrl-title">{activeTab === "crypto" ? "Lista de Criptos (Bybit)" : "Lista de Ações (B3)"}</div>
          <div className="chips">
            {tickers.map((t) => (
              <div key={t} className="chip">
                {t}
                <button className="chip-x" onClick={() => removeTicker(t)}>×</button>
              </div>
            ))}
          </div>
          <div className="add-row">
            <input
              className="add-in"
              placeholder={activeTab === "crypto" ? "ex: BTCUSDT" : "ex: ITSA4"}
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              maxLength={activeTab === "crypto" ? 12 : 6}
            />
            <button className="btn btn-add" onClick={addTicker}>+ Adicionar</button>
          </div>
          <button className="btn btn-scan" onClick={runAnalysis} disabled={loading}>
            {loading ? `🔍 ${proxyStatus || "Carregando..."} (${progress.done}/${progress.total})` : `🚀 ${activeTab === "crypto" ? "Rodar Scanner de Criptos" : "Rodar Scanner de Ações"}`}
          </button>
        </div>

        {loading && (
          <div className="prog">
            <div className="prog-txt">{progress.done}/{progress.total} ativos · {progressPct}% {proxyStatus && `· ${proxyStatus}`}</div>
            <div className="prog-wrap"><div className="prog-bar" style={{width:`${progressPct}%`}}/></div>
          </div>
        )}

        {currentErrors.length > 0 && (
          <div className="err-box">
            <div className="err-title">⚠ Falha em {currentErrors.length} ativo(s)</div>
            <div className="err-list">
              {currentErrors.map((e) => (
                <span key={e.ticker} className="err-item" title={e.msg}>{e.ticker}: {e.msg}</span>
              ))}
            </div>
          </div>
        )}

        {currentScanDone && currentResults.length > 0 && (
          <div className="fbar">
            {FILTER_OPTIONS.map((option) => (
              <div
                key={option.key}
                className={`fpill fpill-${option.className} ${filter === option.key ? "active" : ""}`}
                onClick={() => setFilter(option.key)}
              >
                <span className="fcount">{counts[option.key] || 0}</span>
                {option.label}
              </div>
            ))}
          </div>
        )}

        {loading && currentResults.length === 0 ? (
          <div className="loading">
            <div className="spinner" />
            <div className="load-txt">Buscando dados reais de {activeTab === "crypto" ? "criptos" : "ações"}...</div>
            <div className="load-sub">{proxyStatus}</div>
          </div>
        ) : filteredResults.length > 0 ? (
          <div className="grid">
            {filteredResults.map((item, index) => (
              <StockCard key={item.ticker} data={item} index={index} />
            ))}
          </div>
        ) : currentScanDone && !loading ? (
          <div className="empty"><div className="empty-ico">🔎</div>Nenhum ativo nesta categoria.</div>
        ) : !currentScanDone ? (
          <div className="empty">
            <div className="empty-ico">📊</div>
            <div>Clique em <strong>{activeTab === "crypto" ? "Rodar Scanner de Criptos" : "Rodar Scanner de Ações"}</strong> para buscar dados reais</div>
          </div>
        ) : null}

        {currentScanDone && (
          <div className="legend">
            <strong>Critérios (4H / 1H):</strong> EMA 20&gt;50&gt;100 · Preço acima EMAs · Volume + momentum · Pullback saudável · Multi-timeframe<br/>
            <strong>S&amp;R:</strong> Pivôs de 4H · Confluência = nível mais forte · Clique no card para ver<br/>
            <strong>R/R:</strong> ≥1.8x 🟢 ótimo · 1–1.8x 🟡 aceitável · &lt;1x 🔴 ruim<br/>
            <strong>COMPRA FORTE</strong> = setup agressivo + confirmação 1H + volume elevado · <strong>COMPRA</strong> = alto potencial · <strong>OBSERVAÇÃO</strong> = ativo enfraquecido, aguardando reação · <strong>PULLBACK</strong> = correção estruturada acima da EMA100 · <strong>ESTICADO</strong> / <strong>EVITAR</strong> = deterioração estrutural real
          </div>
        )}
      </div>
    </>
  );
}
