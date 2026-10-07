import Image from "next/image";

const MARK_WIDTH = 203;
const MARK_HEIGHT = 148;
const STACKED_WIDTH = 990;
const STACKED_HEIGHT = 530;

export function BrandMark({
  height = 32,
  className = "",
  alt = "WealthOS",
}: {
  height?: number;
  className?: string;
  alt?: string;
}) {
  const width = Math.round((MARK_WIDTH / MARK_HEIGHT) * height);
  return (
    <Image
      src="/wealthos-mark.png"
      alt={alt}
      width={width}
      height={height}
      className={`shrink-0 ${className}`}
      priority
    />
  );
}

/** Symbol stacked over the WealthOS wordmark. The light file sits on white; the transparent file is for the sign-in screen. */
export function StackedLogo({
  className = "",
  alt = "WealthOS",
  transparent = false,
}: {
  className?: string;
  alt?: string;
  transparent?: boolean;
}) {
  return (
    <Image
      src={
        transparent
          ? "/logo_files/wealthos-primary-stacked-transparent.png"
          : "/logo_files/wealthos-primary-stacked-light.png"
      }
      alt={alt}
      width={STACKED_WIDTH}
      height={STACKED_HEIGHT}
      className={`${transparent ? "" : "brand-lockup " }h-auto w-full ${className}`}
      priority
    />
  );
}
