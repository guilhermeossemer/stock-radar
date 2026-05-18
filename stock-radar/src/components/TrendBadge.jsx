const LABELS = {
  TREND_UP: "TREND UP",
  TREND_DOWN: "TREND DOWN",
  RANGE: "RANGE",
  TRANSITION: "TRANSIÇÃO",
};

export default function TrendBadge({ context }) {
  const normalized = context
    ?.toLowerCase()
    .replace(/_/g, "-")
    .replace(/^trend-/, "");

  return (
    <span className={`trend-badge trend-${normalized}`}>
      {LABELS[context] ?? "INDIFERENTE"}
    </span>
  );
}
