export default function CandleBadge({ labels }) {
  if (!labels?.length) return null;
  return (
    <>
      {labels.map((label) => (
        <span key={label} className="info-badge">{label}</span>
      ))}
    </>
  );
}