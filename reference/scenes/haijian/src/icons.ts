const paths:Record<string,string>={
 ship:'M3 13h18l-3 6H7z M7 13V7h10v6 M12 7V3 M3 22q3-3 6 0t6 0t6 0',
 arrow:'M4 12h15 M13 6l6 6-6 6',back:'M19 12H4 M10 6l-6 6 6 6',
 book:'M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2v16',
 sound:'M11 5L6 9H3v6h3l5 4z M15 8q5 4 0 8 M18 4q9 8 0 16',
 mute:'M11 5L6 9H3v6h3l5 4z M16 9l5 6 M21 9l-5 6',
 settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',close:'M6 6l12 12 M18 6L6 18',
 pause:'M8 5v14 M16 5v14',play:'M7 4l13 8-13 8z',flag:'M5 21V3 M5 3c5-4 8 4 14 0v10c-6 4-9-4-14 0',
 fish:'M5 12c4-7 11-7 14 0-3 7-10 7-14 0z M5 12l-4-5v10z M15 10h.1',
 sun:'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 rain:'M6 14a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 1 9 M7 17l-1 3 M12 17l-1 3 M17 17l-1 3',
 check:'M4 12l5 5L20 6',download:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',rotate:'M4 7V3h4 M4 3l5 5 M19 17v4h-4 M19 21l-5-5 M10 3h7a3 3 0 0 1 3 3v6 M4 12v6a3 3 0 0 0 3 3h3',
 anchor:'M12 8v13 M5 13H2c0 5 4 8 10 8s10-3 10-8h-3 M8 11h8 M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
};
export function icon(name:string){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(paths[name]??paths.ship).split(' M').map((d,i)=>`<path d="${i?'M':''}${d}"/>`).join('')}</svg>`;}
