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
  mostPlayed: [{ title: 'Adicione uma música', artist: 'Painel do locutor' }]
};
const STATE_FILE = path.join(__dirname, 'radio-state.json');
try {
  if (fs.existsSync(STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved && typeof saved === 'object') {
      radioState = {
        ...radioState, ...saved,
        settings: { ...radioState.settings, ...(saved.settings || {}) },
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
app.get('/api/state', (req, res) => res.json({ state: radioState, messages: messages.slice(-60) }));
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
  socketIds.set(ws, clientId); socketsById.set(clientId, ws);
  ws.send(JSON.stringify({ type: 'hello', clientId }));
  ws.send(JSON.stringify({ type: 'state', state: radioState }));
  messages.slice(-60).forEach(m => ws.send(JSON.stringify({ type: 'chat', message: m })));
  ws.on('close', () => { socketIds.delete(ws); socketsById.delete(clientId); });
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type === 'rtc-join') { broadcast({ type: 'rtc-join', from: clientId }); return; }
    if (data.type === 'rtc') { const target = socketsById.get(String(data.to || '')); if (target && target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ type: 'rtc', from: clientId, payload: data.payload })); return; }
    if (data.type !== 'chat') return;
    if (!radioState.live) { ws.send(JSON.stringify({ type: 'chat-error', error: 'O chat será liberado quando a transmissão começar.' })); return; }
    const name = String(data.name || 'Ouvinte').trim().slice(0, 32) || 'Ouvinte';
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
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
server.listen(PORT, '0.0.0.0', () => console.log(`GAZETA FM NACIONAL rodando na porta ${PORT}`));
