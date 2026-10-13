// The full screen button, in settings under Screen: puts the whole page in full screen and takes it out again, its
// label saying which. Esc and the system's own gestures still leave; the button follows whatever the browser says.
// Where the browser has no full screen for a page (Safari on iPhone) the button and its section are hidden, and the
// web app manifest and iOS meta tags in index.html let the game be added to the home screen instead.

type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type El = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };


export function fullScreen(button: HTMLButtonElement): void {
  const d = document as Doc, root = document.documentElement as El;
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false;
  const section = button.closest('section');
  if (!enabled || !(root.requestFullscreen || root.webkitRequestFullscreen)) { button.hidden = true; if (section) section.hidden = true; return; }
  const current = () => d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
  const show = () => {
    const on = !!current();
    button.textContent = on ? 'Leave full screen' : 'Full screen';
    button.setAttribute('aria-label', button.textContent); button.setAttribute('aria-pressed', String(on));
  };
  button.addEventListener('click', () => {
    const done = current()
      ? (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.())
      : (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen?.());
    Promise.resolve(done).catch(() => {}).then(show);
  });
  document.addEventListener('fullscreenchange', show);
  document.addEventListener('webkitfullscreenchange', show);
  button.hidden = false; if (section) section.hidden = false; show();
}
