import { LOCAL_KEY, DRAFT_KEY } from "./config.js";
export function createLocalStorage({state, preferences, toast}) {
function readLocal(){ try { const j = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); return { sessions: Array.isArray(j.sessions)?j.sessions:[], body: Array.isArray(j.body)?j.body:[], custom: Array.isArray(j.custom)?j.custom:[], schedules:j.schedules || [], preferences:j.preferences || {} }; } catch { toast("Stored data could not be read. Restore a JSON backup."); return {sessions:[],body:[],custom:[],schedules:[],preferences:{}}; } }
function writeLocal(){ try { localStorage.setItem(LOCAL_KEY, JSON.stringify({sessions:state.sessions, body:state.body, custom:state.custom, drafts:state.drafts, schedules:state.schedules, preferences:preferences()})); return true; } catch { return false; } }
function loadDrafts(){ try { const saved=JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}"); const d=saved.drafts || JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}"); state.drafts = d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch { state.drafts = {}; } }
  return {readLocal, writeLocal, loadDrafts};
}
