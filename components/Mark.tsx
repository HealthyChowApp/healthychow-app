export function Mark({ size = 30, className = "" }: { size?: number; className?: string }) {
  const height = Math.round((size * 260) / 240);
  return (
    <svg className={`mark ${className}`} width={size} height={height} aria-hidden="true">
      <use href="#hc-mark" />
    </svg>
  );
}
