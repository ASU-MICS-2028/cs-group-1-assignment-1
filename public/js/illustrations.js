// Hand-built flat SVG illustrations in the portal palette (no external assets).

const C = {
  maroon9: '#46111b',
  maroon8: '#611825',
  maroon7: '#7a1f2e',
  maroon5: '#a8414f',
  maroon3: '#db9aa4',
  maroon2: '#ebc5cb',
  maroon1: '#f5e3e6',
  gold: '#d9a441',
  gold3: '#eac56a',
  gold1: '#faefd2',
  skin: '#8a5a3c',
  skinShade: '#6f4630',
  hair: '#24161a',
  white: '#ffffff',
  cream: '#faf6f1',
  leaf: '#3f6b4a',
  leaf2: '#55835f',
  leaf3: '#2f5639',
};

function person(x = 0, y = 0, s = 1) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="18" y="70" width="70" height="100" rx="26" fill="${C.maroon8}"/>
    <path d="M40 20c-14 8-16 34-10 58 6 22 2 40 10 46h44c8-10 2-26 0-44-4-34-14-66-44-60z" fill="${C.hair}"/>
    <path d="M52 66h14v18H52z" fill="${C.skinShade}"/>
    <ellipse cx="60" cy="48" rx="19" ry="23" fill="${C.skin}"/>
    <path d="M38 44c0-20 12-30 26-28 14 2 20 14 18 30-8-10-22-16-44-2z" fill="${C.hair}"/>
    <path d="M76 36c6 6 8 18 6 30" stroke="${C.hair}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M26 112c2-20 14-30 34-32 20 2 32 12 36 32l4 58H22z" fill="${C.gold}"/>
    <path d="M52 82l8 20 8-20z" fill="${C.white}"/>
    <path d="M52 82 44 120M68 82l8 38" stroke="${C.gold3}" stroke-width="3" stroke-linecap="round"/>
    <path d="M84 104c12 10 26 22 46 28" stroke="${C.gold}" stroke-width="20" stroke-linecap="round" fill="none"/>
    <path d="M84 104c12 10 26 22 46 28" stroke="${C.gold3}" stroke-width="2" stroke-linecap="round" opacity=".6" fill="none"/>
    <ellipse cx="136" cy="134" rx="9" ry="6" fill="${C.skin}"/>
  </g>`;
}

function laptop(x = 0, y = 0, s = 1) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M22 0h88a8 8 0 0 1 8 9l-10 74H8L14 7a8 8 0 0 1 8-7z" fill="${C.maroon7}"/>
    <path d="M26 8h80l-8 66H18z" fill="${C.maroon8}" opacity=".55"/>
    <path d="M64 26l12 5v8c0 8-5 13-12 15-7-2-12-7-12-15v-8z" fill="${C.gold}"/>
    <path d="m59 39 4 4 6-7" stroke="${C.maroon8}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M-14 83h132l-6 8H-20z" fill="${C.maroon9}"/>
  </g>`;
}

function mug(x, y) {
  return `
  <g transform="translate(${x} ${y})">
    <path d="M2 10h22l-2 22a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="${C.white}"/>
    <path d="M24 15c7 0 7 11 0 11" stroke="${C.white}" stroke-width="3" fill="none"/>
    <path d="M2 10h22" stroke="${C.maroon2}" stroke-width="2"/>
    <path d="M9 0c-3 3 3 5 0 8M16 -2c-3 3 3 5 0 8" stroke="${C.white}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9"/>
  </g>`;
}

/** Dashboard hero: student at a laptop with floating passkey badges. */
export function deskIllustration(cls = '') {
  return `
  <svg viewBox="0 0 360 260" class="${cls}" role="img" aria-label="Student working at a laptop">
    <circle cx="58" cy="78" r="6" fill="none" stroke="${C.maroon5}" stroke-width="2"/>
    <circle cx="96" cy="30" r="3" fill="${C.maroon7}"/>
    <circle cx="300" cy="40" r="3" fill="${C.maroon7}"/>
    <circle cx="322" cy="96" r="9" fill="none" stroke="${C.maroon5}" stroke-width="2"/>
    <circle cx="322" cy="96" r="4" fill="${C.maroon7}"/>
    <path d="M290 0v60M80 60v80" stroke="${C.maroon3}" stroke-width="1.2"/>
    <g transform="translate(250 50)">
      <rect width="46" height="46" rx="14" fill="${C.white}"/>
      <circle cx="18" cy="27" r="6" fill="none" stroke="${C.maroon7}" stroke-width="3"/>
      <path d="m22 23 12-12M30 15l4 4" stroke="${C.maroon7}" stroke-width="3" stroke-linecap="round"/>
    </g>
    ${person(70, 40, 1)}
    ${laptop(190, 118, 0.95)}
    ${mug(120, 172)}
    <path d="M40 206h300l-16 18H56z" fill="${C.maroon3}"/>
    <path d="M56 224h268v8H56z" fill="${C.white}"/>
    <path d="M86 232v28M296 232v28" stroke="${C.white}" stroke-width="5"/>
  </svg>`;
}

/** Sign-in side panel: study corner with plant, clock and a verified passkey card. */
export function studyScene(cls = '') {
  return `
  <svg viewBox="0 0 520 600" preserveAspectRatio="xMidYMid slice" class="${cls}" role="img" aria-label="Student signing in with a passkey">
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${C.gold1}"/><stop offset="1" stop-color="${C.maroon1}"/>
      </linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${C.maroon7}"/><stop offset="1" stop-color="${C.maroon9}"/>
      </linearGradient>
    </defs>
    <rect width="520" height="600" fill="url(#wall)"/>
    <path d="M0 430 520 380v220H0z" fill="url(#floor)"/>
    <g transform="translate(330 90)">
      <circle r="34" fill="${C.white}" stroke="${C.maroon8}" stroke-width="6"/>
      <path d="M0-20V0l12 8" stroke="${C.maroon8}" stroke-width="4" stroke-linecap="round" fill="none"/>
    </g>
    <rect x="40" y="250" width="70" height="190" rx="6" fill="${C.white}"/>
    <path d="M40 310h70M40 370h70" stroke="${C.maroon1}" stroke-width="3"/>
    <rect x="52" y="262" width="10" height="40" rx="2" fill="${C.maroon5}"/>
    <rect x="64" y="268" width="10" height="34" rx="2" fill="${C.gold}"/>
    <rect x="76" y="258" width="10" height="44" rx="2" fill="${C.maroon7}"/>
    <path d="M66 250c-6-24 8-32 4-50M74 250c4-20 18-22 16-40" stroke="${C.leaf}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <g transform="translate(430 330)">
      <path d="M10 0c-30-60-10-130 12-160 6 50 0 110-12 160z" fill="${C.leaf}"/>
      <path d="M18 0c10-60 40-100 58-120-6 50-30 100-58 120z" fill="${C.leaf2}"/>
      <path d="M6 0c-24-40-50-60-70-70 10 40 40 66 70 70z" fill="${C.leaf3}"/>
      <path d="M-18 0h56l-8 70h-40z" fill="${C.white}"/>
      <path d="M-18 0h56l-2 14h-52z" fill="${C.cream}"/>
    </g>
    ${person(80, 250, 1.35)}
    ${laptop(250, 360, 1.25)}
    ${mug(190, 423)}
    <path d="M100 470h300l-10 20H110z" fill="${C.maroon8}"/>
    <path d="M110 490h280v10H110z" fill="${C.maroon2}"/>
    <path d="M130 500l-10 90M370 500l10 90" stroke="${C.white}" stroke-width="9" stroke-linecap="round"/>
    <g transform="translate(56 92)">
      <rect width="196" height="78" rx="20" fill="${C.white}"/>
      <circle cx="38" cy="39" r="20" fill="${C.maroon7}"/>
      <path d="m29 39 6 6 12-13" stroke="${C.white}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="72" y="26" width="92" height="9" rx="4.5" fill="${C.maroon7}"/>
      <rect x="72" y="44" width="64" height="8" rx="4" fill="${C.maroon2}"/>
    </g>
  </svg>`;
}

/** Small sidebar art: a monitor with a shield. */
export function monitorIllustration(cls = '') {
  return `
  <svg viewBox="0 0 160 110" class="${cls}" aria-hidden="true">
    <rect x="20" y="10" width="120" height="74" rx="8" fill="${C.maroon7}"/>
    <rect x="28" y="18" width="104" height="58" rx="4" fill="${C.white}"/>
    <path d="M40 64l18-18 14 10 24-26" stroke="${C.maroon5}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="104" y="40" width="8" height="24" rx="2" fill="${C.gold}"/>
    <rect x="116" y="30" width="8" height="34" rx="2" fill="${C.maroon3}"/>
    <path d="M70 84h20l4 14H66z" fill="${C.maroon8}"/>
    <path d="M52 98h56" stroke="${C.maroon8}" stroke-width="4" stroke-linecap="round"/>
    <g transform="translate(6 46)">
      <path d="M14 0l14 6v9c0 9-6 15-14 17C6 30 0 24 0 15V6z" fill="${C.gold}"/>
      <path d="m8 16 4 4 8-8" stroke="${C.maroon8}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

/** Deterministic course thumbnail art, varied by course code. */
export function courseArt(code = '', cls = '') {
  const seed = [...code].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const palettes = [
    [C.gold, C.maroon7, C.white],
    [C.maroon7, C.gold, C.maroon2],
    [C.maroon2, C.maroon7, C.gold],
    [C.maroon9, C.gold3, C.maroon5],
  ];
  const [bg, a, b] = palettes[seed % palettes.length];
  const variant = seed % 3;
  const shapes = [
    `<circle cx="86" cy="34" r="22" fill="${a}" opacity=".9"/>
     <path d="M0 96 40 56l30 30 20-18 30 30v22H0z" fill="${b}" opacity=".95"/>`,
    `<rect x="22" y="26" width="76" height="52" rx="6" fill="${b}"/>
     <path d="M34 66l14-16 12 10 18-20" stroke="${a}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="60" cy="96" r="10" fill="${a}"/>`,
    `<path d="M60 18l30 12v20c0 22-14 36-30 42-16-6-30-20-30-42V30z" fill="${a}"/>
     <path d="m47 54 9 9 18-20" stroke="${b}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  ][variant];
  return `
  <svg viewBox="0 0 120 120" class="${cls}" aria-hidden="true">
    <rect width="120" height="120" rx="18" fill="${bg}"/>
    ${shapes}
  </svg>`;
}
