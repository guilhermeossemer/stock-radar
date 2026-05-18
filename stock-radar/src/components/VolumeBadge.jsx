export default function VolumeBadge({ volume }) {
  if (!volume) return null;
  const label = volume.relative > 1.5 ? "VOLUME FORTE" : volume.relative > 1 ? "VOLUME MODERADO" : "VOLUME FRACO";
  const className = volume.relative > 1.5 ? "info-badge" : volume.relative > 1 ? "info-badge" : "info-badge";
  return <span className={className}>{label}</span>;
}