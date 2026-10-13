// For the browser checks: bring a control in the sheet (src/ui/sheet.ts) into view before a check taps it, the way a
// player would get to it: the sheet raised from its peek if the control is in the sheet's body or lowered to it if it's on the strip or a map view, the Buy bar put back
// if it hides the strip (a short page), the Light popover opened for the light's slider, settings opened for what's in
// them, and a picked card's Buy taken from the Buy bar while the sheet is sunk to its peek. Returns the selector to tap
// (the Buy bar's button stands in for a card's Buy). A card that isn't open is opened first by the check, from its
// chip on the strip (or the cash pill for the network). The checks of the sheet itself (layout, preview) tap their way.
export async function reveal(page, sel) {
  return page.evaluate(async sel => {
    const wait = () => new Promise(r => setTimeout(r, 300));
    const shown = e => !!e && e.getClientRects().length > 0;
    const click = id => document.getElementById(id)?.click();
    let e = document.querySelector(sel); if (!e) return sel;
    // a card's Buy while the Buy bar holds it
    const bar = document.getElementById('barBuy');
    if (e.matches('[data-up]') && shown(bar) && bar.dataset.for === e.dataset.up) return '#barBuy';
    if (e.closest('#lightPop') && document.getElementById('lightPop').hidden) { click('vLight'); await wait(); }
    if (e.closest('#settings') && !document.getElementById('settings').open) { click('vSet'); await wait(); }
    const sheet = document.getElementById('sheet');
    // the strip is in the peek, and the map views hide while the sheet is raised: lower it to its peek; and put the Buy
    // bar back if it hides the strip
    for (let k = 0; k < 2 && e.closest('.sh-peek, .views') && sheet && sheet.dataset.at !== 'peek' && sheet.dataset.at !== 'docked'; k++) { click('sheetHandle'); await wait(); }
    if (e.closest('#strip') && !shown(e) && shown(bar)) { click('barClose'); await wait(); }
    if (e.closest('.sh-body') && sheet?.dataset.at === 'peek') { click('sheetHandle'); await wait(); }
    // a slow page may still be easing the sheet to its height: wait until it stands there
    for (let k = 0; k < 40 && sheet && sheet.style.height && Math.abs(sheet.offsetHeight - parseFloat(sheet.style.height)) > 1; k++) await new Promise(r => setTimeout(r, 100));
    e = document.querySelector(sel); e?.scrollIntoView({ block: 'center' }); await wait();
    return sel;
  }, sel);
}
