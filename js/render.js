// DOM presentation primitives.
function icon(name){
  const paths = {activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>', calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>', arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>', spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>', download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>', upload:'<path d="M12 15V3m-5 5 5-5 5 5M4 16v4h16v-4"/>', log:'<path d="M6 6v12M3 9v6M18 6v12M21 9v6M6 12h12"/>', history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2"/>', progress:'<path d="M4 20V4m0 16h16M8 15l4-5 4 2 4-7"/>', data:'<path d="M4 5h6l2 3h8v12H4Z"/>', brand:'<path d="m5 17 7-12 7 12M8 13h8"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.log}</svg>`;
}
export { icon };
