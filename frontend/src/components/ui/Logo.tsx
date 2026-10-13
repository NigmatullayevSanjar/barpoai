import logoUrl from '@/assets/barpo-logo.png';

const ASPECT = 1026 / 567;

/**
 * BARPO AI logotipi (oq, shaffof fon). `white` — to'q fon uchun rasmning o'zi;
 * `brand` — oq fon uchun: o'sha rasm maska sifatida brend rangida bo'yaladi (ikkinchi fayl kerak emas).
 */
export function Logo({ variant = 'white', height = 40 }: { variant?: 'white' | 'brand'; height?: number }) {
  const width = Math.round(height * ASPECT);
  if (variant === 'brand')
    return (
      <span
        className="logo-mask"
        role="img"
        aria-label="BARPO AI"
        style={{ width, height, WebkitMaskImage: `url(${logoUrl})`, maskImage: `url(${logoUrl})` }}
      />
    );
  return <img src={logoUrl} alt="BARPO AI" width={width} height={height} style={{ height, width }} />;
}
