export default function ScoreBadge({ score }) {
  const level = score >= 8 ? "strong" : score >= 6 ? "good" : score >= 4 ? "fair" : "weak";
  return (
    <span className={`score-badge score-${level}`}>
      {score}/10
    </span>
  );
}
