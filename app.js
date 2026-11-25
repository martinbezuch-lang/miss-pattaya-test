/* =====================================================================
   MISS of Pattaya – standalone competition site
   CONFIG: fill in from Supabase → Project Settings → API.
   While empty, the site runs in DEMO mode (data only in this browser).
   ===================================================================== */
import { T, LANGS } from './i18n.js';

// The same files run the public site and the private test copy (repo miss-pattaya-test / test.* subdomain).
const IS_TEST = /\/miss-pattaya-test(\/|$)/.test(location.pathname) || /^test\./.test(location.hostname);
const CONFIGS = {
  live: {
    SUPABASE_URL: 'https://gtblftngzitbiwmrvomj.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_p7mVlg_b_GWr9-XjQBrHBw_qzF6XQlC', // public (publishable) key
    GOOGLE_LOGIN: false, // turn on after enabling Google in Supabase → Authentication → Providers
    PRIVATE: false
  },
  test: { // private: only admins of the test database see anything, photos are in a private bucket
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    GOOGLE_LOGIN: false,
    PRIVATE: true
  }
};
const CONFIG = IS_TEST ? CONFIGS.test : CONFIGS.live;
const DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const store = (() => { const mem = {}; return {
  get(k, d){ try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch {} return k in mem ? mem[k] : d; },
  set(k, v){ mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k){ delete mem[k]; try { localStorage.removeItem(k); } catch {} } }; })();

/* ---------------- language ---------------- */
const LANG_CODES = LANGS.map(l => l[0]);
function pickLang(){
  const saved = store.get('mp_lang'); if (LANG_CODES.includes(saved)) return saved;
  for (const l of navigator.languages || [navigator.language || 'en']){ const c = String(l).slice(0, 2).toLowerCase(); if (LANG_CODES.includes(c)) return c; }
  return 'en';
}
let LANG = pickLang();
const LOCALE = { en:'en-GB', sk:'sk-SK', cs:'cs-CZ', de:'de-DE', ru:'ru-RU', ko:'ko-KR', ja:'ja-JP', hi:'hi-IN' };
let plural = new Intl.PluralRules(LANG);
function t(key, v = {}){
  let s = T[LANG][key] ?? T.en[key] ?? key;
  if (typeof s === 'object'){ s = s[plural.select(Number(v.n))] ?? s.other ?? s.one; }
  return String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
}
const ord = n => ({ en: n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'), ru: n + '-е', ko: n + '위', ja: n + '位', hi: 'स्थान ' + n, th: 'ที่ ' + n }[LANG] || n + '.');
const place = n => t('place', { o: ord(n) });
const votesTxt = n => t('votes_n', { n });
const creditsTxt = n => t('credits_n', { n });
const fmtDate = iso => new Date(iso).toLocaleDateString(LOCALE[LANG], { day:'numeric', month:'short', year:'numeric' });
const fmtDateTime = iso => new Date(iso).toLocaleString(LOCALE[LANG], { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
function errMsg(err){
  const m = String(err?.message || err || ''), x = m.match(/E:([A-Z0-9_]+)(?:\|(\S+))?/);
  if (!x) return m;
  const s = (T[LANG].E || {})[x[1]] || T.en.E[x[1]] || m;
  return s.replace('{d}', x[2] ? fmtDateTime(x[2]) : '');
}
function applyStaticText(){
  document.documentElement.lang = LANG;
  document.title = `${state.miss?.st.title || t('site')} 👑`;
  $('#footer').textContent = t('footer');
}

/* ---------------- countries ---------------- */
const ISO = ('TH,RU,CN,IN,KR,JP,DE,GB,US,FR,IT,ES,NL,BE,CH,AT,SK,CZ,PL,HU,UA,BY,KZ,UZ,RO,BG,HR,SI,RS,GR,TR,IL,AE,SA,QA,KW,EG,MA,ZA,NG,KE,'
  + 'SE,NO,DK,FI,EE,LV,LT,IE,PT,LU,MD,GE,AM,AZ,MN,VN,LA,KH,MM,MY,SG,ID,PH,TW,HK,BD,PK,LK,NP,AU,NZ,CA,MX,BR,AR,CL,CO,PE,VE,CU,DO').split(',');
let regionNames;
const countryName = c => { if (!c || c === 'XX') return t('other_country'); try { return regionNames.of(c) || c; } catch { return c; } };
const countryList = () => [...ISO].sort((a, b) => countryName(a).localeCompare(countryName(b), LOCALE[LANG])).map(c => [c, countryName(c)]).concat([['XX', t('other_country')]]);
const flagOf = c => !c || c === 'XX' ? '🌍' : String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt(0)));
function setLang(l){
  LANG = l; store.set('mp_lang', l); plural = new Intl.PluralRules(l);
  try { regionNames = new Intl.DisplayNames([LOCALE[l]], { type:'region' }); } catch { regionNames = null; }
}
setLang(LANG);

const LINK_DEFS = [['instagram','Instagram','https://instagram.com/'],['tiktok','TikTok','https://www.tiktok.com/@'],['youtube','YouTube','https://youtube.com/@'],
  ['onlyfans','OnlyFans','https://onlyfans.com/'],['x','X / Twitter','https://x.com/'],['linktree','Linktree','https://linktr.ee/'],['web','Web','']];
const PER_PAGE = 10;
const signedPhotos = new Map(); // private copy: path → temporary signed URL
const photosHidden = () => ((state.miss?.st.ui) || {}).hide_photos === true; // admin switch: hide every photo from visitors
const missPhoto = p => !p || (photosHidden() && !realAdmin()) ? '' : DEMO ? p : CONFIG.PRIVATE ? (signedPhotos.get(p) || '') : `${CONFIG.SUPABASE_URL}/storage/v1/object/public/miss/${p}`;
async function signPhotos(paths){
  if (DEMO || !CONFIG.PRIVATE) return;
  const need = [...new Set(paths.filter(p => p && !signedPhotos.has(p)))];
  if (!need.length) return;
  try { for (const x of await api.signPhotos(need)) if (x.signedUrl) signedPhotos.set(x.path, x.signedUrl); } catch(e){ console.warn(e); }
}
const missPhotoOf = c => missPhoto(c.photo_path);
function normLink(key, v){
  v = (v || '').trim(); if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const base = LINK_DEFS.find(l => l[0] === key)?.[2];
  return base ? base + v.replace(/^@/, '') : 'https://' + v;
}

let toastTimer;
function toast(msg, isErr){ const el = $('#toast'); el.textContent = msg; el.className = 'show' + (isErr ? ' err' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 3200); }
function openModal(html, wide){ const d = $('#dialog'); d.className = 'dialog' + (wide ? ' wide' : ''); d.innerHTML = `<button class="x" data-close aria-label="×">×</button>` + html; $('#modal').hidden = false; }
function closeModal(){ $('#modal').hidden = true; }
function confirmClick(btn, label){
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (btn.isConnected){ delete btn.dataset.armed; btn.textContent = old; } }, 3500);
  return false;
}

/* =====================================================================
   BACKEND – DEMO (localStorage)
   ===================================================================== */
function makeDemoApi(){
  const K = { set:'mp_set', c:'mp_c', v:'mp_v', w:'mp_w', s:'mp_session', p:'mp_profiles', res:'mp_res' };
  const sess = () => store.get(K.s, null);
  if (!store.get(K.set)){
    store.set(K.set, { id:1, title:'MISS of Pattaya', registration_until:new Date(Date.now() + 200 * 864e5).toISOString(), current_round:1, voting_open:true, group_size:5, vote_hours:8, eliminate_count:2,
      ui:{ instagram:true, star:true, need:true }, round_ends_at:new Date(Date.now() + 9 * 864e5).toISOString() });
    const names = ['Ploy','Anya','Mina','Yuki','Lena','Sofia','Nok','Daria','Hana','Priya','Emma','Mai','Olga','Jisoo','Aiko','Nina','Fah','Katya','Sara','Lucia','Bow','Elena','Anna','Kim','Ying','Mia','Alina','Rin','Tara','Eva'];
    const cc = ['TH','RU','KR','JP','DE','UA','TH','RU','KR','IN','GB','TH','RU','KR','JP','SK','TH','UA','IN','CZ','TH','RU','DE','KR','CN','US','KZ','JP','IN','FR'];
    store.set(K.c, names.map((n, i) => ({ id:i + 1, user_id:'fake-' + i, first_name:n, country:cc[i], birth_date:`${1992 + (i * 7) % 14}-0${1 + i % 9}-1${i % 9}`,
      photo_path:null, city:'Pattaya', favorite_food:'Tom yum', favorite_city:'Bangkok', hobbies:'beach, yoga, travel', about:'Hi, I am ' + n + '!',
      links:{ instagram:'https://instagram.com/' }, status:'approved', round:1, group_no:Math.floor(i / 5) + 1, eliminated_round:null, created_at:new Date().toISOString() })));
    store.set(K.v, names.map((n, i) => ({ contestant_id:i + 1, user_id:'fake', round:1, group_no:Math.floor(i / 5) + 1, votes:Math.floor(Math.random() * 60), paid:false, created_at:'2026-01-01T00:00:00Z' })));
  }
  const age = d => { const b = new Date(d), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
  const votesOf = c => store.get(K.v, []).filter(v => v.contestant_id === c.id && v.round === c.round).reduce((s, v) => s + v.votes, 0);
  const pub = c => ({ ...c, age: age(c.birth_date), votes: votesOf(c), instagram: (c.links || {}).instagram || null });
  const isAdm = () => !!(sess() && (store.get(K.p, {})[sess().id] || {}).is_admin);
  return {
    mode: 'demo',
    async getUser(){ const s = sess(); if (!s) return null;
      if (CONFIG.PRIVATE){ const p = store.get(K.p, {}); if (!(p[s.id] || {}).is_admin){ p[s.id] = { gender:'male', birth_year:1985, country:'TH', ...(p[s.id] || {}), is_admin:true }; store.set(K.p, p); } }
      return { id: s.id, email: s.email }; },
    onAuth(){},
    async signInPassword(email){ const id = 'u-' + email.toLowerCase(); store.set(K.s, { id, email });
      if (CONFIG.PRIVATE){ const p = store.get(K.p, {}); p[id] = { gender:'male', birth_year:1985, country:'TH', ...(p[id] || {}), is_admin:true }; store.set(K.p, p); } // private test copy: every sign-in is admin (like setup_test.sql)
      location.reload(); },
    async signUpPassword(email){ return this.signInPassword(email); },
    async signInEmail(email){ return this.signInPassword(email); },
    async signInGoogle(){ throw new Error('Google sign-in is not available in demo mode.'); },
    async demoLogin(admin){ const id = admin ? 'demo-admin' : 'demo-user'; store.set(K.s, { id, email: admin ? 'admin@demo.test' : 'visitor@demo.test' });
      if (admin){ const p = store.get(K.p, {}); p[id] = { gender:'male', birth_year:1985, country:'TH', ...(p[id] || {}), is_admin:true }; store.set(K.p, p); } location.reload(); },
    async signOut(){ store.del(K.s); location.reload(); },
    async getProfile(uid){ return store.get(K.p, {})[uid] || null; },
    async saveProfile(uid, d){ const p = store.get(K.p, {}); p[uid] = { ...(p[uid] || {}), ...d, is_admin: !!(p[uid] || {}).is_admin }; store.set(K.p, p); },
    async missSettings(){ return store.get(K.set); },
    async missSaveSettings(s){ store.set(K.set, { ...store.get(K.set), ...s }); },
    async missBoard(){ const st = store.get(K.set); return store.get(K.c, []).filter(c => c.status === 'approved' && !c.eliminated_round && c.round === st.current_round && c.group_no).map(pub); },
    async missProfile(id){ const c = store.get(K.c, []).find(x => x.id === id); return c && (c.status === 'approved' || isAdm() || c.user_id === sess()?.id) ? pub(c) : null; },
    async myMissVotes(uid, round){ return store.get(K.v, []).filter(v => v.user_id === uid && v.round === round); },
    async missVote(uid, id, credits){
      const st = store.get(K.set), c = store.get(K.c, []).find(x => x.id === id), n = credits || 0, vs = store.get(K.v, []);
      if (!st.voting_open) throw new Error('E:VOTING_CLOSED');
      if (st.round_ends_at && Date.parse(st.round_ends_at) < Date.now() && !isAdm()) throw new Error('E:ROUND_ENDED');
      if (!n){ const last = vs.filter(v => v.user_id === uid && v.round === c.round && v.group_no === c.group_no && !v.paid).map(v => v.created_at).sort().pop();
        if (last && Date.now() - Date.parse(last) < st.vote_hours * 36e5 && !isAdm()) throw new Error('E:COOLDOWN|' + new Date(Date.parse(last) + st.vote_hours * 36e5).toISOString()); }
      else { const w = store.get(K.w, {}); if ((w[uid] || 0) < n) throw new Error('E:NO_CREDITS'); w[uid] -= n; store.set(K.w, w); }
      vs.push({ contestant_id:id, user_id:uid, round:c.round, group_no:c.group_no, votes:n || 1, paid:!!n, created_at:new Date().toISOString() }); store.set(K.v, vs);
    },
    async myContestant(uid){ return store.get(K.c, []).find(c => c.user_id === uid) || null; },
    async saveContestant(uid, row){
      const l = store.get(K.c, []), i = l.findIndex(c => c.user_id === uid);
      if (row.birth_date && age(row.birth_date) < 18) throw new Error('E:UNDER18');
      if (i < 0 && (store.get(K.p, {})[uid] || {}).gender !== 'female' && !isAdm()) throw new Error('E:FEMALE_ONLY');
      if (i >= 0) l[i] = { ...l[i], ...row, status: isAdm() ? l[i].status : 'pending' };
      else l.push({ ...row, id: Math.max(0, ...l.map(c => c.id)) + 1, user_id:uid, status:'pending', round:store.get(K.set).current_round, group_no:null, eliminated_round:null, created_at:new Date().toISOString() });
      store.set(K.c, l);
    },
    async uploadMissPhoto(uid, blob){ return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); },
    async signPhotos(){ return []; },
    async missSetPhoto(id, path){ const l = store.get(K.c, []), c = l.find(x => x.id === id); if (c){ c.photo_path = path; store.set(K.c, l); } },
    async missWallet(uid){ return store.get(K.w, {})[uid] || 0; },
    async missPending(){ return store.get(K.c, []).filter(c => c.status === 'pending'); },
    async missSetStatus(id, status){
      const l = store.get(K.c, []), c = l.find(x => x.id === id); c.status = status;
      if (status === 'approved' && !c.group_no){ const st = store.get(K.set); const act = l.filter(x => x.round === c.round && x.group_no && !x.eliminated_round && x.id !== c.id);
        let g = Math.max(1, ...act.map(x => x.group_no)); if (act.filter(x => x.group_no === g).length >= st.group_size) g++; c.group_no = g; }
      store.set(K.c, l);
    },
    async missNewRound(elim, size, pots, ends){
      const st = store.get(K.set), l = store.get(K.c, []), act = l.filter(c => c.status === 'approved' && !c.eliminated_round && c.round === st.current_round && c.group_no);
      const by = {}; act.forEach(c => (by[c.group_no] ||= []).push(c));
      const adv = []; let out = 0; const res = store.get(K.res, []);
      for (const g of Object.values(by)){ g.sort((a, b) => votesOf(b) - votesOf(a) || a.id - b.id); const keep = Math.max(g.length - elim, 1);
        g.forEach((c, i) => { res.push({ round: st.current_round, contestant_id: c.id, group_no: c.group_no, place: i + 1, votes: votesOf(c), advanced: i < keep }); });
        g.forEach((c, i) => { if (i < keep) adv.push({ c, rn: i + 1, pot: pots[i] || 1 }); else { c.eliminated_round = st.current_round; out++; } }); }
      store.set(K.res, res);
      const potIds = [...new Set(adv.map(a => a.pot))].sort((a, b) => a - b); let off = 0, groups = 0;
      for (const pt of potIds){ const inPot = adv.filter(a => a.pot === pt).map(a => ({ ...a, r: Math.random() })).sort((a, b) => a.rn - b.rn || a.r - b.r);
        const ng = Math.max(1, Math.ceil(inPot.length / size)); inPot.forEach((a, k) => { a.c.round = st.current_round + 1; a.c.group_no = off + (k % ng) + 1; }); off += ng; groups += ng; }
      store.set(K.c, l); store.set(K.set, { ...st, current_round: st.current_round + 1, group_size: size, eliminate_count: elim, round_ends_at: ends });
      return { round: st.current_round + 1, advanced: adv.length, eliminated: out, groups };
    },
    async missHistory(id){ return store.get(K.res, []).filter(r => r.contestant_id === id).sort((a, b) => a.round - b.round); },
    async missGrant(email, amount){ const w = store.get(K.w, {}), uid = sess().id; w[uid] = (w[uid] || 0) + amount; store.set(K.w, w); return w[uid]; }
  };
}

/* =====================================================================
   BACKEND – SUPABASE
   ===================================================================== */
async function makeSupabaseApi(){
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const redirectTo = location.origin + location.pathname;
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    mode: 'live',
    async getUser(){ const { data } = await sb.auth.getSession(); const u = data.session?.user; return u ? { id:u.id, email:u.email } : null; },
    onAuth(cb){ sb.auth.onAuthStateChange(evt => { if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') setTimeout(cb, 0); }); },
    async signInPassword(email, password){ chk(await sb.auth.signInWithPassword({ email, password })); },
    async signUpPassword(email, password){ const r = chk(await sb.auth.signUp({ email, password, options:{ emailRedirectTo: redirectTo } })); return !r.session; },
    async signInEmail(email){ chk(await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: redirectTo } })); },
    async signInGoogle(){ chk(await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo } })); },
    async signOut(){ await sb.auth.signOut(); location.reload(); },
    async getProfile(uid){ return chk(await sb.from('profiles').select('*').eq('id', uid).maybeSingle()); },
    async saveProfile(uid, p){
      const exists = chk(await sb.from('profiles').select('id').eq('id', uid).maybeSingle());
      if (exists) chk(await sb.from('profiles').update(p).eq('id', uid)); else chk(await sb.from('profiles').insert({ id: uid, ...p }));
    },
    async missSettings(){ return chk(await sb.from('miss_settings').select('*').eq('id', 1).single()); },
    async missSaveSettings(s){ chk(await sb.from('miss_settings').update(s).eq('id', 1)); },
    async missBoard(){ return chk(await sb.from('miss_board').select('*')); },
    async missProfile(id){ return chk(await sb.from('miss_profiles').select('*').eq('id', id).maybeSingle()); },
    async myMissVotes(uid, round){ return chk(await sb.from('miss_votes').select('contestant_id,group_no,votes,paid,created_at').eq('round', round)); },
    async missVote(uid, id, credits){ return chk(await sb.rpc('miss_vote', { p_contestant:id, p_credits:credits || 0 })); },
    async myContestant(uid){ return chk(await sb.from('miss_contestants').select('*').eq('user_id', uid).maybeSingle()); },
    async saveContestant(uid, row){
      const cur = chk(await sb.from('miss_contestants').select('id').eq('user_id', uid).maybeSingle());
      if (cur) chk(await sb.from('miss_contestants').update(row).eq('id', cur.id)); else chk(await sb.from('miss_contestants').insert({ ...row, user_id:uid }));
    },
    async uploadMissPhoto(uid, blob){
      const path = `${uid}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from('miss').upload(path, blob, { contentType:'image/jpeg', upsert:false });
      if (error) throw error; return path;
    },
    async missWallet(){ const r = chk(await sb.from('miss_wallets').select('credits').maybeSingle()); return r ? r.credits : 0; },
    async missPending(){ return chk(await sb.from('miss_contestants').select('*').eq('status', 'pending').order('created_at')); },
    async missSetStatus(id, status){ chk(await sb.from('miss_contestants').update({ status }).eq('id', id)); },
    async signPhotos(paths){ return chk(await sb.storage.from('miss').createSignedUrls(paths, 6 * 3600)); },
    async missSetPhoto(id, path){ const r = chk(await sb.from('miss_contestants').update({ photo_path: path }).eq('id', id).select('id')); if (!r || !r.length) throw new Error('E:ADMIN_ONLY'); },
    async missNewRound(elim, size, pots, ends){ return chk(await sb.rpc('miss_new_round', { p_eliminate:elim, p_group_size:size, p_pots:pots, p_round_ends:ends })); },
    async missGrant(email, amount){ return chk(await sb.rpc('miss_grant_credits', { p_email:email, p_amount:amount })); },
    async missHistory(id){ return chk(await sb.from('miss_round_results').select('round,group_no,place,votes,advanced').eq('contestant_id', id).order('round')); }
  };
}

/* =====================================================================
   STATE
   ===================================================================== */
const state = { user:null, profile:null, miss:null, missPage:1, missView:'all', missFlag:null, asUser: !!store.get('mp_as_user', false) };
let api;
const realAdmin = () => !!state.profile?.is_admin;
const isAdmin = () => realAdmin() && !state.asUser;

async function loadAuth(){
  state.user = await api.getUser();
  state.profile = state.user ? await api.getProfile(state.user.id) : null;
}
async function loadMiss(){
  const [st, board] = await Promise.all([api.missSettings(), api.missBoard()]);
  const mine = state.user ? await Promise.all([api.myMissVotes(state.user.id, st.current_round).catch(() => []), api.missWallet(state.user.id).catch(() => 0), api.myContestant(state.user.id).catch(() => null)]) : [[], 0, null];
  await signPhotos([...board.map(c => c.photo_path), mine[2]?.photo_path]);
  state.miss = { st, board: board.map(c => ({ ...c, id: Number(c.id) })), myVotes: mine[0], credits: mine[1], me: mine[2] };
  const fav = missFavs(); let ch = false;
  for (const v of state.miss.myVotes){ const id = Number(v.contestant_id); if (!fav.includes(id) && !missUnfav().includes(id)){ fav.push(id); ch = true; } }
  if (ch) store.set('mp_fav', fav);
  applyStaticText();
}

/* ---------------- header ---------------- */
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const ICON_G = '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
function renderUser(){
  const dark = document.documentElement.dataset.theme === 'dark';
  const lang = `<select class="langsel" id="langSel" aria-label="${esc(t('language'))}">${LANGS.map(([c, n]) => `<option value="${c}" ${c === LANG ? 'selected' : ''}>${c.toUpperCase()} · ${n}</option>`).join('')}</select>`;
  const theme = `<button class="theme-btn" data-act="theme" title="${esc(dark ? t('theme_light') : t('theme_dark'))}" aria-label="${esc(dark ? t('theme_light') : t('theme_dark'))}">${dark ? ICON_SUN : ICON_MOON}</button>`;
  $('#userArea').innerHTML = lang + theme + (state.user
    ? `${realAdmin() ? `<button class="btn viewtoggle" data-act="asuser">${state.asUser ? t('view_user') : t('view_admin')}</button>` : ''}${isAdmin() ? `<span class="badge">${t('admin')}</span>` : ''}
       <button class="hcred" data-act="credits" title="${esc(t('buy'))}">💎 <span class="hl">${t('credits')}: </span><b>${state.miss?.credits ?? 0}</b></button><button class="btn hbuy" data-act="credits">${t('buy')}</button>
       <button class="btn ghost" data-act="profile">${t('profile')}</button><button class="btn" data-act="logout">${t('logout')}</button>`
    : `<button class="btn primary" data-act="login">${t('login')}</button>`);
  $('#langSel').addEventListener('change', e => { setLang(e.target.value); applyStaticText(); renderUser(); if (state.miss) renderMiss(); });
  $('#notices').innerHTML = api.mode === 'demo' ? `<div class="notice demo">⚠️ <span>${t('demo')}</span></div>` : '';
}

/* =====================================================================
   COMPETITION
   ===================================================================== */
function fmtLeft(ms){ const tm = Math.ceil(ms / 6e4), h = Math.floor(tm / 60), m = tm % 60; return h ? t('dur_h', { h, m }) : t('dur_m', { m }); }
const pad2 = n => String(n).padStart(2, '0');
function fmtHMS(ms){ // live countdown text: "2 d 05:03:09", "7:36:12", "36:12"
  const s = Math.max(0, Math.ceil(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return d ? `${d} d ${pad2(h)}:${pad2(m)}:${pad2(x)}` : h ? `${h}:${pad2(m)}:${pad2(x)}` : `${m}:${pad2(x)}`;
}
const cdSpan = left => `<b class="cdn" data-until="${Date.now() + left}">${fmtHMS(left)}</b>`;
const tCd = (key, left) => esc(t(key, { t: '\u0001' })).replace('\u0001', cdSpan(left));
function clockInner(ms){
  const s = Math.max(0, Math.ceil(ms / 1000)), d = Math.floor(s / 86400), parts = [[Math.floor(s % 86400 / 3600), 'cl_h'], [Math.floor(s % 3600 / 60), 'cl_m'], [s % 60, 'cl_s']];
  if (d) parts.unshift([d, 'cl_d']);
  return parts.map(([v, k]) => `<span><b>${pad2(v)}</b><i>${esc(t(k))}</i></span>`).join('');
}
function fmtDur(ms){ const h = Math.floor(ms / 36e5), d = Math.floor(h / 24); return d >= 1 ? t('dur_d', { d, h: h % 24 }) : fmtLeft(ms); }
function missCooldown(group){
  const m = state.miss, hrs = m.st.vote_hours * 36e5;
  const mine = m.myVotes.filter(v => v.group_no === group && !v.paid).sort((a, b) => a.created_at < b.created_at ? 1 : -1)[0];
  if (!mine) return null;
  const left = Date.parse(mine.created_at) + hrs - Date.now();
  return left > 0 ? { left, contestant: Number(mine.contestant_id) } : null;
}
const missFavs = () => (store.get('mp_fav', []) || []).map(Number);
const missUnfav = () => (store.get('mp_unfav', []) || []).map(Number);
function missToggleFav(id){
  const f = missFavs(), u = missUnfav();
  if (f.includes(id)){ store.set('mp_fav', f.filter(x => x !== id)); store.set('mp_unfav', [...new Set([...u, id])]); return false; }
  store.set('mp_fav', [...f, id]); store.set('mp_unfav', u.filter(x => x !== id)); return true;
}
const missElim = () => { const e = Number(state.miss?.st.eliminate_count); return Number.isFinite(e) ? e : 2; };
const missAdvOf = n => Math.max(1, n - missElim());
const missEnded = () => { const e = Date.parse(state.miss?.st.round_ends_at || ''); return !!e && e <= Date.now(); };
const missUi = k => ((state.miss?.st.ui) || {})[k] !== false;
const missVoteOpen = () => !!state.miss?.st.voting_open && !missEnded();
function missSorted(g){ return state.miss.board.filter(c => c.group_no === g).sort((a, b) => b.votes - a.votes || a.id - b.id); }
function missPos(id){
  const c = state.miss?.board.find(x => x.id === id); if (!c) return null;
  const list = missSorted(c.group_no), rank = list.findIndex(x => x.id === id) + 1, adv = missAdvOf(list.length);
  const need = rank > adv ? list[adv - 1].votes - c.votes + 1 : 0;
  const lead = rank > adv ? 0 : (list[adv] ? c.votes - list[adv].votes : null);
  return { c, rank, size: list.length, adv, advancing: rank <= adv, need, lead };
}
function missEndsLeft(){ const e = Date.parse(state.miss?.st.round_ends_at || ''); return e && e > Date.now() ? e - Date.now() : null; }
function missShareText(id, own){
  const p = missPos(id); if (!p) return '';
  const name = p.c.first_name, r = state.miss.st.current_round, left = missEndsLeft();
  const tt = left ? t('t_left', { d: fmtDur(left), r }) : t('t_running', { r });
  const at = n => T[LANG].place_loc ? t('place_loc', { o: ord(n) }) : place(n); // "na 3. mieste"
  const k = own ? 'so_' : 'share_';
  if (!p.advancing) return t(k + 'out', { name, t: tt, p: at(p.rank), a: place(p.adv) });
  if (p.rank === 1) return t(k + 'lead', { name, t: tt, title: state.miss.st.title });
  return t(k + 'mid', { name, t: tt, p: at(p.rank) });
}
const missUrl = id => `${location.origin}${location.pathname}#c-${id}`;
function missShareBox(id, own){
  const txt = missShareText(id, own), url = missUrl(id), full = `${txt}\n${url}`, e = encodeURIComponent, o = own ? '1' : '';
  const mob = /Android|iPhone|iPad/i.test(navigator.userAgent);
  return `<div class="box" style="margin-top:12px"><b>${own ? t('sh_me_t') : t('share_help')}</b>
    ${own ? `<p class="small" style="margin:4px 0 0">${esc(t('sh_me_s'))}</p>` : ''}
    <div class="mshare-txt" data-mcopy="${id}" data-own="${o}" role="button" tabindex="0" title="${esc(t('copy_tap'))}">${esc(txt)}<span class="mshare-hint">📋 ${esc(t('copy_tap'))}</span></div>
    <div class="mshare">
      ${navigator.share ? `<button class="btn primary" data-mshare="${id}" data-own="${o}">${t('share_btn')}</button>` : ''}
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${e(full)}">WhatsApp</a>
      ${mob ? `<a class="btn" href="fb-messenger://share/?link=${e(url)}">Messenger</a>` : ''}
      <a class="btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${e(url)}">Facebook</a>
      <a class="btn" target="_blank" rel="noopener" href="https://t.me/share/url?url=${e(url)}&text=${e(txt)}">Telegram</a>
      <a class="btn" target="_blank" rel="noopener" href="https://line.me/R/share?text=${e(full)}">LINE</a>
      <a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/tweet?text=${e(txt)}&url=${e(url)}">X</a>
      <button class="btn" data-mcopy="${id}" data-own="${o}">${t('copy_text')}</button></div>
    <p class="small" style="margin:6px 0 0">${t('ig_hint')}</p></div>`;
}
function missPosLine(p){
  if (!p) return '';
  if (p.advancing) return `<b style="color:var(--up)">${esc(t('pos_adv', { p: place(p.rank) }))}</b>${p.lead != null ? ` <span class="small">· ${esc(t('pos_lead', { v: votesTxt(p.lead) }))}</span>` : ''}`;
  return `<b style="color:var(--down)">${esc(t('pos_out', { p: place(p.rank) }))}</b> <span class="small">· ${esc(t('pos_need', { p: place(p.adv), v: votesTxt(p.need) }))}</span>`;
}
function missMeBox(){
  const m = state.miss; if (!m.me || m.me.status !== 'approved') return '';
  const p = missPos(Number(m.me.id)); if (!p) return '';
  return `<section class="mgroup"><div class="mgroup-h"><b>${esc(t('my_pos', { g: p.c.group_no }))}</b><span>${missPosLine(p)}</span></div>${missShareBox(p.c.id, true)}</section>`;
}
function missFlagBar(){
  const m = state.miss, cnt = {};
  for (const c of m.board) cnt[c.country] = (cnt[c.country] || 0) + 1;
  const list = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  if (list.length < 2) return { chips: '', note: '' };
  const f = state.missFlag; let note = '';
  if (f){ const mine = m.board.filter(c => c.country === f), adv = mine.filter(c => missPos(c.id).advancing).length;
    note = `<p class="small" style="margin:2px 0 8px">${t('flag_note', { f: flagOf(f), c: esc(countryName(f)), n: mine.length, a: adv })}${mine.length - adv ? t('flag_need', { n: mine.length - adv }) : ''}.</p>`; }
  return { chips: `<span class="mflags" title="${esc(t('flag_bar'))}">${list.map(([k, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-mflag="${esc(k)}" title="${esc(countryName(k))}">${flagOf(k)} ${n}</button>`).join('')}</span>`, note };
}
function voteBtnLabel(w, mine){ return mine ? t('your_vote') : w ? fmtLeft(w.left) : missEnded() ? t('round_ended') : t('vote'); }
function missFavView(){
  const list = missFavs().map(id => missPos(id)).filter(Boolean).sort((a, b) => (a.advancing - b.advancing) || (b.need - a.need));
  if (!list.length) return `<div class="list"><div class="empty">${t('fav_empty')}</div></div>`;
  const cd = g => state.user ? missCooldown(g) : null;
  return `<div class="mfavs">${list.map(p => { const c = p.c, ph = missPhotoOf(c), w = cd(c.group_no);
    return `<div class="mfav">
      <div class="mfav-top"><button class="mphoto" data-mopen="${c.id}">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : `<span>${esc(c.first_name[0] || '?')}</span>`}</button>
        <div class="mfav-info"><b>${esc(c.first_name)}</b> ${flagOf(c.country)} <span class="small">· ${votesTxt(c.votes)}</span><div class="mfav-st">${missPosLine(p)}</div></div></div>
      ${missMiniTable(c, true)}
      <div class="mfav-act"><button class="btn primary" data-mvote="${c.id}" ${w || !missVoteOpen() ? 'disabled' : ''}>${w ? tCd('next_vote_short', w.left) : missEnded() ? t('round_ended') : t('vote')}</button>
        ${credBtn(c.id, !!w)}<button class="btn" data-mopen="${c.id}">${t('share')}</button></div></div>`; }).join('')}</div>
    <p class="small" style="margin:8px 0 0">${t('fav_note')}</p>`;
}
function missCountTxt(){ const left = missEndsLeft(); return left ? fmtHMS(left) : missEnded() ? t('round_ended') : ''; }
let missWasEnded = null;
setInterval(() => { // every second: round clock, "next vote in" timers; re-render when a timer runs out
  if (!state.miss) return;
  const now = Date.now(), left = missEndsLeft(); let stale = false;
  document.querySelectorAll('[data-until]').forEach(el => { const l = +el.dataset.until - now; if (l <= 0) stale = true; else el.textContent = fmtHMS(l); });
  document.querySelectorAll('[data-mclock]').forEach(el => { if (left) el.innerHTML = clockInner(left); });
  document.querySelectorAll('[data-mcount]').forEach(el => { el.textContent = missCountTxt(); });
  const hc = document.querySelector('.mhead-c'); if (hc && left) hc.classList.toggle('urgent', left < 864e5);
  const ended = missEnded(); if (missWasEnded === false && ended) stale = true; missWasEnded = ended;
  if (stale && $('#modal').hidden && !document.querySelector('.cropov')) renderMiss();
}, 1000);
function missMiniTable(c, noHead){
  const list = missSorted(c.group_no), adv = missAdvOf(list.length);
  return `<div class="mmini">${noHead ? '' : `<div class="mmini-h">${esc(t('group_n', { n: c.group_no }))}</div>`}${list.map((x, i) => `${i === adv ? `<div class="mmini-cut">${t('out_zone')}</div>` : ''}<button class="mmini-r ${x.id === c.id ? 'me' : ''}" data-mopen="${x.id}"><span class="mmini-n ${i < adv ? 'adv' : ''}">${i + 1}.</span><span class="mmini-name">${esc(x.first_name)} ${flagOf(x.country)}</span><b>${x.votes}</b></button>`).join('')}</div>`;
}
function missStatsView(){
  const b = state.miss.board; if (!b.length) return `<div class="list"><div class="empty">${t('no_contestants')}</div></div>`;
  const by = {}, ages = { '18–20':0, '21–24':0, '25–29':0, '30–34':0, '35+':0 };
  for (const c of b){
    const o = by[c.country] ||= { n:0, adv:0, lead:0 }, p = missPos(c.id);
    o.n++; if (p.advancing) o.adv++; if (p.rank === 1) o.lead++;
    const a = c.age; ages[a <= 20 ? '18–20' : a <= 24 ? '21–24' : a <= 29 ? '25–29' : a <= 34 ? '30–34' : '35+']++;
  }
  const rows = Object.entries(by).sort((x, y) => y[1].n - x[1].n), maxN = Math.max(...rows.map(r => r[1].n)), maxA = Math.max(...Object.values(ages), 1);
  const groups = new Set(b.map(c => c.group_no)).size, avgAge = Math.round(b.reduce((s, c) => s + c.age, 0) / b.length);
  const advTotal = b.filter(c => missPos(c.id).advancing).length;
  const race = [...rows].sort((x, y) => y[1].adv - x[1].adv || y[1].lead - x[1].lead), left = missEndsLeft();
  return `<div class="mst-grid">
      <div class="mst-tile"><span class="small">${t('st_contestants')}</span><b>${b.length}</b></div>
      <div class="mst-tile"><span class="small">${t('st_countries')}</span><b>${rows.length}</b></div>
      <div class="mst-tile"><span class="small">${t('st_groups')}</span><b>${groups}</b></div>
      <div class="mst-tile"><span class="small">${t('st_avg_age')}</span><b>${esc(t('years_short', { n: avgAge }))}</b></div>
      <div class="mst-tile"><span class="small">${t('st_adv')}</span><b>${advTotal}</b></div>
      ${left ? `<div class="mst-tile"><span class="small">${t('st_left')}</span><b data-mcount>${fmtHMS(left)}</b></div>` : ''}</div>
    <section class="mgroup"><div class="mgroup-h"><b>${t('race_title')}</b></div>
      ${race.map(([k, o], i) => `<div class="mst-row"><span>${i + 1}. ${flagOf(k)} ${esc(countryName(k))}</span><div class="mst-bar"><i style="width:${Math.round(100 * o.adv / Math.max(1, race[0][1].adv))}%"></i></div><span style="white-space:nowrap">${t('race_row', { n: o.adv })}${o.lead ? ` · ${o.lead}×👑` : ''}</span></div>`).join('')}
      <p class="small" style="margin:6px 0 0">${t('race_hint')}</p></section>
    <section class="mgroup"><div class="mgroup-h"><b>${t('by_country')}</b><span class="small">${t('pct_adv')}</span></div>
      ${rows.map(([k, o]) => `<div class="mst-row"><span>${flagOf(k)} ${esc(countryName(k))}</span><div class="mst-bar"><i style="width:${Math.round(100 * o.n / maxN)}%"></i></div><span style="white-space:nowrap">${t('pct_row', { n: o.n, p: Math.round(100 * o.adv / o.n) })}</span></div>`).join('')}</section>
    <section class="mgroup"><div class="mgroup-h"><b>${t('by_age')}</b></div>
      ${Object.entries(ages).filter(([, n]) => n).map(([k, n]) => `<div class="mst-row"><span>${esc(t('age_bucket', { k }))}</span><div class="mst-bar"><i style="width:${Math.round(100 * n / maxA)}%"></i></div><span><b>${n}</b> (${Math.round(100 * n / b.length)} %)</span></div>`).join('')}</section>`;
}
const missLayout = () => store.get('mp_layout', 'photo') === 'list' ? 'list' : 'photo';
function renderMiss(){
  renderUser(); // header shows the credit balance
  const m = state.miss, st = m.st, el = $('#app');
  const groups = [...new Set(m.board.map(c => c.group_no))].sort((a, b) => a - b);
  const pages = Math.max(1, Math.ceil(groups.length / PER_PAGE));
  state.missPage = Math.min(Math.max(1, state.missPage || 1), pages);
  const shown = groups.slice((state.missPage - 1) * PER_PAGE, state.missPage * PER_PAGE);
  const regOpen = Date.now() < Date.parse(st.registration_until);
  const isWoman = state.profile?.gender === 'female', view = state.missView || 'all';
  let cta = '';
  if (m.me) cta = `<button class="btn primary" data-act="signup">${t('my_entry')}</button> <span class="pill">${t('st_' + m.me.status)}</span>`;
  else if (regOpen && (!state.user || !state.profile || isWoman)) cta = `<button class="btn primary" data-act="signup">${t('join')}</button>`;
  else if (regOpen) cta = `<span class="small">${t('women_only')}</span>`;
  const pager = pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) => `<button class="chip ${state.missPage === i + 1 ? 'on' : ''}" data-mpage="${i + 1}">${i + 1}</button>`).join('')}</div>` : '';
  const fb = view === 'all' ? missFlagBar() : { chips: '', note: '' };
  el.innerHTML = `
    <section class="mhead">
      <div class="mhead-t"><h1>👑 ${esc(st.title)}</h1>
        <span class="mhead-meta">${esc(t('round_n', { n: st.current_round }))} · ${esc(t('contestants_n', { n: m.board.length }))} · ${esc(t('groups_n', { n: groups.length }))} · ${esc(t('vote_every', { h: st.vote_hours }))} · <button class="mlink" data-act="rules">${t('rules')}</button>${st.voting_open ? '' : ` · <b>${t('voting_paused')}</b>`}</span>
        <p class="mtag">${t('tagline')}</p></div>
      <div class="mhead-a">${cta}${realAdmin() ? `<button class="btn ${photosHidden() ? 'primary' : ''}" data-act="togglephotos" title="${esc(t('ph_admin_hint'))}">${photosHidden() ? '👁 ' + t('ph_show') : '🙈 ' + t('ph_hide')}</button>` : ''}</div>
      ${st.round_ends_at ? `<div class="mhead-c ${missEnded() ? 'over' : (missEndsLeft() < 864e5 ? 'urgent' : '')}">${missEnded() ? `⏳ ${esc(t('round_over', { n: st.current_round }))}` : `<span class="mhead-l">⏳ ${t('ends_in')}</span><div class="mclk" data-mclock>${clockInner(missEndsLeft())}</div>`}</div>` : ''}
    </section>
    ${realAdmin() && photosHidden() ? `<div class="notice demo">🙈 ${t('ph_hidden_note')}</div>` : ''}
    ${isAdmin() ? '<div id="missAdmin"></div>' : ''}
    ${missMeBox()}
    <div class="mtabs">${[['all', `<span class="lg">${t('tab_all')}</span><span class="sm">${t('tab_all_short')}</span>`], ['fav', `⭐ <span class="lg">${t('tab_fav')} </span>(${missFavs().filter(id => m.board.some(c => c.id === id)).length})`], ['stats', `📊<span class="lg"> ${t('tab_stats')}</span>`]].map(([k, l]) => `<button class="chip ${view === k ? 'on' : ''}" data-mview="${k}">${l}</button>`).join('')}
      ${fb.chips}
      ${view === 'all' ? `<span class="mlay"><button class="chip ${missLayout() === 'photo' ? 'on' : ''}" data-mlayout="photo" title="${esc(t('lay_photo'))}">▦</button><button class="chip ${missLayout() === 'list' ? 'on' : ''}" data-mlayout="list" title="${esc(t('lay_list'))}">☰</button></span>` : ''}</div>
    ${fb.note}
    ${view === 'fav' ? missFavView() : view === 'stats' ? missStatsView() : `${pager}
    ${shown.length ? (missLayout() === 'list' ? `<div class="mfavs">${shown.map(g => missGroupCompact(g)).join('')}</div>` : shown.map(g => missGroup(g)).join('')) : `<div class="list"><div class="empty">${t('no_approved')}</div></div>`}
    ${pager}`}`;
  if (isAdmin()) renderMissAdmin();
  if (isAdmin() && missEnded() && state.missNrShown !== st.current_round && $('#modal').hidden){ state.missNrShown = st.current_round; openMissNewRound(); }
}
function advLabel(adv){ return adv === 1 ? t('adv_one') : t('adv_range', { n: adv }); }
function missGroupCompact(g){
  const list = missSorted(g), adv = missAdvOf(list.length), fav = missFavs(), f = state.missFlag;
  const cd = state.user ? missCooldown(g) : null, open = missVoteOpen();
  return `<div class="mfav mgc"><div class="mgc-h"><b>${esc(t('group_n', { n: g }))}</b><span class="small">${cd ? `<span class="mcd">⏱ ${tCd('next_vote_short', cd.left)}</span>` : missEnded() ? t('round_ended') : esc(advLabel(adv))}</span></div>
    ${list.map((c, i) => { const r = i + 1, mine = cd && cd.contestant === c.id;
      return `${i === adv ? `<div class="mmini-cut">${t('out_zone')}</div>` : ''}<div class="mgc-r ${f ? (c.country === f ? 'hl' : 'dim') : ''} ${fav.includes(c.id) ? 'fav' : ''}">
        <span class="mmini-n ${r <= adv ? 'adv' : ''}">${r === 1 && c.votes > 0 ? '👑' : r + '.'}</span>
        <button class="mflagbtn mgc-f" data-mflag="${esc(c.country)}" title="${esc(countryName(c.country))}">${flagOf(c.country)}</button>
        <button class="mgc-name" data-mopen="${c.id}">${esc(c.first_name)}${fav.includes(c.id) ? ' <span class="mgc-star">★</span>' : ''}</button>
        <span class="mgc-v"><b>${c.votes}</b>${r > adv && missUi('need') ? `<i class="mneed">−${list[adv - 1].votes - c.votes + 1}</i>` : ''}</span>
        <button class="btn ${mine ? '' : 'primary'} mgc-b" data-mvote="${c.id}" ${cd || !open ? 'disabled' : ''}>${mine ? '✓' : t('vote')}</button>${credBtn(c.id, !!cd)}</div>`; }).join('')}</div>`;
}
function missGroup(g){
  const list = missSorted(g), adv = missAdvOf(list.length), fav = missFavs(), f = state.missFlag;
  const cd = state.user ? missCooldown(g) : null;
  return `<section class="mgroup"><div class="mgroup-h"><b>${esc(t('group_n', { n: g }))}</b>${cd ? `<span class="mcd">⏱ ${tCd('next_vote_in', cd.left)}</span>` : `<span class="small">${esc(advLabel(adv))}</span>`}</div>
    <div class="mrow">${list.map((c, i) => {
      const ph = missPhotoOf(c), mineHere = cd && cd.contestant === c.id, r = i + 1, isFav = fav.includes(c.id);
      return `<div class="mcard ${f ? (c.country === f ? 'hl' : 'dim') : ''} ${r === adv + 1 ? 'cutl' : ''} ${r > adv ? 'outz' : ''}" data-cut="${esc(t('out_zone'))}">
        <div style="position:relative"><button class="mphoto" data-mopen="${c.id}" aria-label="${esc(t('profile_of', { name: c.first_name }))}">${ph ? `<img src="${esc(ph)}" alt="${esc(c.first_name)}" loading="lazy">` : `<span>${esc(c.first_name[0] || '?')}</span>`}<i class="mrank ${r <= adv ? 'adv' : ''}" title="${esc(r <= adv ? t('rank_adv') : t('rank_out'))}">${r === 1 && c.votes > 0 ? '👑 ' : ''}${r}.</i></button>
        ${missUi('star') ? `<button class="mstar ${isFav ? 'on' : ''}" data-mfav="${c.id}" aria-label="${esc(isFav ? t('fav_remove') : t('fav_add'))}">${isFav ? '★' : '☆'}</button>` : ''}
        ${c.instagram && missUi('instagram') ? `<a class="mig ${missUi('star') ? '' : 'nostar'}" href="${esc(normLink('instagram', c.instagram))}" target="_blank" rel="nofollow noopener ugc" aria-label="Instagram ${esc(c.first_name)}">Instagram</a>` : ''}
        <button class="mflagbig" data-mflag="${esc(c.country)}" title="${esc(t('flag_title', { c: countryName(c.country) }))}">${flagOf(c.country)}</button>
        ${r > adv && missUi('need') ? `<i class="mneedpill" title="${esc(t('short_title', { a: adv }))}">${esc(t('short_n', { n: list[adv - 1].votes - c.votes + 1 }))}</i>` : ''}</div>
        <div class="mline"><span class="mnm">${esc(c.first_name)}<small>${c.age}</small></span>${isAdmin() ? `<label class="madph" title="${esc(t('ad_photo'))}" aria-label="${esc(t('ad_photo'))}: ${esc(c.first_name)}">📷<input type="file" accept="image/*" data-adph="${c.id}" hidden></label>` : ''}<span class="mvotes"><b>${c.votes}</b></span></div>
        <div class="mvrow"><button class="btn ${mineHere ? '' : 'primary'} mvote" data-mvote="${c.id}" ${cd || !missVoteOpen() ? 'disabled' : ''}>${mineHere ? t('your_vote') : missEnded() ? t('round_ended') : t('vote')}</button>${credBtn(c.id, !!cd)}</div>
      </div>`; }).join('')}</div></section>`;
}
const CREDIT_STEPS = [10, 50, 100, 200, 500, 1000];
function creditTiles(id){
  const have = state.miss?.credits ?? 0, open = missVoteOpen();
  return `<div class="mcgrid">${CREDIT_STEPS.map(n => `<button class="btn mcbtn ${state.user && n > have ? 'short' : ''}" data-mvotecred="${id}" data-n="${n}" ${open ? '' : 'disabled'}>+${n}</button>`).join('')}</div>
    <p class="small" style="margin:6px 0 0">${t('credit_eq')} ${state.user ? esc(t('you_have', { n: creditsTxt(have) })) : ''} <button class="linkbtn" data-act="credits">${esc(t('cr_buy'))}</button></p>`;
}
const credBtn = (id, hot) => `<button class="btn mcredb ${hot ? 'hot' : ''}" data-mcredopen="${id}" ${missVoteOpen() ? '' : 'disabled'} title="${esc(t('vote_credits'))}" aria-label="${esc(t('vote_credits'))}">💎</button>`;
function openMissCreditVote(id){ // quick credit-vote popup from the board
  if (!state.user) return openLogin();
  const c = state.miss?.board.find(x => x.id === id); if (!c) return;
  const pos = missPos(id);
  openModal(`<h2>💎 ${esc(t('support', { name: c.first_name }))}</h2>
    <p class="sub">${flagOf(c.country)} ${esc(t('group_n', { n: c.group_no }))} · ${votesTxt(c.votes)}${pos ? ' · ' + missPosLine(pos) : ''}</p>
    <p class="small" style="margin:0 0 6px">${esc(t('cr_pick'))}</p>
    ${creditTiles(id)}`);
}
async function onMissVote(id, credits){
  if (!state.user) return openLogin();
  if (!state.profile) return openProfile();
  try {
    await api.missVote(state.user.id, id, credits || 0);
    if (!missFavs().includes(id)) store.set('mp_fav', [...missFavs(), id]);
    toast(credits ? t('votes_added', { n: credits }) : t('voted'));
    await loadMiss(); renderMiss();
    return true;
  } catch(err){ toast(errMsg(err), true); return false; }
}
async function openMissProfile(id){
  openModal(`<div class="empty">${t('loading')}</div>`);
  let c, hist = [];
  try { [c, hist] = await Promise.all([api.missProfile(id), api.missHistory(id).catch(() => [])]); } catch(err){ openModal(`<p>${esc(errMsg(err))}</p>`); return; }
  if (c) await signPhotos([c.photo_path]);
  if (!c){ openModal(`<h2>${t('nf_title')}</h2><p class="sub">${t('nf_text')}</p>`); return; }
  const ph = missPhotoOf(c), links = c.links || {};
  const inRound = !c.eliminated_round && c.round === state.miss?.st.current_round && c.status === 'approved';
  const row = (l, v) => v ? `<div class="mrowi"><span>${l}</span><b>${esc(v)}</b></div>` : '';
  const sub = `${flagOf(c.country)} ${esc(countryName(c.country))} · ${esc(t('age_y', { n: c.age }))}${c.city ? ' · ' + esc(c.city) : ''}`;
  const pos = missPos(c.id), boardC = state.miss?.board.find(x => x.id === c.id);
  openModal(`<div class="mprof">
    <div class="mprof-side"><div class="mprof-mhead"><h2>${esc(c.first_name)}</h2><p class="sub" style="margin:0">${sub}</p></div><div class="mprof-photo">${ph ? `<img src="${esc(ph)}" alt="${esc(c.first_name)}">` : `<span>${esc(c.first_name[0] || '?')}</span>`}</div>
      ${isAdmin() ? `<label class="btn" style="display:block;text-align:center;margin:8px 0;cursor:pointer">📷 ${esc(t('ad_photo'))}<input type="file" id="adPhoto" accept="image/*" hidden></label>` : ''}
      ${hist.length ? `<div class="mhist">${hist.map(h => `<div class="mhist-r"><span>${esc(t('hist_round', { r: h.round }))}</span><span>${esc(place(h.place))}</span><span>${votesTxt(h.votes)}</span><b class="${h.advanced ? 'up' : 'down'}">${h.advanced ? t('hist_adv') : t('hist_out')}</b></div>`).join('')}</div>` : ''}
      ${inRound ? `<div class="mstat">${esc(t('in_round', { v: votesTxt(c.votes), r: c.round, g: c.group_no }))}${pos ? '<br>' + missPosLine(pos) : ''}${state.miss?.st.round_ends_at ? `<br><span class="small">⏳ ${missEnded() ? t('round_ended') : `${t('ends_in')} <b data-mcount>${missCountTxt()}</b>`}</span>` : ''}</div>${boardC ? missMiniTable(boardC) : ''}` : c.eliminated_round ? `<div class="mstat">${esc(t('left_in', { r: c.eliminated_round }))}</div>` : ''}</div>
    <div class="mprof-body"><h2>${esc(c.first_name)}</h2>
      <p class="sub">${sub}</p>
      ${row(t('fav_food'), c.favorite_food)}${row(t('fav_city'), c.favorite_city)}${row(t('free_time'), c.hobbies)}
      ${c.about ? `<p style="white-space:pre-line;margin:10px 0">${esc(c.about)}</p>` : ''}
      <div class="mlinks">${LINK_DEFS.filter(([k]) => links[k]).map(([k, l]) => `<a class="chip" href="${esc(normLink(k, links[k]))}" target="_blank" rel="nofollow noopener ugc">${l}</a>`).join('')}</div>
      ${inRound ? `<div class="box" style="margin-top:14px"><b>${esc(t('support', { name: c.first_name }))}</b>
        <button class="btn primary mvbig" data-mvote="${c.id}" data-close-after="1" ${missVoteOpen() ? '' : 'disabled'}>${missEnded() ? t('round_ended') : t('vote')}</button>
        <p class="small" style="margin:10px 0 6px">${esc(t('cr_or'))}</p>
        ${creditTiles(c.id)}</div>${pos ? missShareBox(c.id, state.miss?.me && Number(state.miss.me.id) === c.id) : ''}` : ''}
      <p class="small" style="margin-top:10px">${t('profile_link')} <a href="#c-${c.id}">${esc(missUrl(c.id))}</a></p>
    </div></div>`, true);
  $('#adPhoto')?.addEventListener('change', async e => { if (await adminSetPhoto(c.id, e.target.files[0])) openMissProfile(c.id); });
}
async function adminSetPhoto(id, f){
  if (!f || !isAdmin()) return false;
  try {
    const blob = await cropImage(f);
    if (!blob) return false;
    toast(t('loading'));
    const path = await api.uploadMissPhoto('admin', blob);
    await api.missSetPhoto(id, path);
    toast(t('ad_photo_ok'));
    await loadMiss(); renderMiss();
    return true;
  } catch(err){ toast(errMsg(err) || t('photo_fail'), true); return false; }
}
document.addEventListener('change', e => { const el = e.target.closest && e.target.closest('[data-adph]'); if (el){ const f = el.files[0]; el.value = ''; adminSetPhoto(Number(el.dataset.adph), f); } });
function openMissCredits(){
  openModal(`<h2>${t('cr_title')}</h2><p class="sub">${t('cr_text')}</p>
    <div class="box"><b>${t('cr_soon')}</b><p class="small" style="margin:6px 0 0">${esc(t('cr_soon_text', { n: creditsTxt(state.miss?.credits ?? 0) }))}</p></div>`);
}
/* "Enter the competition" is a 3-step flow: account → short profile → entry form */
const joinIntent = { get: () => { try { return sessionStorage.getItem('mp_join') === '1'; } catch { return false; } },
  set: v => { try { v ? sessionStorage.setItem('mp_join', '1') : sessionStorage.removeItem('mp_join'); } catch {} } };
function continueJoin(){ // after sign-in / profile: carry on where the contestant left off
  if (!joinIntent.get() || !state.user) return false;
  if (!state.profile){ openProfile(); return true; }
  joinIntent.set(false);
  if (state.profile.gender !== 'female'){ toast(t('women_only'), true); return true; }
  openMissSignup(true); return true;
}
async function openMissSignup(viaJoin){
  if (!state.user){ joinIntent.set(true); return openLogin('up'); }
  if (!state.profile){ joinIntent.set(true); return openProfile(); }
  joinIntent.set(false);
  const me = state.miss.me || {}, L = me.links || {};
  const maxBirth = new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10);
  openModal(`<h2>${me.id ? t('su_edit') : viaJoin ? t('jn_t3') : t('su_new')}</h2>
    <p class="sub">${t('su_sub')}</p>
    <form id="missForm">
      <div class="mform-top"><label class="mphoto mup" id="mupLbl">${me.photo_path ? `<img src="${esc(missPhoto(me.photo_path))}" alt="">` : `<span>${t('add_photo')}</span>`}<input type="file" id="mfile" accept="image/*" hidden></label>
        <div style="flex:1">
          <div class="field"><label class="l" for="mfn">${t('first_name')}</label><input type="text" id="mfn" required minlength="2" maxlength="40" value="${esc(me.first_name || '')}"></div>
          <div class="row2"><div class="field"><label class="l" for="mco">${t('country')}</label><select id="mco">${countryList().map(([c, n]) => `<option value="${c}" ${(me.country || state.profile?.country || 'TH') === c ? 'selected' : ''}>${flagOf(c)} ${esc(n)}</option>`).join('')}</select></div>
          <div class="field"><label class="l" for="mbd">${t('birth_date')}</label><input type="date" id="mbd" required max="${maxBirth}" value="${esc(me.birth_date || '')}" ${me.id ? 'disabled' : ''}></div></div>
        </div></div>
      <div class="row2"><div class="field"><label class="l" for="mci">${t('city')}</label><input type="text" id="mci" maxlength="80" value="${esc(me.city || '')}"></div>
        <div class="field"><label class="l" for="mff">${t('fav_food')}</label><input type="text" id="mff" maxlength="120" value="${esc(me.favorite_food || '')}"></div>
        <div class="field"><label class="l" for="mfc">${t('fav_city')}</label><input type="text" id="mfc" maxlength="120" value="${esc(me.favorite_city || '')}"></div>
        <div class="field"><label class="l" for="mho">${t('free_time')}</label><input type="text" id="mho" maxlength="300" value="${esc(me.hobbies || '')}"></div></div>
      <div class="field"><label class="l" for="mab">${t('about')}</label><textarea id="mab" maxlength="1000">${esc(me.about || '')}</textarea></div>
      <div class="field"><label class="l">${t('my_links')} <span class="small">${t('links_hint')}</span></label>
        <div class="row2">${LINK_DEFS.map(([k, l]) => `<input type="text" id="ml_${k}" maxlength="200" placeholder="${l}" value="${esc(L[k] || '')}">`).join('')}</div></div>
      ${me.id ? '' : `<label class="check field"><input type="checkbox" id="mok" required> ${t('consent')}</label>`}
      <div class="err" id="mErr"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" id="msave">${me.id ? t('save_changes') : t('submit_entry')}</button></div>
    </form>`, true);
  let photoBlob = null;
  $('#mfile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const b = await cropImage(f); e.target.value = ''; if (!b) return; photoBlob = b; $('#mupLbl').querySelector('img, span').outerHTML = `<img src="${URL.createObjectURL(photoBlob)}" alt="">`; }
    catch { $('#mErr').textContent = t('photo_fail'); }
  });
  $('#missForm').addEventListener('submit', async e => {
    e.preventDefault(); const btn = $('#msave'); btn.disabled = true; $('#mErr').textContent = '';
    try {
      if (!photoBlob && !me.photo_path) throw new Error(t('need_photo'));
      const links = {}; LINK_DEFS.forEach(([k]) => { const v = normLink(k, $('#ml_' + k).value); if (v) links[k] = v; });
      const row = { first_name: $('#mfn').value.trim(), country: $('#mco').value, city: $('#mci').value.trim() || null, favorite_food: $('#mff').value.trim() || null,
        favorite_city: $('#mfc').value.trim() || null, hobbies: $('#mho').value.trim() || null, about: $('#mab').value.trim() || null, links };
      if (!me.id) row.birth_date = $('#mbd').value;
      if (photoBlob) row.photo_path = await api.uploadMissPhoto(state.user.id, photoBlob);
      await api.saveContestant(state.user.id, row);
      toast(me.id ? t('saved') : t('submitted'));
      closeModal(); await loadMiss(); renderMiss();
    } catch(err){ $('#mErr').textContent = errMsg(err); btn.disabled = false; }
  });
}
/* photo cropper: drag to move, wheel / pinch / slider to zoom; returns a 3:4 JPEG blob or null */
function cropImage(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('img'));
    img.onload = () => {
      const ov = document.createElement('div');
      ov.className = 'cropov';
      ov.innerHTML = `<div class="cropdlg" role="dialog" aria-modal="true" aria-label="${esc(t('crop_title'))}"><h2>${esc(t('crop_title'))}</h2><p class="sub">${esc(t('crop_hint'))}</p>
        <div class="cropbox"><img alt="" draggable="false"></div>
        <label class="cropzoom"><span>−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="${esc(t('crop_zoom'))}"><span>+</span></label>
        <div class="actions"><button type="button" class="btn ghost" data-c="0">${esc(t('cancel'))}</button><button type="button" class="btn primary" data-c="1">${esc(t('crop_save'))}</button></div></div>`;
      document.body.appendChild(ov);
      const box = ov.querySelector('.cropbox'), im = box.querySelector('img'), zr = ov.querySelector('input[type=range]');
      im.src = img.src;
      let z = 1, x = 0, y = 0;
      const W = () => box.clientWidth, H = () => box.clientHeight;
      const base = () => Math.max(W() / img.naturalWidth, H() / img.naturalHeight);
      const clamp = () => { const s = base() * z, mx = Math.max(0, (img.naturalWidth * s - W()) / 2), my = Math.max(0, (img.naturalHeight * s - H()) / 2);
        x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y)); };
      const draw = () => { clamp(); const s = base() * z;
        im.style.width = img.naturalWidth * s + 'px'; im.style.height = img.naturalHeight * s + 'px';
        im.style.transform = `translate(${x - img.naturalWidth * s / 2}px, ${y - img.naturalHeight * s / 2}px)`; zr.value = z; };
      const zoomTo = nz => { nz = Math.min(4, Math.max(1, nz)); x *= nz / z; y *= nz / z; z = nz; draw(); };
      z = Math.min(4, Math.max(1, 1.2 * H() / (img.naturalHeight * base()))); // leave room to move up/down
      draw(); requestAnimationFrame(draw);
      const pts = new Map(); let pinch = 0;
      box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
      box.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 1){ x += e.clientX - prev[0]; y += e.clientY - prev[1]; draw(); }
        else { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomTo(z * d / pinch); pinch = d; }
      });
      const up = e => { pts.delete(e.pointerId); pinch = 0; };
      box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
      box.addEventListener('wheel', e => { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
      zr.addEventListener('input', () => zoomTo(+zr.value));
      const done = v => { ov.remove(); document.removeEventListener('keydown', key, true); URL.revokeObjectURL(img.src); resolve(v); };
      const key = e => { if (e.key === 'Escape'){ e.stopPropagation(); done(null); } };
      document.addEventListener('keydown', key, true);
      ov.addEventListener('click', e => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === '0') return done(null);
        const s = base() * z, OW = 900, OH = 1200, cv = document.createElement('canvas');
        cv.width = OW; cv.height = OH;
        const left = W() / 2 + x - img.naturalWidth * s / 2, top = H() / 2 + y - img.naturalHeight * s / 2;
        const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OW, OH);
        ctx.drawImage(img, -left / s, -top / s, W() / s, H() / s, 0, 0, OW, OH);
        cv.toBlob(bl => { ov.remove(); document.removeEventListener('keydown', key, true); URL.revokeObjectURL(img.src); bl ? resolve(bl) : reject(new Error('blob')); }, 'image/jpeg', 0.86);
      });
    };
    img.src = URL.createObjectURL(file);
  });
}
function resizeImage(file, max){
  return new Promise((res, rej) => {
    const img = new Image(); img.onerror = rej;
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.85); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(file);
  });
}
const toLocalInput = iso => new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
async function renderMissAdmin(){
  const el = $('#missAdmin'); if (!el) return;
  const st = state.miss.st; let pend = [];
  try { pend = await api.missPending(); await signPhotos(pend.map(c => c.photo_path)); } catch {}
  el.innerHTML = `<div class="panel"><h3>${esc(t('ad_title', { t: st.title }))}</h3>
    <h4 class="sec" style="margin-top:12px">${esc(t('ad_pending', { n: pend.length }))}</h4>
    ${pend.length ? `<div class="mpend">${pend.map(c => `<div class="mpc"><button class="mphoto sm" data-mopen="${c.id}">${c.photo_path ? `<img src="${esc(missPhoto(c.photo_path))}" alt="">` : `<span>${esc(c.first_name[0])}</span>`}</button>
      <div><b>${esc(c.first_name)}</b> ${flagOf(c.country)} · ${esc(t('born', { d: c.birth_date }))}<br><span class="small">${esc(c.about || '').slice(0, 80)}</span>
      <div class="actions" style="justify-content:flex-start;margin-top:6px"><button class="btn primary" data-mst="approved" data-id="${c.id}">${t('approve')}</button><button class="btn danger" data-mst="rejected" data-id="${c.id}">${t('reject')}</button></div></div></div>`).join('')}</div>` : `<p class="small">${t('no_pending')}</p>`}
    <form id="missSet" class="row2" style="margin-top:14px">
      <div class="field"><label class="l">${t('ad_name')}</label><input type="text" id="mst_t" value="${esc(st.title)}"></div>
      <div class="field"><label class="l">${t('ad_reg_end')}</label><input type="datetime-local" id="mst_r" value="${toLocalInput(st.registration_until)}"></div>
      <div class="field"><label class="l">${t('ad_round_end')}</label><input type="datetime-local" id="mst_e" value="${st.round_ends_at ? toLocalInput(st.round_ends_at) : ''}"></div>
      <label class="check field"><input type="checkbox" id="mst_o" ${st.voting_open ? 'checked' : ''}> ${t('ad_voting')}</label>
      <div class="field" style="grid-column:1/-1"><label class="l">${t('ad_show')}</label><div class="actions" style="justify-content:flex-start;gap:14px;flex-wrap:wrap">
        ${['instagram', 'star', 'need'].map(k => `<label class="check"><input type="checkbox" data-mui="${k}" ${missUi(k) ? 'checked' : ''}> ${t('ui_' + k)}</label>`).join('')}</div></div>
      <div class="actions"><button class="btn">${t('ad_save')}</button></div></form>
    <div class="actions" style="justify-content:flex-start;flex-wrap:wrap;margin-top:6px">
      <input type="email" id="mg_e" class="search" placeholder="${esc(t('ad_email'))}"><input type="number" id="mg_a" class="search" style="width:90px" value="100">
      <button class="btn" data-act="grant">${t('ad_grant')}</button>
      <span class="spacer" style="flex:1"></span>
      <button class="btn danger" data-act="newround">${esc(t('ad_close', { r: st.current_round }))}</button></div>
    <p class="small">${t('ad_close_hint')}</p></div>`;
  $('#missSet').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api.missSaveSettings({ title: $('#mst_t').value.trim() || 'MISS of Pattaya', registration_until: new Date($('#mst_r').value).toISOString(), voting_open: $('#mst_o').checked,
        round_ends_at: $('#mst_e').value ? new Date($('#mst_e').value).toISOString() : null,
        ui: { ...(st.ui || {}), ...Object.fromEntries([...document.querySelectorAll('[data-mui]')].map(i => [i.dataset.mui, i.checked])) } });
      toast(t('ad_saved')); await loadMiss(); renderMiss(); } catch(err){ toast(errMsg(err), true); }
  });
}
const POT_L = ['', 'A', 'B', 'C', 'D', 'E'];
function openMissNewRound(){
  const m = state.miss, st = m.st, gs = [...new Set(m.board.map(c => c.group_no))];
  const maxG = Math.max(1, ...gs.map(g => m.board.filter(c => c.group_no === g).length));
  const defEnd = new Date(Date.now() + 7 * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 11) + '20:00';
  const places = Array.from({ length: maxG }, (_, i) => i + 1);
  openModal(`<h2>${esc(t('nr_title', { r: st.current_round, n: st.current_round + 1 }))}</h2>
    <p class="sub">${esc(t('nr_sub', { c: t('contestants_n', { n: m.board.length }), g: t('groups_n', { n: gs.length }) }))}</p>
    <div class="row2">
      <div class="field"><label class="l">${t('nr_size')}</label><input type="number" id="nr_size" min="2" max="20" value="${st.group_size || 5}" class="search" style="width:100%"></div>
      <div class="field"><label class="l">${t('nr_elim')}</label><input type="number" id="nr_elim" min="0" max="10" value="${missElim()}" class="search" style="width:100%"></div>
    </div>
    <div class="field"><label class="l">${esc(t('nr_end', { n: st.current_round + 1 }))}</label><input type="datetime-local" id="nr_end" value="${defEnd}" class="search" style="width:100%"></div>
    <div class="field"><label class="l">${t('nr_pots')}</label>
      <div class="actions" style="justify-content:flex-start;flex-wrap:wrap;margin:4px 0 8px">
        <button type="button" class="chip" data-act="pre13">${t('pre_13')}</button>
        <button type="button" class="chip" data-act="preeach">${t('pre_each')}</button>
        <button type="button" class="chip" data-act="prerand">${t('pre_rand')}</button></div>
      <div class="mpots">${places.map(i => `<label class="mpot" data-mpot-row="${i}"><span>${esc(place(i))}</span><select class="sort" data-mpot="${i}">${[1, 2, 3, 4, 5].map(k => `<option value="${k}" ${(i === 2 ? 2 : 1) === k ? 'selected' : ''}>${esc(t('pot', { l: POT_L[k] }))}</option>`).join('')}</select></label>`).join('')}</div></div>
    <div id="nr_prev" class="box"></div>
    <div class="actions"><button type="button" class="btn" data-close>${t('cancel')}</button><button type="button" class="btn danger" data-act="nrgo">${t('nr_go')}</button></div>`, true);
  ['#nr_size', '#nr_elim'].forEach(q => $(q).addEventListener('input', missNrPreview));
  document.querySelectorAll('[data-mpot]').forEach(el => el.addEventListener('change', missNrPreview));
  missNrPreview();
}
function missNrRead(){
  const size = Math.floor(Number($('#nr_size').value)), elim = Math.floor(Number($('#nr_elim').value)), endV = $('#nr_end').value;
  if (!(size >= 2 && size <= 20)){ toast(t('nr_e_size'), true); return null; }
  if (!(elim >= 0 && elim <= 10)){ toast(t('nr_e_elim'), true); return null; }
  if (!endV || Date.parse(endV) <= Date.now()){ toast(t('nr_e_end'), true); return null; }
  return { size, elim, pots: [...document.querySelectorAll('[data-mpot]')].map(el => Number(el.value)), ends: new Date(endV).toISOString() };
}
function missNrPreview(){
  const el = $('#nr_prev'); if (!el) return;
  const m = state.miss, size = Math.max(2, Math.floor(Number($('#nr_size').value)) || 5), elim = Math.max(0, Math.floor(Number($('#nr_elim').value)) || 0);
  const pots = [...document.querySelectorAll('[data-mpot]')].map(x => Number(x.value));
  const byPlace = {}; let out = 0;
  for (const g of new Set(m.board.map(c => c.group_no))){ const n = m.board.filter(c => c.group_no === g).length, keep = Math.max(n - elim, 1);
    for (let i = 1; i <= keep; i++) byPlace[i] = (byPlace[i] || 0) + 1; out += n - keep; }
  document.querySelectorAll('[data-mpot-row]').forEach(r => { r.style.opacity = byPlace[r.dataset.mpotRow] ? 1 : .35; });
  const byPot = {}; Object.entries(byPlace).forEach(([pl, n]) => { const k = pots[pl - 1] || 1; (byPot[k] ||= { n:0, pl:[] }).n += n; byPot[k].pl.push(ord(Number(pl))); });
  const adv = Object.values(byPlace).reduce((a, b) => a + b, 0);
  const lines = Object.keys(byPot).sort().map(k => { const o = byPot[k], ng = Math.max(1, Math.ceil(o.n / size)), lo = Math.floor(o.n / ng), hi = Math.ceil(o.n / ng);
    return `<li>${esc(t('nr_line', { l: POT_L[k], p: o.pl.join(' + '), c: t('contestants_n', { n: o.n }), g: t('groups_n', { n: ng }), s: lo === hi ? lo : lo + '–' + hi }))}</li>`; });
  el.innerHTML = `${t('nr_prev', { a: adv, o: out })}<ul style="margin:6px 0 0;padding-left:18px">${lines.join('')}</ul>
    <p class="small" style="margin:6px 0 0">${t('nr_note')}</p>`;
}
function openRules(){
  const st = state.miss.st, regOpen = Date.now() < Date.parse(st.registration_until);
  openModal(`<h2>${esc(t('ru_title', { t: st.title }))}</h2>
    <p>${t('ru_1', { e: missElim() === 1 ? t('ru_e1') : t('ru_en', { n: missElim() }) })}</p>
    <p>${t('ru_2', { h: st.vote_hours })}</p>
    <p>${regOpen ? t('ru_open', { d: esc(fmtDate(st.registration_until)) }) : t('ru_closed')}</p>
    <p class="small">${t('ru_4')}</p>`);
}

/* ---------------- sign in & profile ---------------- */
function openLogin(mode){
  const up = mode === 'up' && !CONFIG.PRIVATE, join = joinIntent.get() && !CONFIG.PRIVATE;
  openModal(`<h2>${join ? t('jn_t1') : t('li_title')}</h2><p class="sub">${join ? t('jn_s1') : t('li_sub')}</p>
    ${CONFIG.GOOGLE_LOGIN ? `<button class="oauth" data-act="google">${ICON_G} ${t('li_google')}</button><div class="or">${t('or')}</div>` : ''}
    <form id="pwForm">
      <div class="field"><input type="email" id="li_email" required placeholder="${esc(t('email'))}" aria-label="${esc(t('email'))}" autocomplete="email"></div>
      <div class="field"><input type="password" id="li_pw" required minlength="6" placeholder="${esc(t('password'))}" aria-label="${esc(t('password'))}" autocomplete="${up ? 'new-password' : 'current-password'}"></div>
      <button class="btn primary" style="width:100%" type="submit">${up ? t('li_up') : t('li_in')}</button>
    </form>
    ${CONFIG.PRIVATE ? '' : `<p class="small" style="margin:10px 0 0;text-align:center"><button class="mlink" data-act="${up ? 'login2' : 'loginup2'}">${up ? t('li_have') : t('li_no')}</button></p>`}
    <p class="small" style="margin:6px 0 0;text-align:center"><button class="mlink" data-act="magic">${t('li_magic')}</button></p>
    ${api.mode === 'demo' ? `<div class="or">demo</div><div class="actions" style="justify-content:center"><button class="btn" data-act="demoadmin">${t('li_demo_admin')}</button><button class="btn" data-act="demouser">${t('li_demo_user')}</button></div>` : ''}
    <div class="err" id="loginErr"></div>`);
  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault(); const em = $('#li_email').value.trim(), pw = $('#li_pw').value, er = $('#loginErr'); er.style.color = ''; er.textContent = '';
    try {
      if (up){ const needConfirm = await api.signUpPassword(em, pw); if (needConfirm){ er.style.color = 'var(--up)'; er.textContent = t('li_check'); } else if ($('#pwForm')) closeModal(); }
      else { await api.signInPassword(em, pw); if ($('#pwForm')) closeModal(); }
    } catch(err){ er.textContent = errMsg(err); }
  });
}
async function sendMagic(){
  const em = $('#li_email')?.value.trim(), er = $('#loginErr');
  if (!em){ $('#li_email')?.reportValidity(); return; }
  try { await api.signInEmail(em); er.style.color = 'var(--up)'; er.textContent = t('li_magic_sent'); } catch(err){ er.style.color = ''; er.textContent = errMsg(err); }
}
function openProfile(){
  const join = joinIntent.get() && !state.profile;
  const p = state.profile || (join ? { gender: 'female' } : {}), y = new Date().getFullYear(), years = [];
  for (let i = y - 13; i >= 1920; i--) years.push(i);
  openModal(`<h2>${join ? t('jn_t2') : state.profile ? t('pf_title') : t('pf_new')}</h2><p class="sub">${join ? t('jn_s2') : t('pf_sub')}</p>${state.user?.email ? `<p class="small" style="margin:-6px 0 12px">✉️ ${esc(state.user.email)}</p>` : ''}
    <form id="profileForm">
      <div class="field"><label class="l">${t('gender')}</label>
        <div class="seg">${['female', 'male', 'other'].map((g, i) => `<label><input type="radio" name="gender" value="${g}" ${p.gender === g ? 'checked' : ''} ${i ? '' : 'required'}>${t(g)}</label>`).join('')}</div></div>
      <div class="row2">
        <div class="field"><label class="l" for="by">${t('birth_year')}</label>
          <select id="by" required><option value="">${t('choose')}</option>${years.map(v => `<option ${p.birth_year === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label class="l" for="pco">${t('your_country')}</label>
          <select id="pco" required><option value="">${t('choose')}</option>${countryList().map(([c, n]) => `<option value="${c}" ${p.country === c ? 'selected' : ''}>${flagOf(c)} ${esc(n)}</option>`).join('')}</select></div>
      </div>
      ${state.profile ? '' : `<label class="check field"><input type="checkbox" required> ${t('pf_consent')}</label>`}
      <div class="err" id="pErr"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary" type="submit">${t('save')}</button></div>
    </form>`);
  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = { gender: document.querySelector('input[name=gender]:checked')?.value, birth_year: Number($('#by').value), country: $('#pco').value, lang: LANG };
    try { await api.saveProfile(state.user.id, data); await loadAuth(); closeModal(); renderUser(); if (privateGate()) return; await loadMiss(); renderMiss(); if (!continueJoin()) toast(t('pf_saved')); }
    catch(err){ $('#pErr').textContent = errMsg(err); }
  });
}

/* ---------------- routing ---------------- */
function route(){
  const m = location.hash.match(/^#(?:c|miss)-(\d+)$/);
  if (m) openMissProfile(Number(m[1]));
}
window.addEventListener('hashchange', route);

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  if (e.target.id === 'modal') return closeModal();
  const tg = e.target.closest('button, [data-close], [data-act], [data-mcopy]');
  if (!tg) return;
  if (tg.hasAttribute('data-close')) return closeModal();
  const d = tg.dataset;
  if (d.mopen){ if (location.hash === '#c-' + d.mopen) openMissProfile(Number(d.mopen)); else location.hash = 'c-' + d.mopen; return; }
  if (d.mvote){ tg.disabled = true; const ok = await onMissVote(Number(d.mvote)); if (ok && d.closeAfter) closeModal(); else if (tg.isConnected) tg.disabled = false; return; }
  if (d.mcredopen) return openMissCreditVote(Number(d.mcredopen));
  if (d.mvotecred){ // credit votes: first click arms the button, second click confirms
    const n = Number(d.n); if (!(n > 0)) return;
    if (!state.user) return openLogin();
    if (n > (state.miss?.credits ?? 0)){ toast(`${errMsg(new Error('E:NO_CREDITS'))} ${t('you_have', { n: creditsTxt(state.miss?.credits ?? 0) })}`, true); return; }
    if (!tg.classList.contains('arm')){
      document.querySelectorAll('.mcbtn.arm').forEach(b => { b.classList.remove('arm'); b.textContent = '+' + b.dataset.n; });
      tg.classList.add('arm'); tg.textContent = t('cr_confirm', { n });
      setTimeout(() => { if (tg.isConnected && tg.classList.contains('arm')){ tg.classList.remove('arm'); tg.textContent = '+' + n; } }, 4000);
      return;
    }
    tg.disabled = true;
    if (await onMissVote(Number(d.mvotecred), n)) closeModal(); else if (tg.isConnected){ tg.disabled = false; tg.classList.remove('arm'); tg.textContent = '+' + n; }
    return; }
  if (d.mfav){ const on = missToggleFav(Number(d.mfav)); toast(on ? t('fav_added') : t('fav_removed')); renderMiss(); return; }
  if (d.mflag){ state.missFlag = state.missFlag === d.mflag ? null : d.mflag; state.missView = 'all'; closeModal(); renderMiss(); return; }
  if (d.mlayout){ store.set('mp_layout', d.mlayout); renderMiss(); return; }
  if (d.mview){ state.missView = d.mview; renderMiss(); return; }
  if (d.mshare){ const id = Number(d.mshare); try { await navigator.share({ title: state.miss.st.title, text: missShareText(id, d.own === '1'), url: missUrl(id) }); } catch {} return; }
  if (d.mcopy){ const id = Number(d.mcopy); try { await navigator.clipboard.writeText(`${missShareText(id, d.own === '1')}\n${missUrl(id)}`); toast(t('copied')); const box = tg.closest('.box')?.querySelector('.mshare-txt'); if (box){ box.classList.add('copied'); setTimeout(() => box.classList.remove('copied'), 1200); } } catch { toast(t('copy_fail'), true); } return; }
  if (d.mpage){ state.missPage = Number(d.mpage); renderMiss(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (d.mst){ try { await api.missSetStatus(Number(d.id), d.mst); toast(d.mst === 'approved' ? t('ad_approved') : t('ad_rejected')); await loadMiss(); renderMiss(); } catch(err){ toast(errMsg(err), true); } return; }
  switch (d.act){
    case 'login': joinIntent.set(false); return openLogin();
    case 'loginup': joinIntent.set(false); return openLogin('up');
    case 'login2': return openLogin();
    case 'loginup2': return openLogin('up');
    case 'magic': return sendMagic();
    case 'google': try { await api.signInGoogle(); } catch(err){ $('#loginErr').textContent = errMsg(err); } return;
    case 'demoadmin': return api.demoLogin(true);
    case 'demouser': return api.demoLogin(false);
    case 'logout': return api.signOut();
    case 'profile': joinIntent.set(false); return openProfile();
    case 'asuser': state.asUser = !state.asUser; store.set('mp_as_user', state.asUser); renderUser(); renderMiss(); return;
    case 'theme': { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem('mp_theme', next); } catch {} renderUser(); return; }
    case 'signup': return openMissSignup();
    case 'credits': return openMissCredits();
    case 'togglephotos': { const st = state.miss.st, hide = !photosHidden();
      try { await api.missSaveSettings({ ui: { ...(st.ui || {}), hide_photos: hide } }); await loadMiss(); renderMiss(); toast(hide ? t('ph_hidden_toast') : t('ph_shown_toast')); } catch(err){ toast(errMsg(err), true); }
      return; }
    case 'rules': return openRules();
    case 'grant': try { const b = await api.missGrant($('#mg_e').value.trim(), Number($('#mg_a').value)); toast(t('ad_granted', { n: creditsTxt(b) })); await loadMiss(); renderMiss(); } catch(err){ toast(errMsg(err), true); } return;
    case 'newround': return openMissNewRound();
    case 'prerand': document.querySelectorAll('[data-mpot]').forEach(el => { el.value = '1'; }); return missNrPreview();
    case 'pre13': document.querySelectorAll('[data-mpot]').forEach(el => { el.value = el.dataset.mpot === '2' ? '2' : '1'; }); return missNrPreview();
    case 'preeach': document.querySelectorAll('[data-mpot]').forEach(el => { el.value = el.dataset.mpot; }); return missNrPreview();
    case 'nrgo': {
      const v = missNrRead(); if (!v) return;
      if (!confirmClick(tg, t('nr_sure'))) return;
      tg.disabled = true;
      try { const r = await api.missNewRound(v.elim, v.size, v.pots, v.ends); closeModal();
        toast(t('nr_done', { r: r.round, a: r.advanced, o: r.eliminated, g: t('groups_n', { n: r.groups }) })); state.missPage = 1; await loadMiss(); renderMiss(); }
      catch(err){ toast(errMsg(err), true); tg.disabled = false; }
      return;
    }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden){ closeModal(); if (/^#(c|miss)-/.test(location.hash)) history.replaceState(null, '', location.pathname); } });
// closing a profile clears its #c-ID so the same link can be opened again
new MutationObserver(() => { if ($('#modal').hidden && /^#(c|miss)-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); })
  .observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });

/* ---------------- temporary country block (admins are let through) ---------------- */
const GEO_BLOCK = { countries: ['TH'], until: '2026-11-28T09:45:00Z' }; // ends by itself (UTC)
async function geoBlocked(){
  if (!GEO_BLOCK.until || Date.now() > Date.parse(GEO_BLOCK.until)) return false;
  const test = new URLSearchParams(location.search).get('geo');
  let cc = test;
  if (!cc) try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
    const r = await fetch('https://get.geojs.io/v1/ip/country.json', { signal: ctl.signal, cache: 'no-store' });
    cc = (await r.json()).country;
  } catch { return false; } // if the lookup fails, let the visitor in
  return GEO_BLOCK.countries.includes(String(cc || '').toUpperCase());
}
function privateGate(){ // private copy: only admins get past the sign-in screen
  if (!CONFIG.PRIVATE || realAdmin()) return false;
  const msg = !state.user ? t('pv_login') : state.profile ? t('pv_denied') : t('pv_profile');
  $('#app').innerHTML = `<div class="empty" style="padding:60px 20px"><h2 style="margin:0 0 8px">🔒 ${esc(t('pv_title'))}</h2><p>${esc(msg)}</p>${state.user ? '' : `<button class="btn primary" data-act="login">${t('login')}</button>`}</div>`;
  if (state.user && !state.profile) openProfile();
  return true;
}
const showGeoBlock = () => { $('#app').innerHTML = `<div class="empty" style="padding:60px 20px"><h2 style="margin:0 0 8px">👑 ${esc(t('site'))}</h2><p>${esc(t('geo_block'))}</p></div>`; };

/* ---------------- start ---------------- */
try {
  api = DEMO ? makeDemoApi() : await makeSupabaseApi();
  applyStaticText();
  await loadAuth();
  renderUser();
  $('#app').innerHTML = `<div class="empty">${t('loading')}</div>`;
  if (IS_TEST){ document.title = 'TEST · ' + document.title; $('header .logo')?.insertAdjacentHTML('beforeend', '<span class="testbadge">TEST</span>'); }
  state.geo = CONFIG.PRIVATE ? false : await geoBlocked();
  if (state.geo && !realAdmin()) showGeoBlock();
  else if (privateGate()) {}
  else { await loadMiss(); renderMiss(); route(); if (!continueJoin() && state.user && !state.profile) openProfile(); }
  api.onAuth(async () => { if (!$('#modal').hidden && $('#pwForm')) closeModal(); await loadAuth(); renderUser(); if (state.geo && !realAdmin()) return showGeoBlock(); if (privateGate()) return; await loadMiss(); renderMiss(); if (!continueJoin() && state.user && !state.profile) openProfile(); });
} catch(err){
  console.error(err);
  $('#app').innerHTML = `<div class="empty">${esc(t('load_fail', { e: errMsg(err) }))}</div>`;
}
