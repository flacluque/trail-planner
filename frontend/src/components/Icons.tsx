/** Icônes dessinées, même trait partout (1,9 px, bouts arrondis), à la couleur du texte. */
const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

type IconProps = { size?: number };

export const RouteIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M5 19c3-1 3-5 7-6s4-6 7-8" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /></svg>
);
export const StopwatchIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M10 2h4" /></svg>
);
export const BottleIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M9 3h6M10 3v3l-2 3v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9l-2-3V3" /><path d="M8 13h8" /></svg>
);
export const BackpackIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M6 8a6 6 0 0 1 12 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2M9 14h6" /></svg>
);
export const BarrierIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><rect x="3" y="7" width="18" height="6" rx="1" /><path d="M7 7l-3 6M12 7l-3 6M17 7l-3 6M6 13v7M18 13v7" /></svg>
);
export const MoreIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
);
export const HomeIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>
);
export const PersonIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7" /></svg>
);
export const ChevronIcon = ({ size = 14 }: IconProps) => (
  <svg {...base} width={size} height={size} strokeWidth={2.4}><path d="M9 5l7 7-7 7" /></svg>
);
export const BackIcon = ({ size = 18 }: IconProps) => (
  <svg {...base} width={size} height={size} strokeWidth={2.4}><path d="M15 5l-7 7 7 7" /></svg>
);
export const WatchIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 10v2.5l1.5 1" /></svg>
);
export const CrewIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.7-3.6 3-5.5 6-5.5s5.3 1.9 6 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.6c2.7-.3 4.5 1.4 5 4.4" /></svg>
);
export const DocIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>
);
export const ChartIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" /></svg>
);
export const InfoIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>
);
export const ChatIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M4 5h16v11H9l-4 4v-4H4z" /></svg>
);
export const FlagIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
);
export const MoonIcon = ({ size = 14 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
);
export const LinkIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
);
export const ShieldIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
);
export const TrashIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const PlusIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M12 5v14M5 12h14" /></svg>
);
export const ChevronDownIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M6 9l6 6 6-6" /></svg>
);
export const CloudIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" /><path d="M10 13.5l1.8 1.8 3.4-3.6" /></svg>
);
export const DevicesIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><rect x="2" y="5" width="13" height="10" rx="1.5" /><path d="M5 19h7" /><rect x="16" y="8" width="6" height="12" rx="1.5" /></svg>
);
export const KeyIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 8l9 6 9-6" /></svg>
);
