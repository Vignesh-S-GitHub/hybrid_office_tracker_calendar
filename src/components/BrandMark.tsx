export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <img
      className={`brand-mark ${className}`}
      src={`${import.meta.env.BASE_URL}brand-icon-v2-192.png`}
      width="44"
      height="44"
      alt=""
      aria-hidden="true"
    />
  );
}
