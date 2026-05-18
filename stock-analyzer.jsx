import { useState, useCallback } from "react";

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
  "BPAC11",
  "BBSE3",
  "CSNA3",
  "EQTL3",
  "EGIE3",
  "TRPL4",
  "TOTS3",
  "HAPV3",
  "RDOR3",
  "GOAU4",
  "RRRP3",
  "VAMO3"
];

// ─── FETCH COM MÚLTIPLOS PROXIES ─────────────────────────────────────────────
const YF_URL = (symbol) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d&includePrePost=false`;

const PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
  (url) => url, // tenta direto (pode funcionar em alguns browsers)
];

async function fetchWithFallback(rawUrl) {
  for (const makeProxy of PROXIES) {
    const proxyUrl = makeProxy(rawUrl);
    try {
      const res = await fetch(proxyUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.startsWith("<!")) continue; // HTML = erro
      const json = JSON.parse(text);
      if (json?.chart?.result?.[0]) return json;
    } catch (_) {
      // tenta próximo proxy
    }
  }
  throw new Error("Todos os proxies falharam");
}

async function fetchQuote(ticker) {
  const symbol = ticker.toUpperCase().endsWith(".SA") ? ticker : `${ticker}.SA`;
  const json = await fetchWithFallback(YF_URL(symbol));

  const result = json.chart.result[0];
  const q = result.indicators?.quote?.[0] || {};
  const ts = result.timestamp || [];
  const closes  = q.close  || [];
  const highs   = q.high   || [];
  const lows    = q.low    || [];
  const opens   = q.open   || [];
  const volumes = q.volume || [];

  const candles = [];
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] != null && highs[i] != null && lows[i] != null) {
      candles.push({
        date: new Date(ts[i] * 1000),
        open:   opens[i]   ?? closes[i],
        high:   highs[i],
        low:    lows[i],
        close:  closes[i],
        volume: volumes[i] ?? 0,
      });
    }
  }

  if (candles.length < 20) throw new Error("Histórico insuficiente");

  const meta = result.meta || {};
  const currentPrice = meta.regularMarketPrice ?? candles.at(-1).close;
  const prevClose    = meta.previousClose ?? meta.chartPreviousClose ?? candles.at(-2)?.close ?? currentPrice;
  const dayChange    = ((currentPrice - prevClose) / prevClose) * 100;

  return {
    ticker,
    currentPrice,
    dayChange,
    longName: meta.longName || meta.shortName || ticker,
    candles,
  };
}

// ─── INDICADORES ──────────────────────────────────────────────────────────────
function calcEMA(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [ema];
  for (let i = period; i < prices.length; i++) { ema = prices[i] * k + ema * (1 - k); out.push(ema); }
  return out;
}

function calcRSI(prices, p = 14) {
  if (prices.length < p + 1) return null;
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) { const d = prices[i] - prices[i-1]; if (d > 0) ag += d; else al -= d; }
  ag /= p; al /= p;
  for (let i = p + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i-1];
    ag = (ag * (p-1) + Math.max(d, 0)) / p;
    al = (al * (p-1) + Math.max(-d, 0)) / p;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function calcStoch(highs, lows, closes, kP = 14, dP = 3) {
  if (closes.length < kP) return null;
  const ks = [];
  for (let i = kP - 1; i < closes.length; i++) {
    const h = Math.max(...highs.slice(i - kP + 1, i + 1));
    const l = Math.min(...lows.slice(i - kP + 1, i + 1));
    ks.push(h === l ? 50 : ((closes[i] - l) / (h - l)) * 100);
  }
  const ds = [];
  for (let i = dP - 1; i < ks.length; i++)
    ds.push(ks.slice(i - dP + 1, i + 1).reduce((a, b) => a + b, 0) / dP);
  return { k: ks.at(-1), d: ds.at(-1) };
}

function calcSR(candles) {
  const recent = candles.slice(-90);
  if (recent.length < 10) return { supports:[], resistances:[], nearestSupport:null, nearestResistance:null, riskReward:null, nearSupport:false, nearResistance:false };
  const highs = recent.map(c => c.high);
  const lows  = recent.map(c => c.low);
  const price = recent.at(-1).close;
  const win = 3;
  const pivH = [], pivL = [];
  for (let i = win; i < recent.length - win; i++) {
    if (highs.slice(i-win,i).every(v=>v<=highs[i]) && highs.slice(i+1,i+win+1).every(v=>v<=highs[i])) pivH.push(highs[i]);
    if (lows.slice(i-win,i).every(v=>v>=lows[i])   && lows.slice(i+1,i+win+1).every(v=>v>=lows[i]))   pivL.push(lows[i]);
  }
  function cluster(levels) {
    if (!levels.length) return [];
    const s = [...levels].sort((a,b)=>a-b);
    const cls = [[s[0]]];
    for (let i = 1; i < s.length; i++) {
      const last = cls.at(-1), avg = last.reduce((a,b)=>a+b,0)/last.length;
      if (Math.abs(s[i]-avg)/avg < 0.015) last.push(s[i]); else cls.push([s[i]]);
    }
    return cls.map(c=>({ price: c.reduce((a,b)=>a+b,0)/c.length, strength: c.length }));
  }
  const resistances = cluster(pivH).filter(l=>l.price>price).sort((a,b)=>a.price-b.price).slice(0,3);
  const supports    = cluster(pivL).filter(l=>l.price<price).sort((a,b)=>b.price-a.price).slice(0,3);
  const nr = resistances[0]||null, ns = supports[0]||null;
  const rr = nr&&ns ? (nr.price-price)/(price-ns.price) : null;
  return { supports, resistances, nearestSupport:ns, nearestResistance:nr, riskReward:rr,
    nearSupport: ns?(price-ns.price)/price<0.02:false, nearResistance: nr?(nr.price-price)/price<0.015:false };
}

function analyze({ ticker, currentPrice, dayChange, longName, candles }) {
  const closes = candles.map(c=>c.close), highs = candles.map(c=>c.high), lows = candles.map(c=>c.low);
  const ema20  = calcEMA(closes,20).at(-1);
  const ema50  = closes.length>=50  ? calcEMA(closes,50).at(-1)  : null;
  const ema100 = closes.length>=100 ? calcEMA(closes,100).at(-1) : null;
  const rsi    = calcRSI(closes);
  const stoch  = calcStoch(highs,lows,closes);
  const sr     = calcSR(candles);
  const emasAligned    = ema50&&ema100 ? ema20>ema50&&ema50>ema100 : ema50?ema20>ema50:false;
  const priceAboveEmas = currentPrice > ema20;
  const rsiOk          = rsi!==null && rsi>=40 && rsi<=70;
  const stochOk        = stoch && stoch.k<80 && stoch.d<80 && stoch.k>20;
  const stochCross     = stoch && stoch.k>stoch.d;
  const rec = closes.slice(-20);
  const trendUp = rec.slice(10).reduce((a,b)=>a+b,0)/10 > rec.slice(0,10).reduce((a,b)=>a+b,0)/10*1.005;
  const score = [emasAligned,priceAboveEmas,rsiOk,stochOk,trendUp].filter(Boolean).length;
  return {
    ticker, currentPrice, dayChange, longName,
    ema20, ema50, ema100, emasAligned, priceAboveEmas,
    rsi: rsi!==null ? parseFloat(rsi.toFixed(1)) : null, rsiOk,
    stochK: stoch?.k??null, stochD: stoch?.d??null, stochOk, stochCross,
    trendUp, score,
    buySignal:  score>=4 && !sr.nearResistance,
    watchSignal:score===3 || (score>=4 && sr.nearResistance),
    candleCount: closes.length, ...sr,
  };
}

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
const Dot = ({ok}) => <span className={`dot ${ok?"ok":"fail"}`}/>;

const Bar = ({value, max=100, color}) => (
  <div className="bar-track">
    <div className="bar-fill" style={{width:`${Math.min(((value??0)/max)*100,100)}%`,background:color}}/>
    <span className="bar-val">{value?.toFixed(1)??"–"}</span>
  </div>
);

function SRLine({price, currentPrice, type, strength}) {
  const dist = type==="R" ? (price-currentPrice)/currentPrice*100 : (currentPrice-price)/currentPrice*100;
  const col  = type==="R" ? "var(--red)" : "var(--grn)";
  const hot  = dist < 3;
  return (
    <div className="sr-row" style={{borderColor: hot?col:"transparent", background: hot?(type==="R"?"rgba(245,83,74,.07)":"rgba(56,199,104,.07)"):"transparent"}}>
      <span style={{color:col, fontWeight:700, fontFamily:"var(--mono)", fontSize:13}}>{type==="R"?"⛔":"🛡️"} R$ {price.toFixed(2)}</span>
      {strength>1 && <span className="sr-x">×{strength}</span>}
      <span className="sr-dist" style={{color: hot?col:"var(--muted)"}}>{dist.toFixed(1)}% {type==="R"?"↑":"↓"}</span>
    </div>
  );
}

function MiniChart({supports, resistances, currentPrice}) {
  const all = [...resistances.map(r=>({...r,t:"R"})), {price:currentPrice,t:"C",strength:0}, ...supports.map(s=>({...s,t:"S"}))].sort((a,b)=>b.price-a.price);
  if (all.length<2) return null;
  const top=all[0].price*1.01, bot=all.at(-1).price*0.99, span=top-bot||1;
  const cols = {R:"var(--red)",S:"var(--grn)",C:"var(--amber)"};
  return (
    <div className="mini-chart">
      {all.map((lvl,i)=>{
        const pct=((lvl.price-bot)/span)*100;
        return (
          <div key={i} className="mc-row" style={{bottom:`${pct}%`}}>
            <div className="mc-line" style={{background:cols[lvl.t],opacity:lvl.t==="C"?1:0.5}}/>
            <span className="mc-lbl" style={{color:cols[lvl.t]}}>{lvl.t==="C"?`▶ ${currentPrice.toFixed(2)}`:`R$ ${lvl.price.toFixed(2)}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function Card({data, i}) {
  const [exp, setExp] = useState(false);
  const sc    = data.buySignal?"buy":data.watchSignal?"watch":"wait";
  const label = data.buySignal?"COMPRA":data.watchSignal?"ATENÇÃO":"AGUARDAR";
  const rr    = data.riskReward;
  const rrCls = rr===null?"":rr>=2?"good":rr>=1?"ok":"bad";
  return (
    <div className={`card card-${sc}`} style={{animationDelay:`${i*55}ms`}}>
      <div className={`stripe stripe-${sc}`}/>
      <div className="ch">
        <div>
          <div className="cticker">{data.ticker}</div>
          <div className="cname" title={data.longName}>{data.longName}</div>
          <div className={`cdelta ${data.dayChange>=0?"pos":"neg"}`}>{data.dayChange>=0?"▲":"▼"} {Math.abs(data.dayChange??0).toFixed(2)}%</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div className="cprice">R$ {data.currentPrice?.toFixed(2)}</div>
          <div className={`badge badge-${sc}`}>{label}</div>
          <div className="cscore">{data.score}/5 critérios</div>
        </div>
      </div>
      <div className="pips">
        {[0,1,2,3,4].map(j=><div key={j} className={`pip ${j<data.score?`pip-${sc}`:""}`}/>)}
        {rr!==null && <span className={`rr-tag ${rrCls}`}>R/R {rr.toFixed(1)}x</span>}
      </div>
      <div className="block">
        <div className="block-title">Médias Móveis Exponenciais</div>
        <div className="ema-row">
          {[["EMA 20",data.ema20],["EMA 50",data.ema50],["EMA 100",data.ema100]].map(([l,v])=>(
            <div key={l} className="ema-col"><span className="ema-lbl">{l}</span><span className="ema-val">{v!=null?v.toFixed(2):"–"}</span></div>
          ))}
        </div>
        <div className="chk"><Dot ok={data.emasAligned}/><span className={data.emasAligned?"chk-ok":"chk-fail"}>EMA 20 &gt; 50 &gt; 100 alinhadas</span></div>
        <div className="chk"><Dot ok={data.priceAboveEmas}/><span className={data.priceAboveEmas?"chk-ok":"chk-fail"}>Preço acima das EMAs</span></div>
      </div>
      <div className="two-col">
        <div className="block">
          <div className="block-title">RSI (14)</div>
          <Bar value={data.rsi} max={100} color={(data.rsi??50)<30?"var(--blue)":(data.rsi??50)>70?"var(--red)":"var(--grn)"}/>
          <div className="chk"><Dot ok={data.rsiOk}/><span className={data.rsiOk?"chk-ok":"chk-fail"}>{data.rsiOk?"40–70 ✓":(data.rsi??0)<40?"Sobrevendido":"Sobrecomprado"}</span></div>
        </div>
        <div className="block">
          <div className="block-title">Estocástico</div>
          <div style={{marginBottom:5}}><span className="stoch-l">%K</span><Bar value={data.stochK} max={100} color={(data.stochK??0)>80?"var(--red)":"var(--amber)"}/></div>
          <div><span className="stoch-l">%D</span><Bar value={data.stochD} max={100} color={(data.stochD??0)>80?"var(--red)":"var(--purple)"}/></div>
          <div className="chk"><Dot ok={data.stochOk}/><span className={data.stochOk?"chk-ok":"chk-fail"}>{data.stochCross?"K>D ↑":"Zona OK"}</span></div>
        </div>
      </div>
      <div className="chk" style={{marginBottom:10}}>
        <Dot ok={data.trendUp}/>
        <span className={data.trendUp?"chk-ok":"chk-fail"}>{data.trendUp?"Tendência de alta confirmada":"Tendência indefinida / baixa"}</span>
      </div>
      <div className="block sr-block">
        <div className="sr-top" onClick={()=>setExp(!exp)}>
          <span className="block-title" style={{marginBottom:0}}>Suporte &amp; Resistência</span>
          <div className="sr-tags">
            {data.nearestSupport    && <span className="sr-tag-s">S {data.nearestSupport.price.toFixed(2)}</span>}
            {data.nearestResistance && <span className="sr-tag-r">R {data.nearestResistance.price.toFixed(2)}</span>}
            <span className="expand-btn">{exp?"▲":"▼"}</span>
          </div>
        </div>
        {data.nearResistance && <div className="alert-r">⚠️ Próximo de resistência — risco de rejeição</div>}
        {data.nearSupport    && <div className="alert-s">✅ Próximo de suporte — zona favorável</div>}
        {exp && (
          <div className="sr-body">
            <MiniChart currentPrice={data.currentPrice} supports={data.supports} resistances={data.resistances}/>
            {data.resistances.length>0 && <><div className="sr-group-title">Resistências</div>{data.resistances.map((r,j)=><SRLine key={j} price={r.price} currentPrice={data.currentPrice} type="R" strength={r.strength}/>)}</>}
            {data.supports.length>0    && <><div className="sr-group-title" style={{marginTop:8}}>Suportes</div>{data.supports.map((s,j)=><SRLine key={j} price={s.price} currentPrice={data.currentPrice} type="S" strength={s.strength}/>)}</>}
            <div className="candle-info">{data.candleCount} candles diários</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKERS.join(", "));
  const [newTicker, setNewTicker]     = useState("");
  const [results, setResults]         = useState([]);
  const [errors, setErrors]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [progress, setProgress]       = useState({done:0,total:0});
  const [lastScan, setLastScan]       = useState(null);
  const [filter, setFilter]           = useState("all");
  const [scanDone, setScanDone]       = useState(false);
  const [proxyStatus, setProxyStatus] = useState("");

  const tickers = tickerInput.split(",").map(t=>t.trim().toUpperCase()).filter(Boolean);

  const runAnalysis = useCallback(async () => {
    setLoading(true); setScanDone(false); setResults([]); setErrors([]);
    setProgress({done:0, total:tickers.length});
    setProxyStatus("Detectando proxy disponível...");

    const good=[], bad=[];
    for (let i=0; i<tickers.length; i++) {
      const t = tickers[i];
      try {
        setProxyStatus(`Buscando ${t}...`);
        const raw      = await fetchQuote(t);
        const analyzed = analyze(raw);
        if (analyzed) good.push(analyzed);
        else bad.push({ticker:t, msg:"Dados insuficientes"});
      } catch(e) {
        bad.push({ticker:t, msg:e.message});
      }
      setProgress({done:i+1, total:tickers.length});
      setResults([...good].sort((a,b)=>b.score-a.score));
    }

    setErrors(bad);
    setLastScan(new Date());
    setLoading(false); setScanDone(true);
    setProxyStatus("");
  }, [tickers]);

  const addTicker    = () => { const t=newTicker.trim().toUpperCase(); if(t&&!tickers.includes(t)) setTickerInput([...tickers,t].join(", ")); setNewTicker(""); };
  const removeTicker = t => setTickerInput(tickers.filter(x=>x!==t).join(", "));

  const filtered = results.filter(r=>{
    if(filter==="buy")   return r.buySignal;
    if(filter==="watch") return r.watchSignal;
    if(filter==="wait")  return !r.buySignal&&!r.watchSignal;
    return true;
  });
  const buys=results.filter(r=>r.buySignal).length;
  const watches=results.filter(r=>r.watchSignal).length;
  const waits=results.filter(r=>!r.buySignal&&!r.watchSignal).length;
  const pct=progress.total?Math.round((progress.done/progress.total)*100):0;

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
        .fpill-buy{border-color:var(--grn);color:var(--grn)}.fpill-buy.active{background:rgba(56,199,104,.1)}
        .fpill-watch{border-color:var(--amber);color:var(--amber)}.fpill-watch.active{background:rgba(232,184,75,.1)}
        .fpill-wait{border-color:var(--muted);color:var(--muted)}.fpill-wait.active{background:rgba(106,117,133,.1)}
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
      `}</style>

      <div className="app">
        <div className="hdr">
          <div className="logo">📈 StockRadar</div>
          <div className="sub">Análise Técnica Pós-Mercado · Yahoo Finance · B3 — Dados Reais</div>
          {lastScan && <div className="last">Último scan: {lastScan.toLocaleTimeString("pt-BR")} · {lastScan.toLocaleDateString("pt-BR")}</div>}
        </div>

        {/* Aviso sobre CORS */}
        {!scanDone && !loading && (
          <div className="warn-box">
            <strong>⚠️ Importante — Se ocorrer erro "Failed to fetch":</strong><br/>
            O navegador bloqueia chamadas entre domínios (CORS). O app usa proxies automáticos para contornar isso.<br/>
            Se ainda falhar, instale a extensão <strong>CORS Unblock</strong> ou <strong>Allow CORS</strong> no Chrome/Firefox e ative-a antes de rodar a análise.<br/>
            <code>Chrome Web Store → buscar "Allow CORS: Access-Control-Allow-Origin"</code>
          </div>
        )}

        <div className="ctrl">
          <div className="ctrl-title">Lista de Ações (B3)</div>
          <div className="chips">
            {tickers.map(t=>(
              <div key={t} className="chip">{t}<button className="chip-x" onClick={()=>removeTicker(t)}>×</button></div>
            ))}
          </div>
          <div className="add-row">
            <input className="add-in" placeholder="ex: ITSA4" value={newTicker}
              onChange={e=>setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&addTicker()} maxLength={6}/>
            <button className="btn btn-add" onClick={addTicker}>+ Adicionar</button>
          </div>
          <button className="btn btn-scan" onClick={runAnalysis} disabled={loading}>
            {loading?`🔍 ${proxyStatus||"Carregando..."} (${progress.done}/${progress.total})`:"🚀 Rodar Análise (Dados Reais)"}
          </button>
        </div>

        {loading && (
          <div className="prog">
            <div className="prog-txt">{progress.done}/{progress.total} ações — {pct}% {proxyStatus&&`· ${proxyStatus}`}</div>
            <div className="prog-wrap"><div className="prog-bar" style={{width:`${pct}%`}}/></div>
          </div>
        )}

        {errors.length>0 && (
          <div className="err-box">
            <div className="err-title">⚠ Falha em {errors.length} ação(ões) — tente ativar extensão CORS no navegador:</div>
            <div className="err-list">
              {errors.map(e=><span key={e.ticker} className="err-item" title={e.msg}>{e.ticker}: {e.msg}</span>)}
            </div>
          </div>
        )}

        {scanDone&&results.length>0&&(
          <div className="fbar">
            {[{key:"all",cls:"all",label:"Todas",count:results.length},{key:"buy",cls:"buy",label:"Compra",count:buys},{key:"watch",cls:"watch",label:"Atenção",count:watches},{key:"wait",cls:"wait",label:"Aguardar",count:waits}].map(({key,cls,label,count})=>(
              <div key={key} className={`fpill fpill-${cls} ${filter===key?"active":""}`} onClick={()=>setFilter(key)}>
                <span className="fcount">{count}</span>{label}
              </div>
            ))}
          </div>
        )}

        {loading&&results.length===0?(
          <div className="loading">
            <div className="spinner"/>
            <div className="load-txt">Buscando dados reais da B3...</div>
            <div className="load-sub">{proxyStatus}</div>
          </div>
        ):filtered.length>0?(
          <div className="grid">{filtered.map((d,i)=><Card key={d.ticker} data={d} i={i}/>)}</div>
        ):scanDone&&!loading?(
          <div className="empty"><div className="empty-ico">🔎</div>Nenhuma ação nesta categoria.</div>
        ):!scanDone?(
          <div className="empty">
            <div className="empty-ico">📊</div>
            <div>Clique em <strong>Rodar Análise</strong> para buscar dados reais</div>
          </div>
        ):null}

        {scanDone&&(
          <div className="legend">
            <strong>Critérios (5 pts):</strong> EMA 20&gt;50&gt;100 · Preço acima EMAs · RSI 40–70 · Estocástico OK · Tendência de alta<br/>
            <strong>S&amp;R:</strong> Pivôs dos últimos 90 candles · Confluência = nível mais forte · Clique no card para ver<br/>
            <strong>R/R:</strong> ≥2x 🟢 ótimo · 1–2x 🟡 aceitável · &lt;1x 🔴 ruim<br/>
            <strong>COMPRA</strong> ≥4 critérios + longe de R &nbsp;|&nbsp; <strong>ATENÇÃO</strong> = 3 ou próximo de R &nbsp;|&nbsp; <strong>AGUARDAR</strong> ≤2
          </div>
        )}
      </div>
    </>
  );
}
