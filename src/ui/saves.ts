// The save controls beside Start over: Save to file downloads the game, Load from file picks one, says what's wrong
// with it or asks once (tap again) before it replaces the game in progress. Nothing leaves the device: the file is made
// and read in the page. What a save is and how it's checked is the app's (src/app/storage.ts); this only asks and tells.

/** What the save controls need from the page. */
export interface SaveHandlers {
  /** The game as a file: its name and its text. */
  file: () => { name: string; text: string };
  /** Check a file's text: what it is in a few words (for asking) or why it can't be loaded (for a toast), nothing written. */
  read: (text: string) => { ok: true; what: string } | { ok: false; why: string };
  /** Replace the game in progress with the file's (checked again), catching up the time since it was written. */
  load: (text: string) => void;
  toast: (msg: string) => void;
}

const LOAD = 'Load from file';

export function wireSaves(saveBtn: HTMLButtonElement, loadBtn: HTMLButtonElement, input: HTMLInputElement, on: SaveHandlers): void {
  saveBtn.addEventListener('click', () => {
    const { name, text } = on.file();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    on.toast(`Saved as ${name}`);
  });
  // a file waiting for the second tap, and when it stops waiting
  let pending: string | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => { pending = null; clearTimeout(timer); delete loadBtn.dataset['arm']; loadBtn.textContent = LOAD; };
  loadBtn.addEventListener('click', () => {
    if (pending !== null) { const text = pending; disarm(); on.load(text); return; }
    input.value = ''; input.click();
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0]; if (!f) return;
    f.text().then(text => {
      const r = on.read(text);
      if (!r.ok) { disarm(); on.toast(r.why); return; }
      pending = text; loadBtn.dataset['arm'] = '1'; loadBtn.textContent = `Tap again to load ${r.what}`;
      clearTimeout(timer); timer = setTimeout(disarm, 10000);
    }, () => { disarm(); on.toast("That file couldn't be read. Nothing changed."); });
  });
}
