import * as React from "react";
import type { SVGProps } from "react";
const SvgIconSun = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    data-name="Layer 1"
    viewBox="0 0 18 18"
    width="1em"
    height="1em"
    {...props}
  >
    <path d="M9 5.8c1.7 0 3.2 1.4 3.2 3.2s-1.4 3.2-3.2 3.2S5.8 10.8 5.8 9 7.2 5.8 9 5.8m0-1C6.7 4.8 4.8 6.7 4.8 9s1.9 4.2 4.2 4.2 4.2-1.9 4.2-4.2S11.3 4.8 9 4.8" />
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeMiterlimit={10}
      d="M9 3.2v-2M13.1 4.9l1.4-1.4M14.8 9h2M13.1 13.1l1.4 1.4M9 14.8v2M4.9 13.1l-1.4 1.4M3.2 9h-2M4.9 4.9 3.5 3.5"
    />
  </svg>
);
export default SvgIconSun;
