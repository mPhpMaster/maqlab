// Original "Jelly" critters for MAQLAB — soft gradient blobs, no heavy outlines.
(function () {
  const INK = '#2a2250';
  const COLORS = ['#ff7a85', '#ffa66b', '#ffd65c', '#b5e86b', '#4fe0b0', '#3cc9d6', '#5aaeff', '#7d8cff', '#a883ff', '#e27bff', '#ff82c4', '#f3e9d8', '#8e9ab5', '#5b5f80'];

  const mix = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    const f = v => Math.round((t - v) * p + v);
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  };

  // body shapes: [path, top-of-head y]
  const SHAPES = [
    ['M50 22C74 22 86 40 86 60C86 80 72 90 50 90C28 90 14 80 14 60C14 40 26 22 50 22Z', 22],
    ['M50 15C70 15 80 32 80 55C80 78 68 90 50 90C32 90 20 78 20 55C20 32 30 15 50 15Z', 15],
    ['M22 44L19 15L40 29C46 27 54 27 60 29L81 15L78 44C84 51 86 57 86 64C86 82 70 90 50 90C30 90 14 82 14 64C14 57 16 51 22 44Z', 27],
    ['M18 56C18 32 32 18 50 18C68 18 82 32 82 56V88L72 80L61 88L50 80L39 88L28 80L18 88Z', 18],
    ['M50 10C58 30 86 40 86 64C86 82 70 90 50 90C30 90 14 82 14 64C14 40 42 30 50 10Z', 16],
    ['M50 24C74 24 86 42 86 61C86 80 72 90 50 90C28 90 14 80 14 61C14 42 26 24 50 24Z', 24],
  ];

  const eyeDot = (x, y, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + 1.6}" cy="${y - 1.8}" r="${r * 0.36}" fill="#fff"/>`;
  const EYES = [
    () => eyeDot(38, 55) + eyeDot(62, 55),
    () => `<path d="M32 57Q38 49 44 57M56 57Q62 49 68 57" stroke="${INK}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
    () => [38, 62].map(x => `<ellipse cx="${x}" cy="54" rx="7" ry="8.5" fill="#fff"/><ellipse cx="${x + 1}" cy="55.5" rx="4.6" ry="5.6" fill="${INK}"/><circle cx="${x + 2.6}" cy="52.5" r="1.9" fill="#fff"/>`).join(''),
    () => `<path d="M32 56H44M56 56H68" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`,
    () => eyeDot(38, 55) + `<path d="M56 56Q62 51 68 56" stroke="${INK}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
    () => [38, 62].map(x => `<path d="M${x} 47l2.4 5 5.4.6-4 3.7 1.1 5.3-4.9-2.7-4.9 2.7 1.1-5.3-4-3.7 5.4-.6z" fill="#ffd65c" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`).join(''),
    () => [38, 62].map(x => `<path d="M${x} 61l-6.5-6.2a4 4 0 0 1 6.5-4.6a4 4 0 0 1 6.5 4.6z" fill="#ff5d7e"/>`).join(''),
    () => `<rect x="28" y="49" width="19" height="11" rx="5" fill="${INK}"/><rect x="53" y="49" width="19" height="11" rx="5" fill="${INK}"/><path d="M47 53H53" stroke="${INK}" stroke-width="3"/><path d="M31 52l5 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
    () => `<circle cx="50" cy="54" r="11" fill="#fff"/><circle cx="51" cy="55" r="6.5" fill="${INK}"/><circle cx="53.5" cy="52" r="2.2" fill="#fff"/>`,
    () => [38, 62].map(x => `<path d="M${x - 5} ${50}l10 10M${x + 5} 50l-10 10" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`).join(''),
  ];

  const MOUTHS = [
    () => `<path d="M42 68Q50 75 58 68" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    () => `<path d="M40 66H60Q59 80 50 80Q41 80 40 66Z" fill="${INK}"/><path d="M44 74Q50 71 56 74Q54 79 50 79Q46 79 44 74Z" fill="#ff7a95"/>`,
    () => `<ellipse cx="50" cy="71" rx="4.5" ry="5.5" fill="${INK}"/>`,
    () => `<path d="M42 67Q50 73 58 67" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M47 70Q47 78 51 78Q55 78 54 70Z" fill="#ff7a95"/>`,
    () => `<path d="M42 67Q46 72 50 67Q54 72 58 67" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    () => `<path d="M44 70H56" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`,
    () => `<rect x="40" y="65" width="20" height="10" rx="5" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M46.7 65V75M53.3 65V75" stroke="${INK}" stroke-width="1.8"/>`,
    () => `<path d="M42 70Q51 72 58 65" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    () => `<path d="M42 67Q50 73 58 67" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M45 69l2 4 2-3" fill="#fff" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
    () => `<path d="M46 68Q50 71 54 68" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  ];

  // hats are drawn assuming head top at y=22, then shifted per shape
  const HATS = [
    () => '',
    () => `<path d="M33 22L36 5L44 14L50 2L56 14L64 5L67 22Z" fill="#ffd65c" stroke="#e0a800" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="14" r="2.6" fill="#ff5d7e"/>`,
    () => `<path d="M38 24L52 -6L64 24Z" fill="#a883ff"/><path d="M44 13L60 13M41 19L63 19" stroke="#ffd65c" stroke-width="2.6"/><circle cx="52" cy="-6" r="4" fill="#ffd65c"/>`,
    () => `<path d="M26 28Q26 4 50 4Q74 4 74 28Z" fill="#ff7a85"/><rect x="24" y="22" width="52" height="9" rx="4.5" fill="#e0566a"/><circle cx="50" cy="4" r="5" fill="#fff"/>`,
    () => `<path d="M24 28Q26 6 50 6Q74 6 76 28Z" fill="#5aaeff"/><path d="M70 26Q94 25 96 32L72 32Z" fill="#3b8de0"/><circle cx="50" cy="7" r="3" fill="#fff"/>`,
    () => `<g transform="translate(68 22) rotate(15)"><path d="M0 0L-13-9Q-16 0-13 9ZM0 0L13-9Q16 0 13 9Z" fill="#ff82c4"/><circle r="4.5" fill="#ffb3dc"/></g>`,
    () => `<g transform="translate(30 24)">${[0, 72, 144, 216, 288].map(r => `<ellipse rx="4.6" ry="7.5" transform="rotate(${r}) translate(0 -6.5)" fill="#fff"/>`).join('')}<circle r="4.6" fill="#ffd65c"/></g>`,
    () => `<ellipse cx="50" cy="6" rx="21" ry="5.5" fill="none" stroke="#ffe27a" stroke-width="4"/>`,
    () => `<path d="M30 28Q22 12 30 4Q32 16 40 22Z" fill="#ff5d5d"/><path d="M70 28Q78 12 70 4Q68 16 60 22Z" fill="#ff5d5d"/>`,
    () => `<path d="M50 24V10" stroke="#3aa36a" stroke-width="3" stroke-linecap="round"/><path d="M50 12Q38 2 32 10Q42 16 50 12Z" fill="#6fd98f"/><path d="M50 10Q60 0 68 6Q60 14 50 10Z" fill="#4fc67a"/>`,
    // ghutra + agal
    () => `<path d="M14 58Q12 22 50 14Q88 22 86 58Q80 40 50 36Q20 40 14 58Z" fill="#fbfbff" stroke="#dcdcee" stroke-width="1.5"/><path d="M14 58Q12 70 10 84L18 76Q18 64 22 52Z" fill="#fbfbff"/><path d="M86 58Q88 70 90 84L82 76Q82 64 78 52Z" fill="#fbfbff"/><ellipse cx="50" cy="26" rx="30" ry="6" fill="none" stroke="#1d1a2e" stroke-width="4"/><ellipse cx="50" cy="26" rx="30" ry="6" fill="none" stroke="#3a3552" stroke-width="1.2"/>`,
    // fez
    () => `<path d="M36 24L39 4H61L64 24Z" fill="#e0434f"/><ellipse cx="50" cy="4" rx="11" ry="3" fill="#c12f3b"/><path d="M50 4Q58 8 60 20" stroke="#1d1a2e" stroke-width="2" fill="none"/><circle cx="60" cy="21" r="2.6" fill="#1d1a2e"/>`,
  ];

  let uid = 0;
  function svg(av, cls = 'jelly') {
    av = av || { s: 0, c: 6, e: 0, m: 0, h: 0 };
    const col = COLORS[(av.c || 0) % COLORS.length];
    const [shape, top] = SHAPES[(av.s || 0) % SHAPES.length];
    const id = 'j' + (++uid);
    const light = mix(col, 0.45), dark = mix(col, -0.22);
    const hatIdx = (av.h || 0) % HATS.length;
    const ghutra = hatIdx === 10;
    const hat = HATS[hatIdx]();
    const dy = ghutra ? 0 : top - 22;
    const antenna = (av.s || 0) % SHAPES.length === 5
      ? `<path d="M40 26Q36 12 30 8M60 26Q64 12 70 8" stroke="${dark}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="30" cy="8" r="4.5" fill="${light}"/><circle cx="70" cy="8" r="4.5" fill="${light}"/>` : '';
    return `<svg class="${cls}" style="--bd:-${((uid * 1.37) % 5.5).toFixed(2)}s" viewBox="0 -8 100 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${col}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>
      <ellipse cx="50" cy="95" rx="28" ry="4.5" fill="#000" opacity=".18"/>
      ${antenna}
      <path d="${shape}" fill="url(#${id})"/>
      <ellipse cx="36" cy="${top + 13}" rx="9" ry="5" fill="#fff" opacity=".35" transform="rotate(-20 36 ${top + 13})"/>
      <ellipse cx="30" cy="67" rx="5.5" ry="3.2" fill="#ff6f91" opacity=".35"/><ellipse cx="70" cy="67" rx="5.5" ry="3.2" fill="#ff6f91" opacity=".35"/>
      <g class="look"><g class="eyes">${EYES[(av.e || 0) % EYES.length]()}</g></g>
      ${MOUTHS[(av.m || 0) % MOUTHS.length]()}
      <g transform="translate(0 ${dy})">${hat}</g>
    </svg>`;
  }

  const random = () => ({ s: Math.floor(Math.random() * SHAPES.length), c: Math.floor(Math.random() * COLORS.length), e: Math.floor(Math.random() * EYES.length), m: Math.floor(Math.random() * MOUTHS.length), h: Math.floor(Math.random() * HATS.length) });

  window.Jelly = { svg, random, COLORS, count: { s: SHAPES.length, c: COLORS.length, e: EYES.length, m: MOUTHS.length, h: HATS.length } };
})();
