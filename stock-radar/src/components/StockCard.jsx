import ScoreBadge from "./ScoreBadge.jsx";
import TrendBadge from "./TrendBadge.jsx";
import PatternBadge from "./PatternBadge.jsx";
import CandleBadge from "./CandleBadge.jsx";
import VolumeBadge from "./VolumeBadge.jsx";
import MultiTimeframeBadge from "./MultiTimeframeBadge.jsx";
import ExplanationCard from "./ExplanationCard.jsx";

export default function StockCard({ data, index }) {
  const categoryClass = data.category.toLowerCase().replace("_", "-");
  return (
    <div className={`card card-${categoryClass}`} style={{ animationDelay: `${index * 45}ms` }}>
      <div className={`stripe stripe-${categoryClass}`} />
      <div className="card-header">
        <div>
          <div className="ticker">{data.ticker}</div>
          <div className="name" title={data.longName}>{data.longName}</div>
          <div className={`delta ${data.dayChange >= 0 ? "pos" : "neg"}`}>
            {data.dayChange >= 0 ? "▲" : "▼"} {Math.abs(data.dayChange ?? 0).toFixed(2)}%
          </div>
        </div>
        <div className="header-right">
          <div className="price">R$ {data.currentPrice.toFixed(2)}</div>
          <div className={`pill pill-${categoryClass}`}>{data.category.replace("_", " ")}</div>
          <ScoreBadge score={data.score} />
        </div>
      </div>

      <div className="badge-row">
        <TrendBadge context={data.trend.context} />
        <MultiTimeframeBadge mtf={data.multiTimeframe} />
        <VolumeBadge volume={data.volume} />
        <CandleBadge labels={data.candleSignals?.names} />
        {data.badges.slice(0, 2).map((badge) => (
          <span key={badge} className="info-badge">{badge}</span>
        ))}
      </div>

      <div className="metrics-grid">
        <div className="metric">
          <span>EMA20</span>
          <strong>{data.ema20?.toFixed(2) ?? "–"}</strong>
        </div>
        <div className="metric">
          <span>EMA50</span>
          <strong>{data.ema50?.toFixed(2) ?? "–"}</strong>
        </div>
        <div className="metric">
          <span>EMA100</span>
          <strong>{data.ema100?.toFixed(2) ?? "–"}</strong>
        </div>
        <div className="metric">
          <span>Dist. EMA20</span>
          <strong>{data.distanceToEma20 != null ? `${data.distanceToEma20.toFixed(1)}%` : "–"}</strong>
        </div>
        <div className="metric">
          <span>RSI</span>
          <strong>{data.rsi != null ? data.rsi.toFixed(1) : "–"}</strong>
        </div>
        <div className="metric">
          <span>Estocástico</span>
          <strong>{data.stochK != null ? `${data.stochK.toFixed(0)}/${data.stochD?.toFixed(0)}` : "–"}</strong>
        </div>
      </div>

      <div className="flex-row">
        <div className="mini-block">
          <span>Risco</span>
          <strong>{data.stopPrice ? `R$ ${data.stopPrice.toFixed(2)}` : "–"}</strong>
        </div>
        <div className="mini-block">
          <span>Alvo</span>
          <strong>{data.targetPrice ? `R$ ${data.targetPrice.toFixed(2)}` : "–"}</strong>
        </div>
        <div className="mini-block">
          <span>R/R</span>
          <strong>{data.riskReward != null ? `${data.riskReward.toFixed(1)}x` : "–"}</strong>
        </div>
      </div>

      <PatternBadge labels={data.badges.filter((value) => ["Martelo", "Engolfo de alta", "Inside bar", "Rejeição bullish", "Compressão"].includes(value))} />
      <ExplanationCard explanation={data.explanation} />
    </div>
  );
}
