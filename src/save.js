const KEY = 'the-commute-v1';
export function load() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
export function save(state) { try { localStorage.setItem(KEY, JSON.stringify({ ...state, at: Date.now() })); } catch (_) {} }
export function wipe() { try { localStorage.removeItem(KEY); } catch (_) {} }
