// Pure workout calculations and data utilities.
const KG_PER_LB = 0.45359237;
const conv = (w, from, to) => { const n = num(w); if (n == null) return null; if (from === to) return n; return to === "kg" ? n * KG_PER_LB : n / KG_PER_LB; };
const tidy = (n, unit) => n == null ? "" : (unit === "kg" ? Math.round(n*2)/2 : Math.round(n));
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const fmtDate = iso => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"}); } catch { return iso; } };
const e1rm = (w, r) => (w > 0 && r > 0) ? w * (1 + r/30) : 0;
const round1 = n => Math.round(n*10)/10;
const sortSessions = arr => arr.slice().sort((a,b) => (b.date||"").localeCompare(a.date||"") || (b.createdAt||0)-(a.createdAt||0));
const sortBody = arr => arr.slice().sort((a,b) => (a.date||"").localeCompare(b.date||""));
export { conv, tidy, today, uid, num, fmtDate, e1rm, round1, sortSessions, sortBody, esc };
