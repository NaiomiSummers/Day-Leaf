const paths={
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>',
 book:'<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>',
 pill:'<path d="M8 19a5.5 5.5 0 0 1-7-8l8-8a5.5 5.5 0 1 1 8 8l-8 8Z" transform="translate(2 2) scale(.94)"/><path d="m8 8 8 8"/>',
 history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2"/>',
 chart:'<path d="M4 3v17h17M8 16v-4m5 4V7m5 9v-6"/>',
 settings:'<path d="m9 3 .6-1h4.8l.6 2 2 .9 2-.4 2 3.6-1.4 1.5.1 2.4 1.4 1.6-2.1 3.7-2-.4-2 .9-.6 2.2H9.6L9 18.8l-2-.9-2 .4-2.1-3.7 1.4-1.6v-2.4L3 9l2-3.5 2 .4 2-.9Z" transform="translate(0 1)"/><circle cx="12" cy="12" r="3"/>',
 shield:'<path d="M12 2 3.8 5.4V11c0 5.1 3.2 8.7 8.2 11 5-2.3 8.2-5.9 8.2-11V5.4Z"/><path d="m8.5 11.7 2.3 2.3 4.6-4.8"/>',
 heart:'<path d="M20.3 4.9c-2.2-2.1-5.4-1.8-8.3 1.2-2.9-3-6.1-3.3-8.3-1.2-2.8 2.8-1.9 6.6.8 9.5L12 21l7.5-6.6c2.7-2.9 3.6-6.7.8-9.5Z"/>',
 lock:'<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V6a4 4 0 1 1 8 0v4m-4 5v2"/>',
 leaf:'<path d="M4 18C1 8 10 3 21 3c0 12-6 17-14 15m-3 3 11-12"/>',
 list:'<path d="M9 6h12M9 12h12M9 18h12m-18-12 1 1 2-3m-3 8 1 1 2-3m-3 8 1 1 2-3"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m4 12 5 5L20 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l3.5 2"/>',
 menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',
 activity:'<path d="M2 12h5l3-8 4.5 16 3-8H22"/>',cloud:'<path d="M7 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1c5 1 5 11-1 11Z"/>',
 pen:'<path d="m3 21 5-1 12-12-4-4L4 16l-1 5Zm10-14 4 4"/>',
 clipboard:'<rect x="4" y="4.5" width="16" height="17" rx="2.5"/><rect x="8" y="2" width="8" height="5" rx="2"/><path d="M8 12h8m-8 4h6"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',moon:'<path d="M20.5 14A9 9 0 0 1 10 3a9.3 9.3 0 1 0 10.5 11Z"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1.5 1-2 1.4-2 3m0 2v.5"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
 file:'<path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8m-8 4h6"/>',
 circle:'<circle cx="12" cy="12" r="8"/>',print:'<path d="M6 8V3h12v5M6 17H3v-7h18v7h-3M6 14h12v7H6Z"/>',
 phone:'<path d="M4 3h5l1 5-3 2c2 4 3 5 7 7l2-3 5 1v5c-6 3-18-7-18-15Z"/>',
 sprout:'<path d="M12 20v-7C5 14 2 10 2 5c6-1 10 2 10 8 0-7 4-11 10-11 0 6-3 11-10 12"/>',
 bars:'<path d="M4 20v-6h3v6Zm6 0V9h3v11Zm6 0V4h3v16Z"/>'
};
export function icon(name,size=20){
  return '<svg class="icon" aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.circle)+'</svg>';
}
export const mark='<svg aria-hidden="true" width="42" height="42" viewBox="0 0 44 44"><rect width="44" height="44" rx="13" fill="#246452"/><path d="M11 29c-2-9 2-18 20-19 2 13-5 23-17 20" fill="#dceaca"/><path d="M10 35c4-10 11-15 17-21" fill="none" stroke="#377763" stroke-width="2"/><path d="M15 27c-1-3-2-6-2-8m6 3 6-1" fill="none" stroke="#92b093" stroke-width="1.2"/></svg>';

