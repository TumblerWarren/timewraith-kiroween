import { GATEWAY_LABEL } from "../content/copy";

/**
 * Gateway_Status_Badge (Requirements 6.5, 16.4): a flat paper tag in the App_Header with an hourglass shape and the
 * text "Demo mode, simulated status". It never shows a green "connected" dot and never claims a live gateway.
 * Not a control, so it has no outline or shadow (visual revision R1).
 */
export function GatewayBadge() {
  return (
    <p className="gateway-badge paper-piece" data-gateway="demo">
      <svg className="gateway-badge__shape" viewBox="0 0 24 24" width={18} height={18} focusable="false" aria-hidden="true" data-shape="hourglass">
        <path d="M5 3.5 L19 3 L12.5 12 L19.5 21 L4.5 20.5 L11.5 12 Z" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />
        <path d="M9 18.5 L15 18.4 L12.2 15.6 Z" fill="currentColor" />
      </svg>
      <span>{GATEWAY_LABEL}</span>
    </p>
  );
}
