// For the browser checks: bring a control in the sheet (src/ui/sheet.ts) into view before a check taps it, the way a
// player would get to it: the sheet raised from its peek if the control is in the sheet's body, the Station or Line
// tab chosen if it's on the other, the Light popover opened for the light's slider, settings opened for what's in
// them, and a picked card's Buy taken from the Buy bar while the sheet is sunk to its peek. Returns the selector to tap
// (the Buy bar's button stands in for a card's Buy). The checks of the sheet itself (layout, preview) tap their way.
export async function reveal(page, sel) {
  return page.evaluate(async sel => {
    const wait = () => new Promise(r => setTimeout(r, 300));
    const shown = e => !!e && e.getClientRects().length > 0;
    const click = id => document.getElementById(id)?.click();
    let e = document.querySelector(sel); if (!e) return sel;
    // a card's Buy while the Buy bar holds it
    const bar = document.getElementById('barBuy');
    if (e.matches('[data-up], [data-lup]') && shown(bar) && bar.dataset.for === (e.dataset.up ?? e.dataset.lup)) return '#barBuy';
    if (e.closest('#lightPop') && document.getElementById('lightPop').hidden) { click('vLight'); await wait(); }
    if (e.closest('#settings') && !document.getElementById('settings').open) { click('vSet'); await wait(); }
    const sheet = document.getElementById('sheet');
    if (e.closest('#panel') && document.getElementById('panel').hidden) { click('tabStation'); await wait(); }
    if (e.closest('#linePanel') && document.getElementById('linePanel').hidden) { click('tabLine'); await wait(); }
    if (e.closest('.sh-body') && sheet?.dataset.at === 'peek') { click('sheetHandle'); await wait(); }
    e = document.querySelector(sel); e?.scrollIntoView({ block: 'center' }); await wait();
    return sel;
  }, sel);
}
