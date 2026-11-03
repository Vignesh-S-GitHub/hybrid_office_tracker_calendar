export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <img
      className={`brand-mark ${className}`}
      src={`${import.meta.env.BASE_URL}ui-kit/logo-mark.svg`}
      width="44"
      height="44"
      alt=""
      aria-hidden="true"
    />
  );
}
