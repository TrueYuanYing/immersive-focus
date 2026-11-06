// Small, static menu illustrations. Colors inherit the cafe palette in style.css.
const art: Record<string, string> = {
  '美式': `<path fill="var(--drink-porcelain)" d="M9 18h25v13c0 7-5 10-12 10S9 38 9 31Z"/><path d="M34 20h4c7 0 7 12 0 12h-4"/><ellipse cx="21.5" cy="18" rx="12.5" ry="4" fill="var(--drink-coffee)"/><path d="M10 44h26M17 5c-4 3 4 4 0 7m9-8c-4 3 4 4 0 7"/>`,
  '拿铁': `<path fill="var(--drink-latte)" d="m11 17 3 23h21l3-23Z"/><path d="m13 30 23 0" stroke="var(--drink-milk)" stroke-width="5"/><ellipse cx="24.5" cy="17" rx="13.5" ry="5" fill="var(--drink-milk)"/><path d="M24.5 20c-8-4-6-7-2-5l2 2 2-2c4-2 6 1-2 5Z" fill="var(--drink-latte)" stroke="none"/><path d="M15 44h20M21 5c-3 3 3 3 0 6m7-7c-3 3 3 3 0 6"/>`,
  '冰咖啡': `<path fill="var(--drink-glass)" d="m11 11 3 32h21l3-32Z"/><path fill="var(--drink-coffee)" stroke="none" d="m14 24 2 17h17l2-17Z"/><path d="m28 23 4-20h8"/><path fill="var(--drink-ice)" d="m17 17 8 1-1 8-8-1Zm9 10 7-2 2 7-7 2Z"/><ellipse cx="24.5" cy="11" rx="13.5" ry="3" fill="none"/>`,
  '抹茶拿铁': `<path fill="var(--drink-porcelain)" d="M9 19h25v14c0 6-5 9-12 9S9 39 9 33Z"/><path d="M34 22h4c6 0 6 11 0 11h-4"/><ellipse cx="21.5" cy="19" rx="12.5" ry="4.5" fill="var(--drink-matcha)"/><path d="M16 19c0-6 8-8 12-7-1 5-6 10-12 7Zm1 0 8-5" stroke="var(--drink-milk)" fill="none"/><path d="M15 7c-3 3 3 3 0 6M10 45h26"/>`,
  '热可可': `<path fill="var(--drink-cocoa)" d="M10 20h24v14c0 6-5 9-12 9s-12-3-12-9Z"/><path d="M34 23h4c7 0 7 12 0 12h-4"/><path fill="var(--drink-milk)" d="M9 20c-1-4 2-5 5-5-1-3 2-5 6-5-1-4 3-6 5-6-1 5 9 5 6 11 5 0 6 3 4 5Z"/><path fill="var(--drink-coffee)" d="m27 6 7-2 3 9-7 2Z"/><path d="M11 46h24M18 17h3m4 0h2"/>`,
};

export const drinkNotes: Record<string, string> = {
  '美式': '清爽 · 醇香', '拿铁': '柔和 · 温热', '冰咖啡': '冰凉 · 清醒',
  '抹茶拿铁': '茶香 · 轻甜', '热可可': '浓郁 · 暖心',
};

export function drinkIcon(drink: string): string {
  return `<svg class="drink-illustration" width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="var(--drink-ink)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${art[drink] ?? art['拿铁']}</svg>`;
}
