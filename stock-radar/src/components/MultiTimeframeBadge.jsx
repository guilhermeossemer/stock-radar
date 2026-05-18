export default function MultiTimeframeBadge({ mtf }) {
  if (!mtf) return null;

  const labels = [];
  if (mtf.aligned) labels.push("MTF ALINHADO");
  if (mtf.fourHour?.status === "healthy_pullback") labels.push("PULLBACK SAUDÁVEL");
  if (mtf.oneHour?.status === "confirmed") labels.push("CONFIRMAÇÃO 1H");
  if (mtf.oneHour?.status === "rejected") labels.push("REJEIÇÃO 1H");

  if (!labels.length) return null;

  return (
    <>
      {labels.map((label) => (
        <span key={label} className="info-badge">{label}</span>
      ))}
    </>
  );
}