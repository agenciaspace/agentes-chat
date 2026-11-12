import type { CSSProperties } from "react";
import { cx } from "../cx";

/** Original legalops.chat mark, independent of the upstream trademarks. */
export function LogoMark({ size, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cx("ac-logo__mark", className)}
      style={size ? { width: size, height: size } : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#c84c39" />
      <path d="M9 8h4v13h11v4H9z" fill="#fffaf3" />
      <circle cx="22" cy="11" r="4" fill="#28231f" />
    </svg>
  );
}

export interface LogoProps {
  variant?: "main" | "expanded";
  mono?: boolean;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** The fork's own wordmark. Attribution remains in Settings > About. */
export function Logo({ variant = "main", mono, size = 24, className, style }: LogoProps) {
  return (
    <span
      className={cx("ac-logo", mono && "ac-logo--mono", className)}
      style={{ fontSize: size, ...style }}
      role="img"
      aria-label="legalops.chat"
    >
      <LogoMark />
      <span className="ac-logo__word" aria-hidden="true">
        <span>legalops</span>
        {variant === "expanded" && <span className="ac-logo__chat">.chat</span>}
      </span>
    </span>
  );
}
