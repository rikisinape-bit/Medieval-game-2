import React from "react";

// Small face that reflects a reputation mood (-2 odiato … 2 onorato).
const COLORS = { "-2": "#d0453a", "-1": "#d88a3a", 0: "#b8ab92", 1: "#9fcf6a", 2: "#e8c050" };
export default function RepFace({ mood = 0, size = 18, title }) {
  const c = COLORS[mood];
  const curve = mood * 3; // mouth: positive = smile
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label={title} role="img" data-testid="rep-face" data-mood={mood}>
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="10.5" fill="#1a130d" stroke={c} strokeWidth="2" />
      <circle cx="8.3" cy="10" r="1.5" fill={c} />
      <circle cx="15.7" cy="10" r="1.5" fill={c} />
      {mood <= -2 && <path d="M5.8 6.6 L10 8.4 M18.2 6.6 L14 8.4" stroke={c} strokeWidth="1.6" strokeLinecap="round" />}
      {mood >= 2 && <path d="M6.5 5.2 L9 3.6 L11 5.2 L13 3.6 L15 5.2 L17.5 3.6" stroke={c} strokeWidth="1.3" fill="none" strokeLinejoin="round" />}
      <path d={`M7.5 ${16 - curve * 0.25} Q12 ${16 + curve} 16.5 ${16 - curve * 0.25}`} stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
