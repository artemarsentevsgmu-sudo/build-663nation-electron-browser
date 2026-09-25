import { useState } from "react";
import { faviconFor, isInternal } from "../url";

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lg663" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0" stopColor="#00e5a0" />
          <stop offset="1" stopColor="#22b8cf" />
        </linearGradient>
      </defs>
      <path d="M32 3 58 17.5v29L32 61 6 46.5v-29L32 3Z" stroke="url(#lg663)" strokeWidth="4" />
      <text x="32" y="39" textAnchor="middle" fontFamily="Inter,system-ui" fontWeight="900" fontSize="17" fill="url(#lg663)">663</text>
    </svg>
  );
}

export function Favicon({ url, size = 15, className = "" }: { url: string; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  const src = faviconFor(url);
  if (isInternal(url)) return <i className={`ri-hexagon-line ${className}`} style={{ fontSize: size }} />;
  if (!src || err) return <i className={`ri-global-line ${className}`} style={{ fontSize: size }} />;
  return <img src={src} width={size} height={size} alt="" onError={() => setErr(true)} loading="lazy" />;
}

export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      className={`switch ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
    />
  );
}
