"use client";

import { useEffect, useRef } from "react";

/** Moving-average colors, matched to the thinkorswim layout the routine uses. */
export const MA_COLORS = {
  ema9: "#00E5FF", // cyan
  sma20: "#FF40FF", // magenta
  sma50: "#2ECC40", // green
  sma100: "#FF7F8F", // pink
  sma200: "#F5B800", // gold
} as const;

/**
 * The routine's moving averages: 9 EMA and 20/50/100/200 SMA.
 * The embed can't recolor ordinary studies, but TradingView's MA Ribbon takes
 * its line type, length and color as inputs. Each line uses five inputs:
 * show, type, source, length, color (in_0–in_4 for line 1, in_5–in_9 for line 2, …).
 * One ribbon draws the four SMAs; a second shows only the 9 EMA.
 */
const ribbonLine = (n: number, type: "SMA" | "EMA", length: number, color: string) => {
  const i = n * 5;
  return { [`in_${i}`]: true, [`in_${i + 1}`]: type, [`in_${i + 3}`]: length, [`in_${i + 4}`]: color };
};

const ROUTINE_STUDIES = [
  {
    id: "STD;MA%Ribbon",
    inputs: { ...ribbonLine(0, "EMA", 9, MA_COLORS.ema9), in_5: false, in_10: false, in_15: false },
  },
  {
    id: "STD;MA%Ribbon",
    inputs: {
      ...ribbonLine(0, "SMA", 20, MA_COLORS.sma20),
      ...ribbonLine(1, "SMA", 50, MA_COLORS.sma50),
      ...ribbonLine(2, "SMA", 100, MA_COLORS.sma100),
      ...ribbonLine(3, "SMA", 200, MA_COLORS.sma200),
    },
  },
];

/**
 * TradingView Advanced Chart (free embed). The widget sizes itself to 100% of
 * its container, so the wrapper needs an explicit height.
 */
export function TradingViewChart({
  symbol,
  interval = "D",
  className = "h-[560px]",
}: {
  symbol: string;
  interval?: "D" | "W" | "M";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "America/New_York",
      theme: "dark", // always dark: the moving-average colors read best on it
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      withdateranges: true,
      hide_side_toolbar: false,
      save_image: true,
      studies: ROUTINE_STUDIES,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
    host.appendChild(container);

    return () => {
      host.innerHTML = "";
    };
  }, [symbol, interval]);

  return <div ref={ref} className={`w-full overflow-hidden rounded-xl border border-border ${className}`} />;
}
