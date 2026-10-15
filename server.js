const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const DJ_USERNAME = process.env.DJ_USERNAME || 'locutor';
const DJ_PASSWORD = process.env.DJ_PASSWORD || 'TROQUE-ESTA-SENHA';

app.use(express.json({ limit: '10mb' }));
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
let messages = [];
const sessions = new Map();

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
  radioState = {
    ...radioState,
    live: Boolean(live),
    djName: live ? String(djName || '').slice(0, 80) : '',
    program: live ? String(program || '').slice(0, 100) : '',
    startedAt: live ? (radioState.live ? radioState.startedAt : Date.now()) : null
  };
  broadcast({ type: 'state', state: radioState });
  res.json({ state: radioState });
});
app.post('/api/settings', auth, (req, res) => {
  const body = req.body || {};
  if (typeof body.discordUrl === 'string') radioState.settings.discordUrl = body.discordUrl.slice(0, 500);
  if (Array.isArray(body.carousel)) radioState.settings.carousel = body.carousel.slice(0, 3).map(slide => ({
    title: String(slide.title || '').slice(0, 100), subtitle: String(slide.subtitle || '').slice(0, 200), imageUrl: String(slide.imageUrl || '').slice(0, 2800000)
  }));
  broadcast({ type: 'state', state: radioState }); res.json({ state: radioState });
});
app.post('/api/current-track', auth, (req, res) => {
  radioState.currentTrack = String((req.body || {}).title || '').slice(0, 160);
  broadcast({ type: 'state', state: radioState }); res.json({ state: radioState });
});
app.post('/api/songs', auth, (req, res) => {
  const songs = Array.isArray(req.body.songs) ? req.body.songs.slice(0, 20) : [];
  radioState.mostPlayed = songs.map(s => ({
    title: String(s.title || '').slice(0, 100),
    artist: String(s.artist || '').slice(0, 100)
  })).filter(s => s.title);
  broadcast({ type: 'state', state: radioState });
  res.json({ state: radioState });
});
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state: radioState }));
  messages.slice(-60).forEach(m => ws.send(JSON.stringify({ type: 'chat', message: m })));
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
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
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
server.listen(PORT, '0.0.0.0', () => console.log(`GAZETA FM NACIONAL rodando na porta ${PORT}`));
