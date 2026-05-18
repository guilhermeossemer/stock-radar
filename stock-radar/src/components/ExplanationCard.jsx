export default function ExplanationCard({ explanation }) {
  if (!explanation || !explanation.summary) return null;
  return (
    <div className="summary-card">
      <div className="summary-copy">{explanation.summary}</div>
      <div className="summary-factors">
        {explanation.positives?.map((item) => (
          <span key={item} className="summary-chip summary-chip-positive">{item}</span>
        ))}
        {explanation.negatives?.map((item) => (
          <span key={item} className="summary-chip summary-chip-negative">{item}</span>
        ))}
      </div>
    </div>
  );
}
