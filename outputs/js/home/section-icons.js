// Traço comum de 24 unidades: os símbolos permanecem legíveis em chips e listas.
const paths = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3M9 14l6 3"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3Z"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3ZM17 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M6 13l3-3 3 2 5-5"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  brain: '<path d="M12 5c-4-5-8 0-6 3-5 0-4 7-1 7-2 5 4 8 7 4m0-14c4-5 8 0 6 3 5 0 4 7 1 7 2 5-4 8-7 4ZM8 8l1 3-2 2m9-5-1 3 2 2M8 17l1-2m7 2-1-2"/>',
  hands: '<path d="M8 21 3 16V8a2 2 0 0 1 4 0v4m1 5-2-3a2 2 0 0 1 3-2l3 4v5m4 0 5-5V8a2 2 0 0 0-4 0v4m-1 5 2-3a2 2 0 0 0-3-2l-3 4"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM3 3l2 2m14 14 2 2M3 21l2-2M19 5l2-2"/>',
  leaf: '<path d="M5 19C0 7 11 2 21 3c0 11-5 19-14 15M3 22 16 8m-7 7V9m3 3h5"/>',
  heart: '<path d="M12 21 3.5 12.5C-2 6 6 0 12 7c6-7 14-1 8.5 5.5Z"/>',
  balance: '<path d="M12 3v18m-5 0h10M4 7h16M6 7l-4 9h8Zm12 0-4 9h8Z"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8m-8 4h5"/>',
  book: '<path d="M12 5C8 2 3 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-1-1-6-2-10 1Zm0 0v15"/>',
  study: '<path d="m2 8 10-5 10 5-10 5ZM6 10v7c4 3 8 3 12 0v-7m4-2v9"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h2m3 0h2m3 0h1M7 18h2m3 0h2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  movement: '<circle cx="13" cy="4" r="2"/><path d="m3 9 7 2 6-4 5 2m-11 2 2 5-6 6m6-6 6 5m-6-5 4-9"/>',
  music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  art: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4 2 2 0 0 1 1-4h2c6 0 2-10-6-10Z"/><circle cx="7" cy="9" r="1"/><circle cx="11" cy="6" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="6" cy="14" r="1"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4m-11-1V9l4 3Z"/>',
  coffee: '<path d="M4 9h12v6a6 6 0 0 1-12 0Zm12 1h2a3 3 0 0 1 0 6h-2M2 22h18M7 2v3m5-3v3"/>',
  gem: '<path d="m3 8 4-5h10l4 5-9 13Zm0 0h18M7 3l5 18 5-18"/>',
  drop: '<path d="M12 2C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-13ZM9 15a3 3 0 0 0 3 3"/>',
  wind: '<path d="M2 8h13a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M2 16h7a3 3 0 1 1-3 3"/>',
  moon: '<path d="M21 14A9 9 0 0 1 10 3a9 9 0 1 0 11 11Z"/>',
  pen: '<path d="m4 20 1-6L16 3a2 2 0 0 1 5 5L10 19Zm10-15 5 5M4 20h7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  home: '<path d="m2 11 10-8 10 8M5 9v12h14V9M9 21v-7h6v7"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 3"/>',
};

export const SECTION_ICON_NAMES = Object.keys(paths);
export function sectionIcon(name) {
  return `<svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.compass}</svg>`;
}
