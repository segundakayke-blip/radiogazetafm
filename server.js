const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const DJ_USERNAME = process.env.DJ_USERNAME || 'locutor';
const DJ_PASSWORD = process.env.DJ_PASSWORD || 'TROQUE-ESTA-SENHA';
const SAMP_API_KEY = process.env.SAMP_API_KEY || '';
const guestSessions = new Map();
let sampListeners = 0;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let radioState = {
  live: false,
  djName: '',
  program: '',
  startedAt: null,
  currentTrack: '',
  settings: { discordUrl: '', carousel: [
    { title: 'GAZETA FM', subtitle: 'A trilha sonora da sua conexão.', imageUrl: '' },
    { title: 'SINTONIZE', subtitle: 'Seu momento começa aqui.', imageUrl: '' },
    { title: 'VOCÊ ESTÁ', subtitle: 'Na Gazeta FM Nacional.', imageUrl: '' }
  ] },
  mostPlayed: [{ title: 'Adicione uma música', artist: 'Painel do locutor' }],
  guest: { username: '', passwordHash: '', name: '', active: false }
};
const STATE_FILE = path.join(__dirname, 'radio-state.json');
const RESERVE_DIR = path.join(__dirname, 'reserve-audio');
if (!fs.existsSync(RESERVE_DIR)) fs.mkdirSync(RESERVE_DIR, { recursive: true });
radioState.reserve = radioState.reserve || { enabled: false, tracks: [], index: 0, startedAt: null };
try {
  if (fs.existsSync(STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved && typeof saved === 'object') {
      radioState = {
        ...radioState, ...saved,
        settings: { ...radioState.settings, ...(saved.settings || {}) },
        guest: { ...radioState.guest, ...(saved.guest || {}) },
        reserve: saved.reserve || radioState.reserve,
        mostPlayed: Array.isArray(saved.mostPlayed) ? saved.mostPlayed : radioState.mostPlayed
      };
    }
  }
} catch (e) { console.error('Não foi possível carregar o estado salvo:', e.message); }
function persistState() {
  const tmp = STATE_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(radioState), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error('Não foi possível persistir o estado:', e.message);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    const err = new Error('O servidor não conseguiu gravar as alterações. Verifique os logs/permissões do serviço no Render e tente novamente.');
    err.status = 500;
    throw err;
  }
}
let messages = [];
const sessions = new Map();
const socketIds = new Map();
const socketsById = new Map();

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function broadcast(obj) {
  if (obj && obj.type === 'state' && obj.state) { const safe = { ...obj.state, guest: { active: !!obj.state.guest?.active, name: obj.state.guest?.active ? obj.state.guest.name : '' }, listeners: [...wss.clients].filter(c => c.readyState === WebSocket.OPEN && c.radioRole === 'listener').length, sampListeners }; obj = { ...obj, state: safe }; }
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Acesso não autorizado.' });
  next();
}
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!safeEqual(username, DJ_USERNAME) || !safeEqual(password, DJ_PASSWORD)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now());
  res.json({ token, username: DJ_USERNAME });
});
app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.json({ ok: true });
});
app.get('/api/state', (req, res) => res.json({ state: { ...radioState, guest: { active: !!radioState.guest?.active, name: radioState.guest?.active ? radioState.guest.name : '' }, listeners: [...wss.clients].filter(c => c.readyState === WebSocket.OPEN && c.radioRole === 'listener').length, sampListeners }, sampListeners, messages: messages.slice(-60) }));
app.post('/api/guest/settings', auth, (req,res)=>{ const b=req.body||{}; const username=String(b.username||'').trim().slice(0,32); const password=String(b.password||'').slice(0,100); const name=String(b.name||username).trim().slice(0,32); if(username && (username.length<3 || password.length<4 || !name)) return res.status(400).json({error:'Use usuário com 3+ caracteres, senha com 4+ e informe o nome.'}); radioState.guest={username,passwordHash:username?crypto.createHash('sha256').update(password).digest('hex'):'',name,active:!!username}; persistState(); broadcast({type:'state',state:radioState}); res.json({ok:true,enabled:!!username}); });
app.post('/api/guest/login',(req,res)=>{ const b=req.body||{}; const g=radioState.guest||{}; const hash=crypto.createHash('sha256').update(String(b.password||'')).digest('hex'); if(!g.active || !safeEqual(b.username,g.username) || !safeEqual(hash,g.passwordHash)) return res.status(401).json({error:'Usuário ou senha incorretos, ou acesso de convidado desativado.'}); const token=crypto.randomBytes(32).toString('hex'); guestSessions.set(token,{name:g.name,created:Date.now()}); res.json({token,name:g.name}); });
app.post('/api/guest/logout',(req,res)=>{guestSessions.delete(String((req.body||{}).token||''));res.json({ok:true});});
app.get('/api/samp/listeners',(req,res)=>res.json({listeners:sampListeners}));
app.post('/api/samp/listeners',(req,res)=>{ if(!SAMP_API_KEY || !safeEqual(req.headers['x-samp-key'],SAMP_API_KEY)) return res.status(401).json({error:'Chave SAMP inválida.'}); const n=Number((req.body||{}).listeners); if(!Number.isInteger(n)||n<0||n>100000) return res.status(400).json({error:'Contagem inválida.'}); sampListeners=n; broadcast({type:'counts',listeners:[...wss.clients].filter(c=>c.readyState===WebSocket.OPEN&&c.radioRole==='listener').length,sampListeners}); res.json({ok:true,listeners:sampListeners}); });
app.get('/api/reserve/current', (req,res)=>{ const r=radioState.reserve||{enabled:false,tracks:[],index:0}; if(radioState.live||!r.enabled||!r.tracks?.length) return res.json({playing:false,live:radioState.live}); const index=((r.index||0)%r.tracks.length); const track=r.tracks[index]; res.json({playing:true,index,title:track.title,url:'/api/reserve/audio/'+encodeURIComponent(track.id),startedAt:r.startedAt||Date.now(),duration:track.duration||0}); });
app.get('/api/reserve/audio/:id', (req,res)=>{ const track=(radioState.reserve?.tracks||[]).find(t=>t.id===req.params.id); if(!track) return res.status(404).end(); const file=path.join(RESERVE_DIR, path.basename(track.file)); if(!fs.existsSync(file)) return res.status(404).end(); res.setHeader('Content-Type',track.mime||'audio/mpeg'); res.setHeader('Accept-Ranges','bytes'); res.sendFile(file); });
app.post('/api/reserve/upload', auth, (req,res)=>{ const b=req.body||{}; const tracks=radioState.reserve.tracks||[]; if(tracks.length>=30) return res.status(400).json({error:'Limite de 30 músicas na programação de reserva.'}); const match=String(b.data||'').match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/); if(!match) return res.status(400).json({error:'Arquivo de áudio inválido.'}); const bytes=Buffer.from(match[2],'base64'); if(bytes.length>10*1024*1024) return res.status(413).json({error:'Cada música deve ter até 10 MB.'}); const id=crypto.randomBytes(10).toString('hex'); const ext=({ 'audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav','audio/ogg':'ogg','audio/mp4':'m4a','audio/aac':'aac','audio/webm':'webm' })[match[1]]||'audio'; const file=id+'.'+ext; fs.writeFileSync(path.join(RESERVE_DIR,file),bytes); tracks.push({id,title:String(b.title||'Música').slice(0,160),file,mime:match[1],duration:Number(b.duration)||0}); radioState.reserve.tracks=tracks; persistState(); broadcast({type:'state',state:radioState}); res.json({tracks:tracks.map(t=>({id:t.id,title:t.title,duration:t.duration})),state:radioState}); });
app.post('/api/reserve/remove', auth, (req,res)=>{ const id=String((req.body||{}).id||''); const r=radioState.reserve; const t=r.tracks.find(x=>x.id===id); if(t){try{fs.unlinkSync(path.join(RESERVE_DIR,path.basename(t.file)))}catch{} r.tracks=r.tracks.filter(x=>x.id!==id); r.index=Math.max(0,Math.min(r.index,r.tracks.length-1)); persistState(); broadcast({type:'state',state:radioState});} res.json({state:radioState,tracks:r.tracks.map(x=>({id:x.id,title:x.title}))}); });
app.post('/api/reserve/settings', auth, (req,res)=>{ const b=req.body||{}; radioState.reserve.enabled=Boolean(b.enabled); if(Number.isInteger(b.index)) radioState.reserve.index=Math.max(0,Math.min(b.index,Math.max(0,radioState.reserve.tracks.length-1))); radioState.reserve.startedAt=Date.now(); if(radioState.reserve.enabled) radioState.live=false; persistState(); broadcast({type:'state',state:radioState}); broadcast({type:'notice',message:radioState.reserve.enabled?'Programação automática de reserva ativada.':'Programação automática de reserva desativada.'}); res.json({state:radioState}); });
app.post('/api/reserve/next', (req,res)=>{ const r=radioState.reserve; if(radioState.live||!r.enabled||!r.tracks.length) return res.json({ok:false}); r.index=(r.index+1)%r.tracks.length; r.startedAt=Date.now(); persistState(); broadcast({type:'state',state:radioState}); res.json({ok:true,index:r.index,track:r.tracks[r.index]}); });
app.post('/api/broadcast', auth, (req, res) => {
  const { live, djName, program } = req.body || {};
  const previousDj = radioState.djName; const previousProgram = radioState.program;
  radioState = {
    ...radioState,
    live: Boolean(live),
    djName: typeof djName === 'string' ? djName.slice(0, 80) : radioState.djName,
    program: typeof program === 'string' ? program.slice(0, 100) : radioState.program,
    startedAt: live ? (radioState.live ? radioState.startedAt : Date.now()) : null
  };
  if (live && radioState.reserve) radioState.reserve.enabled = false;
  persistState();
  broadcast({ type: 'state', state: radioState });
  if (typeof djName === 'string' && typeof program === 'string' && (previousDj !== radioState.djName || previousProgram !== radioState.program)) broadcast({ type: 'notice', message: `Programação atualizada: ${radioState.program} — ${radioState.djName}.` });
  res.json({ state: radioState });
});
app.post('/api/settings', auth, (req, res) => {
  const body = req.body || {};
  let discordChanged = false;
  if (typeof body.discordUrl === 'string') {
    const url = body.discordUrl.trim();
    if (url && (!/^https:\/\//i.test(url) || url.length > 500)) {
      return res.status(400).json({ error: 'O link do Discord precisa começar com https:// e ter até 500 caracteres.' });
    }
    discordChanged = url !== radioState.settings.discordUrl;
    radioState.settings.discordUrl = url;
  }
  if (Array.isArray(body.carousel)) radioState.settings.carousel = body.carousel.slice(0, 3).map(slide => ({
    title: String(slide.title || '').slice(0, 100), subtitle: String(slide.subtitle || '').slice(0, 200), imageUrl: String(slide.imageUrl || '').slice(0, 2800000)
  }));
  persistState();
  broadcast({ type: 'state', state: radioState });
  if (discordChanged) broadcast({ type: 'notice', message: 'O link do Discord foi atualizado.' });
  res.json({ state: radioState });
});
app.post('/api/current-track', auth, (req, res) => {
  radioState.currentTrack = String((req.body || {}).title || '').slice(0, 160);
  persistState();
  broadcast({ type: 'state', state: radioState }); res.json({ state: radioState });
});
app.post('/api/songs', auth, (req, res) => {
  const songs = Array.isArray(req.body.songs) ? req.body.songs.slice(0, 20) : [];
  radioState.mostPlayed = songs.map(s => ({
    title: String(s.title || '').slice(0, 100),
    artist: String(s.artist || '').slice(0, 100)
  })).filter(s => s.title);
  persistState();
  broadcast({ type: 'state', state: radioState });
  res.json({ state: radioState });
});
wss.on('connection', (ws) => {
  const clientId = crypto.randomBytes(10).toString('hex');
  socketIds.set(ws, clientId); socketsById.set(clientId, ws); ws.radioRole='listener';
  ws.send(JSON.stringify({ type: 'hello', clientId }));
  ws.send(JSON.stringify({ type: 'state', state: radioState }));
  ws.send(JSON.stringify({type:'counts',listeners:[...wss.clients].filter(c=>c.readyState===WebSocket.OPEN&&c.radioRole==='listener').length,sampListeners}));
  messages.slice(-60).forEach(m => ws.send(JSON.stringify({ type: 'chat', message: m })));
  ws.on('close', () => { socketIds.delete(ws); socketsById.delete(clientId); broadcast({type:'counts',listeners:[...wss.clients].filter(c=>c!==ws&&c.readyState===WebSocket.OPEN&&c.radioRole==='listener').length,sampListeners}); if(ws.radioRole==='guest' && radioState.guest?.active){radioState.guest.active=false;radioState.guest.name='';persistState();broadcast({type:'state',state:radioState});} });
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type === 'role') { if(['listener','dj','guest'].includes(data.role)) ws.radioRole=data.role; broadcast({type:'counts',listeners:[...wss.clients].filter(c=>c.readyState===WebSocket.OPEN&&c.radioRole==='listener').length,sampListeners}); return; }
    if (data.type === 'guest-auth') { const session=guestSessions.get(String(data.token||'')); if(!session){ws.send(JSON.stringify({type:'guest-error',error:'Sessão do convidado inválida.'}));return;} ws.radioRole='guest'; radioState.guest.active=true;radioState.guest.name=session.name;persistState();broadcast({type:'state',state:radioState});broadcast({type:'counts',listeners:[...wss.clients].filter(c=>c.readyState===WebSocket.OPEN&&c.radioRole==='listener').length,sampListeners});broadcast({type:'notice',message:'Convidado conectado: '+session.name});return; }
    if (data.type === 'rtc-join') { broadcast({ type: 'rtc-join', from: clientId }); return; }
    if (data.type === 'rtc') { const target = socketsById.get(String(data.to || '')); if (target && target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ type: 'rtc', from: clientId, payload: data.payload })); return; }
    if (data.type !== 'chat') return;
    if (!radioState.live) { ws.send(JSON.stringify({ type: 'chat-error', error: 'O chat será liberado quando a transmissão começar.' })); return; }
    const name = ws.radioRole==='guest' ? ('Convidado: '+String(radioState.guest?.name||'Convidado')) : (ws.radioRole==='dj' ? 'Locutor' : String(data.name || 'Ouvinte').trim().slice(0,32) || 'Ouvinte');
    const text = String(data.text || '').trim().slice(0, 500);
    if (!text) return;
    const message = { name, text, time: new Date().toISOString() };
    messages.push(message);
    if (messages.length > 100) messages = messages.slice(-100);
    broadcast({ type: 'chat', message });
  });
});
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const message = status === 413
    ? 'Arquivo muito grande. Reduza o tamanho da imagem e tente novamente.'
    : (status >= 500 && err.message && err.message.startsWith('O servidor não conseguiu gravar')
      ? err.message
      : 'Não foi possível processar a solicitação. Confira os dados e tente novamente.');
  res.status(status).json({ error: message });
});
app.get('/convidado', (req,res)=>res.sendFile(path.join(__dirname,'public','guest.html')));
app.get('/samp-radio', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
server.listen(PORT, '0.0.0.0', () => console.log(`GAZETA FM NACIONAL rodando na porta ${PORT}`));
