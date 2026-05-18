export default function PatternBadge({ labels }) {
  if (!labels?.length) return null;
  return (
    <div className="pattern-row">
      {labels.map((label) => (
        <span key={label} className="pattern-badge">
          {label}
        </span>
      ))}
    </div>
  );
}
