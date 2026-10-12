// The stage's full screen button: puts the whole page (top bar and panels included) in full screen and takes it out
// again, its icon and label saying which. Esc and the system's own gestures still leave; the button follows whatever
// the browser says. Where the browser has no full screen for a page (Safari on iPhone) the button is hidden, and the
// web app manifest and iOS meta tags in index.html let the game be added to the home screen instead.
import './styles/fullscreen.css';

type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type El = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const ENTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
const LEAVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';

export function fullScreen(button: HTMLButtonElement): void {
  const d = document as Doc, root = document.documentElement as El;
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false;
  if (!enabled || !(root.requestFullscreen || root.webkitRequestFullscreen)) { button.hidden = true; return; }
  const current = () => d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
  const show = () => {
    const on = !!current();
    button.innerHTML = on ? LEAVE : ENTER;
    button.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    button.title = on ? 'Leave full screen' : 'Full screen';
  };
  button.addEventListener('click', () => {
    const done = current()
      ? (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.())
      : (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen?.());
    Promise.resolve(done).catch(() => {}).then(show);
  });
  document.addEventListener('fullscreenchange', show);
  document.addEventListener('webkitfullscreenchange', show);
  button.hidden = false; show();
}
