import face from "../../assets/cinematic/clock-face.webp";
import hour from "../../assets/cinematic/clock-hour.webp";
import minute from "../../assets/cinematic/clock-minute.webp";
import hub from "../../assets/cinematic/clock-hub.webp";

export const CLOCK_IMAGES = [face, hour, minute, hub];

/** Original artwork, registered to the original 1254px canvas. Hands remain independent SVG joints. */
export function MidnightClock() {
  return <svg viewBox="0 0 1254 1254" className="cinema__dial" aria-hidden="true">
    <image href={face} width="1254" height="1254" />
    <g data-hand="hour" transform="rotate(357.5 625.5 626)">
      <image href={hour} x="578.323" y="386.496" width="94.726" height="311.244" />
    </g>
    <g data-hand="minute" transform="rotate(330 625.5 626)">
      <image href={minute} x="587.145" y="276.566" width="75.623" height="422.916" />
    </g>
    <image href={hub} x="593.778" y="593.5" width="63.445" height="65" />
  </svg>;
}
