const $ = (id) => document.getElementById(id);
let token = '';
let ws;
let currentState = {live:false,djName:'',program:'',mostPlayed:[]};
let localFiles = {music:Array(5).fill(null),effect:Array(5).fill(null),commercial:Array(5).fill(null)};
let micStream = null; let crossfadeTimer = null;
let audioContext = null; let analyser = null; let meterTimer = null; let currentAudio = null; let currentAudioType = null; let fadeTimer = null; let carouselIndex = 0;
function notify(message, kind='success'){let root=$('toastRoot');if(!root){root=document.createElement('div');root.id='toastRoot';root.className='toast-root';root.setAttribute('aria-live','polite');document.body.appendChild(root)}const el=document.createElement('div');el.className='toast '+(kind==='error'?'toast-error':'');el.textContent=message;root.appendChild(el);requestAnimationFrame(()=>el.classList.add('toast-show'));setTimeout(()=>{el.classList.remove('toast-show');setTimeout(()=>el.remove(),250)},3200)}
function fadeOut(audio, duration=2500){return new Promise(resolve=>{if(!audio||audio.paused){if(audio)audio.pause();resolve();return}const start=audio.volume, began=performance.now();clearInterval(fadeTimer);fadeTimer=setInterval(()=>{const t=Math.min(1,(performance.now()-began)/duration);audio.volume=Math.max(0,start*(1-t));if(t>=1){clearInterval(fadeTimer);audio.pause();audio.currentTime=0;audio.volume=start;resolve()}},50)})}
function musicNearEnd(){return !!(currentAudio&&currentAudioType==='music'&&!currentAudio.paused&&Number.isFinite(currentAudio.duration)&&currentAudio.duration-currentAudio.currentTime<=8)}

$('year').textContent = new Date().getFullYear();
const eq = Pisando = $('equalizer');
if(eq){for(let i=0;i<29;i++){const bar=document.createElement('i');bar.style.setProperty('--h',(18+Math.round(Math.random()*105))+'px');eq.appendChild(bar);}}
function connect(){
 const proto=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(`${proto}//${location.host}`);
 ws.onmessage=(ev)=>{let d;try{d=JSON.parse(ev.data)}catch{return}if(d.type==='state')renderState(d.state);if(d.type==='chat')addChat(d.message);if(d.type==='chat-error')notify(d.error||'Chat indisponível.','error')};
 ws.onclose=()=>setTimeout(connect,2500);
}
connect();
async function refresh(){try{const r=await fetch('/api/state');const d=await r.json();renderState(d.state);(d.messages||[]).forEach(addChat)}catch{}}
refresh();
function renderState(s){if(!s)return;currentState=s;$('liveBadge').className='status '+(s.live?'live':'offline');$('liveBadge').innerHTML=s.live?'<i></i> TRANSMISSÃO AO VIVO':'<i></i> AGUARDANDO LOCUTOR';$('programName').textContent=s.live?(s.program||'Programa ao vivo'):(s.program||'Aguardando locutor');$('djName').textContent=s.live?`No comando: ${s.djName||'Locutor'}`:(s.djName?`Próximo locutor: ${s.djName}`:'A programação será anunciada aqui.');$('currentTrack').textContent=s.currentTrack||'Nenhuma música informada';renderTracks(s.mostPlayed||[]);const chatStatus=$('chatLiveStatus');if(chatStatus){chatStatus.textContent=s.live?'● CHAT LIBERADO':'● CHAT BLOQUEADO';chatStatus.style.color=s.live?'#6ee7b7':'#fda4af';}const chatLocked=!s.live;$('chatName').disabled=chatLocked;$('chatText').disabled=chatLocked;$('chatForm').querySelector('button').disabled=chatLocked;$('chatText').placeholder=chatLocked?'Aguarde o início da transmissão...':'Escreva uma mensagem...';$('adminChatGate').textContent=s.live?'Transmissão ao vivo: chat liberado.':'O chat ficará disponível quando a transmissão começar.';if(s.settings){renderCarousel(s.settings.carousel||[]);if(s.settings.discordUrl)$('discordButton').dataset.url=s.settings.discordUrl;else delete $('discordButton').dataset.url;if($('discordEdit')&&document.activeElement!==$('discordEdit'))$('discordEdit').value=s.settings.discordUrl||'';}}
function addChat(m){const box=$('chatMessages');if(box.querySelector('.empty'))box.innerHTML='';if([...box.children].some(el=>el.dataset.key===`${m.time}|${m.name}|${m.text}`))return;const div=document.createElement('div');div.className='chat-msg';div.dataset.key=`${m.time}|${m.name}|${m.text}`;const b=document.createElement('b');b.textContent=m.name;const span=document.createElement('span');span.textContent=': '+m.text;const time=document.createElement('time');time.textContent=new Date(m.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});div.append(b,span,time);box.appendChild(div);const admin=$('adminChatMessages');if(admin){const copy=div.cloneNode(true);admin.appendChild(copy);while(admin.children.length>100)admin.removeChild(admin.firstChild)}while(box.children.length>100)box.removeChild(box.firstChild);box.scrollTop=box.scrollHeight}
$('adminChatForm').addEventListener('submit',e=>{e.preventDefault();if(!currentState.live){notify('Inicie a transmissão para conversar com os ouvintes.','error');return}const text=$('adminChatText').value.trim();if(!text)return;if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'chat',name:($('djInput').value.trim()||currentState.djName||'Locutor')+' (Locutor)',text}));$('adminChatText').value=''}else notify('Conectando ao chat. Tente novamente em instantes.','error')});
$('chatForm').addEventListener('submit',e=>{e.preventDefault();if(!currentState.live){notify('O chat será liberado quando a transmissão começar.','error');return}const text=$('chatText').value.trim();if(!text)return;if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'chat',name:$('chatName').value.trim()||'Ouvinte',text}));else alert('Conectando ao chat. Tente novamente em instantes.');$('chatText').value=''});
$('discordButton').addEventListener('click',()=>{const url=$('discordButton').dataset.url||'';if(!/^https:\/\//i.test(url)){alert('O link do Discord ainda não foi configurado.');return}localStorage.setItem('gazetaDiscord',url);window.open(url,'_blank','noopener,noreferrer')});

$('playButton').addEventListener('click',()=>alert('Este player está preparado visualmente. O áudio ao vivo para todos os ouvintes não pode ser garantido usando somente o Render Free.'));
$('openLogin').onclick=()=>{$('loginModal').classList.remove('hidden')};
$('closeLogin').onclick=()=>{$('loginModal').classList.add('hidden')};
$('loginModal').addEventListener('click',e=>{if(e.target===$('loginModal'))$('loginModal').classList.add('hidden')});
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});const d=await r.json();if(!r.ok)throw Error(d.error||'Falha no login');token=d.token;$('loginModal').classList.add('hidden');$('dashboard').classList.remove('hidden');notify('Você entrou no painel do locutor.');$('password').value='';initSlots();loadEditor();showDashboardTab('transmission');buildCarouselEditors(currentState.settings?.carousel||[]);$('discordEdit').value=currentState.settings?.discordUrl||'';$('programEdit').value=$('programInput').value;$('djEdit').value=$('djInput').value;}catch(err){$('loginError').textContent=err.message;notify('Não foi possível entrar: '+err.message,'error')}});
$('logout').onclick=async()=>{try{await fetch('/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch{}token='';closeMic();$('dashboard').classList.add('hidden')};
async function api(url,body){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
 let d;try{d=await r.json()}catch{throw Error(r.status===413?'Os dados enviados ficaram grandes demais. Escolha imagens menores.':'O servidor retornou uma resposta inválida. Recarregue a página e tente novamente.')}
 if(r.status===401){token='';throw Error('Sua sessão do painel expirou. Feche o painel, entre novamente e tente salvar.')}
 if(!r.ok)throw Error(d.error||`Erro ao salvar (HTTP ${r.status})`);
 if(d.state)renderState(d.state);
 return d
}
$('startLive').onclick=async()=>{const name=$('djInput').value.trim();const program=$('programInput').value.trim();if(!name||!program){alert('Preencha o nome do locutor e o programa atual.');return}try{const d=await api('/api/broadcast',{live:true,djName:name,program});renderState(d.state);notify('Transmissão marcada como AO VIVO. Isso não inicia áudio público para todos os ouvintes.')}catch(e){alert(e.message)}};
$('endLive').onclick=async()=>{try{const d=await api('/api/broadcast',{live:false});renderState(d.state);notify('Transmissão encerrada.')}catch(e){alert(e.message)}};
$('micOpen').onclick=async()=>{try{micStream=await navigator.mediaDevices.getUserMedia({audio:true});$('localMicAudio').srcObject=micStream;$('localMicAudio').classList.remove('hidden');$('micStatus').textContent='Microfone aberto neste navegador (prévia local).';}catch(e){$('micStatus').textContent='Não foi possível acessar o microfone: '+e.message}};
function closeMic(){if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}$('localMicAudio').srcObject=null;$('localMicAudio').classList.add('hidden');$('micStatus').textContent='Microfone fechado.'}
$('micClose').onclick=closeMic;
function initSlots(){
 const groups=[['music','musicSlots','Tocar'],['effect','effectSlots','Disparar'],['commercial','commercialSlots','Disparar']];
 for(const [type,id,action] of groups){const root=$(id);root.innerHTML='';for(let i=0;i<5;i++){
  const wrap=document.createElement('div');wrap.className='slot';const input=document.createElement('input');input.type='file';input.accept='audio/*';input.setAttribute('aria-label',`${type} ${i+1}`);
  const go=document.createElement('button');go.className='btn';go.textContent=action;const remove=document.createElement('button');remove.className='btn remove';remove.textContent='Remover';const name=document.createElement('div');name.className='slot-name';name.textContent='Nenhum arquivo selecionado';
O motivo do erro é que, ao copiar pelo celular, o seu arquivo acabou vindo com linhas incompletas (com pontos de interrogação perdidos nas linhas files?.), o que quebra o JavaScript no navegador.
Para consertar isso de uma vez e sem mexer em absolutamente nada do seu painel original, o código abaixo está com o erro corrigido e as linhas limpas (sem nenhum caractere bugado).
Substitua todo o conteúdo do seu arquivo public/app.js no GitHub por este código:
javascript
const $ = (id) => document.getElementById(id);
let token = '';
let ws;
let currentState = {live:false,djName:'',program:'',mostPlayed:[]};
let localFiles = {music:Array(5).fill(null),effect:Array(5).fill(null),commercial:Array(5).fill(null)};
let micStream = null; let crossfadeTimer = null;
let audioContext = null; let analyser = null; let meterTimer = null; let currentAudio = null; let currentAudioType = null; let fadeTimer = null; let carouselIndex = 0;
function notify(message, kind='success'){let root=$('toastRoot');if(!root){root=document.createElement('div');root.id='toastRoot';root.className='toast-root';root.setAttribute('aria-live','polite');document.body.appendChild(root)}const el=document.createElement('div');el.className='toast '+(kind==='error'?'toast-error':'');el.textContent=message;root.appendChild(el);requestAnimationFrame(()=>el.classList.add('toast-show'));setTimeout(()=>{el.classList.remove('toast-show');setTimeout(()=>el.remove(),250)},3200)}
function fadeOut(audio, duration=2500){return new Promise(resolve=>{if(!audio||audio.paused){if(audio)audio.pause();resolve();return}const start=audio.volume, began=performance.now();clearInterval(fadeTimer);fadeTimer=setInterval(()=>{const t=Math.min(1,(performance.now()-began)/duration);audio.volume=Math.max(0,start*(1-t));if(t>=1){clearInterval(fadeTimer);audio.pause();audio.currentTime=0;audio.volume=start;resolve()}},50)})}
function musicNearEnd(){return !!(currentAudio&&currentAudioType==='music'&&!currentAudio.paused&&Number.isFinite(currentAudio.duration)&&currentAudio.duration-currentAudio.currentTime<=8)}

$('year').textContent = new Date().getFullYear();
const eq = Pisando = $('equalizer');
if(eq){for(let i=0;i<29;i++){const bar=document.createElement('i');bar.style.setProperty('--h',(18+Math.round(Math.random()*105))+'px');eq.appendChild(bar);}}
function connect(){
 const proto=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(`${proto}//${location.host}`);
 ws.onmessage=(ev)=>{let d;try{d=JSON.parse(ev.data)}catch{return}if(d.type==='state')renderState(d.state);if(d.type==='chat')addChat(d.message);if(d.type==='chat-error')notify(d.error||'Chat indisponível.','error')};
 ws.onclose=()=>setTimeout(connect,2500);
}
connect();
async function refresh(){try{const r=await fetch('/api/state');const d=await r.json();renderState(d.state);(d.messages||[]).forEach(addChat)}catch{}}
refresh();
function renderState(s){if(!s)return;currentState=s;$('liveBadge').className='status '+(s.live?'live':'offline');$('liveBadge').innerHTML=s.live?'<i></i> TRANSMISSÃO AO VIVO':'<i></i> AGUARDANDO LOCUTOR';$('programName').textContent=s.live?(s.program||'Programa ao vivo'):(s.program||'Aguardando locutor');$('djName').textContent=s.live?`No comando: ${s.djName||'Locutor'}`:(s.djName?`Próximo locutor: ${s.djName}`:'A programação será anunciada aqui.');$('currentTrack').textContent=s.currentTrack||'Nenhuma música informada';renderTracks(s.mostPlayed||[]);const chatStatus=$('chatLiveStatus');if(chatStatus){chatStatus.textContent=s.live?'● CHAT LIBERADO':'● CHAT BLOQUEADO';chatStatus.style.color=s.live?'#6ee7b7':'#fda4af';}const chatLocked=!s.live;$('chatName').disabled=chatLocked;$('chatText').disabled=chatLocked;$('chatForm').querySelector('button').disabled=chatLocked;$('chatText').placeholder=chatLocked?'Aguarde o início da transmissão...':'Escreva uma mensagem...';$('adminChatGate').textContent=s.live?'Transmissão ao vivo: chat liberado.':'O chat ficará disponível quando a transmissão começar.';if(s.settings){renderCarousel(s.settings.carousel||[]);if(s.settings.discordUrl)$('discordButton').dataset.url=s.settings.discordUrl;else delete $('discordButton').dataset.url;if($('discordEdit')&&document.activeElement!==$('discordEdit'))$('discordEdit').value=s.settings.discordUrl||'';}}
function addChat(m){const box=$('chatMessages');if(box.querySelector('.empty'))box.innerHTML='';if([...box.children].some(el=>el.dataset.key===`${m.time}|${m.name}|${m.text}`))return;const div=document.createElement('div');div.className='chat-msg';div.dataset.key=`${m.time}|${m.name}|${m.text}`;const b=document.createElement('b');b.textContent=m.name;const span=document.createElement('span');span.textContent=': '+m.text;const time=document.createElement('time');time.textContent=new Date(m.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});div.append(b,span,time);box.appendChild(div);const admin=$('adminChatMessages');if(admin){const copy=div.cloneNode(true);admin.appendChild(copy);while(admin.children.length>100)admin.removeChild(admin.firstChild)}while(box.children.length>100)box.removeChild(box.firstChild);box.scrollTop=box.scrollHeight}
$('adminChatForm').addEventListener('submit',e=>{e.preventDefault();if(!currentState.live){notify('Inicie a transmissão para conversar com os ouvintes.','error');return}const text=$('adminChatText').value.trim();if(!text)return;if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'chat',name:($('djInput').value.trim()||currentState.djName||'Locutor')+' (Locutor)',text}));$('adminChatText').value=''}else notify('Conectando ao chat. Tente novamente em instantes.','error')});
$('chatForm').addEventListener('submit',e=>{e.preventDefault();if(!currentState.live){notify('O chat será liberado quando a transmissão começar.','error');return}const text=$('chatText').value.trim();if(!text)return;if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'chat',name:$('chatName').value.trim()||'Ouvinte',text}));else alert('Conectando ao chat. Tente novamente em instantes.');$('chatText').value=''});
$('discordButton').addEventListener('click',()=>{const url=$('discordButton').dataset.url||'';if(!/^https:\/\//i.test(url)){alert('O link do Discord ainda não foi configurado.');return}localStorage.setItem('gazetaDiscord',url);window.open(url,'_blank','noopener,noreferrer')});

$('playButton').addEventListener('click',()=>alert('Este player está preparado visualmente. O áudio ao vivo para todos os ouvintes não pode ser garantido usando somente o Render Free.'));
$('openLogin').onclick=()=>{$('loginModal').classList.remove('hidden')};
$('closeLogin').onclick=()=>{$('loginModal').classList.add('hidden')};
$('loginModal').addEventListener('click',e=>{if(e.target===$('loginModal'))$('loginModal').classList.add('hidden')});
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});const d=await r.json();if(!r.ok)throw Error(d.error||'Falha no login');token=d.token;$('loginModal').classList.add('hidden');$('dashboard').classList.remove('hidden');notify('Você entrou no painel do locutor.');$('password').value='';initSlots();loadEditor();showDashboardTab('transmission');buildCarouselEditors(currentState.settings?.carousel||[]);$('discordEdit').value=currentState.settings?.discordUrl||'';$('programEdit').value=$('programInput').value;$('djEdit').value=$('djInput').value;}catch(err){$('loginError').textContent=err.message;notify('Não foi possível entrar: '+err.message,'error')}});
$('logout').onclick=async()=>{try{await fetch('/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch{}token='';closeMic();$('dashboard').classList.add('hidden')};
async function api(url,body){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
 let d;try{d=await r.json()}catch{throw Error(r.status===413?'Os dados enviados ficaram grandes demais. Escolha imagens menores.':'O servidor retornou uma resposta inválida. Recarregue a página e tente novamente.')}
 if(r.status===401){token='';throw Error('Sua sessão do painel expirou. Feche o painel, entre novamente e tente salvar.')}
 if(!r.ok)throw Error(d.error||`Erro ao salvar (HTTP ${r.status})`);
 if(d.state)renderState(d.state);
 return d
}
$('startLive').onclick=async()=>{const name=$('djInput').value.trim();const program=$('programInput').value.trim();if(!name||!program){alert('Preencha o nome do locutor e o programa atual.');return}try{const d=await api('/api/broadcast',{live:true,djName:name,program});renderState(d.state);notify('Transmissão marcada como AO VIVO. Isso não inicia áudio público para todos os ouvintes.')}catch(e){alert(e.message)}};
$('endLive').onclick=async()=>{try{const d=await api('/api/broadcast',{live:false});renderState(d.state);notify('Transmissão encerrada.')}catch(e){alert(e.message)}};
$('micOpen').onclick=async()=>{try{micStream=await navigator.mediaDevices.getUserMedia({audio:true});$('localMicAudio').srcObject=micStream;$('localMicAudio').classList.remove('hidden');$('micStatus').textContent='Microfone aberto neste navegador (prévia local).';}catch(e){$('micStatus').textContent='Não foi possível acessar o microfone: '+e.message}};
function closeMic(){if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}$('localMicAudio').srcObject=null;$('localMicAudio').classList.add('hidden');$('micStatus').textContent='Microfone fechado.'}
$('micClose').onclick=closeMic;
function initSlots(){
 const groups=[['music','musicSlots','Tocar'],['effect','effectSlots','Disparar'],['commercial','commercialSlots','Disparar']];
 for(const [type,id,action] of groups){const root=$(id);root.innerHTML='';for(let i=0;i<5;i++){
  const wrap=document.createElement('div');wrap.className='slot';const input=document.createElement('input');input.type='file';input.accept='audio/*';input.setAttribute('aria-label',`${type} ${i+1}`);
  const go=document.createElement('button');go.className='btn';go.textContent=action;const remove=document.createElement('button');remove.className='btn remove';remove.textContent='Remover';const name=document.createElement('div');name.className='slot-name';name.textContent='Nenhum arquivo selecionado';
Use o código com cuidado.
input.onchange=()=>{const old=localFiles[type][i];if(old)URL.revokeObjectURL(old.url);const f=input.files[0];localFiles[type][i]=f?{file:f,url:URL.createObjectURL(f)}:null;name.textContent=f?f.name:'Nenhum arquivo selecionado';if(f)notify((type==='music'?'Música':type==='effect'?'Efeito':'Vinheta/anúncio')+' adicionado com sucesso: '+f.name)};
go.onclick=async()=>{const item=localFiles[type][i];if(!item){notify('Selecione um arquivo de áudio primeiro.','error');return}
if(type!=='music'&&currentAudio&&currentAudioType==='music'&&!currentAudio.paused&&!musicNearEnd()){const remaining=Number.isFinite(currentAudio.duration)?Math.ceil(currentAudio.duration-currentAudio.currentTime):null;notify(remaining!==null?Aguarde o final da música. Faltam cerca de ${remaining} segundos para disparar.:'Aguarde o final da música para disparar a vinheta ou o efeito.','error');return}
if(type==='music'){
const previous=currentAudio&&currentAudioType==='music'&&!currentAudio.paused?currentAudio:null;
const next=new Audio(item.url);next.preload='auto';next.volume=previous?0:1;next.muted=!$('musicReturn').checked;
try{await next.play()}catch(e){notify('O navegador bloqueou o áudio. Toque novamente.','error');return}
currentAudio=next;currentAudioType='music';next.onended=()=>{if(currentAudio===next){currentAudio=null;currentAudioType=null}notify('A música terminou.')};
if(previous){if(crossfadeTimer)clearInterval(crossfadeTimer);const start=performance.now(),duration=4000,oldVolume=previous.volume;crossfadeTimer=setInterval(()=>{const linear=Math.min(1,(performance.now()-start)/duration);const t=linearlinear(3-2linear);previous.volume=Math.max(0,oldVolume(1-t));next.volume=Math.min(1,t);if(linear>=1){clearInterval(crossfadeTimer);crossfadeTimer=null;previous.pause();previous.currentTime=0;previous.volume=oldVolume;next.volume=1}},40);notify('Transição suave ativada: a música anterior baixa enquanto a próxima aumenta.')}else notify('Tocando agora: '+item.file.name);
try{await api('/api/current-track',{title:item.file.name.replace(/.[^.]+$/,'')})}catch(e){notify('A música está tocando, mas não foi possível atualizar o título no site.','error')}
}else{
const audio=new Audio(item.url);audio.muted=!$('musicReturn').checked;try{await audio.play();notify((type==='effect'?'Efeito':'Vinheta/anúncio')+' disparado: '+item.file.name)}catch(e){notify('O navegador bloqueou o áudio. Toque novamente.','error')}
}
};
remove.onclick=()=>{const item=localFiles[type][i];if(item)URL.revokeObjectURL(item.url);localFiles[type][i]=null;input.value='';name.textContent='Nenhum arquivo selecionado';notify('Arquivo removido.')};wrap.append(input,go,remove,name);root.appendChild(wrap)
}}
}
function loadEditor(){ $('tracksEditor').value=(currentState.mostPlayed||[]).filter(x=>x.title&&x.title!=='Adicione uma música').map(x=>x.title+(x.artist?' — '+x.artist:'')).join('\n');}
function renderTracks(tracks){const root=$('topTracks');root.innerHTML='';const clean=tracks.filter(t=>t.title);if(!clean.length){root.innerHTML='01Nenhuma música cadastradaO locutor pode adicionar pelo painel.';return}clean.forEach((t,i)=>{const row=document.createElement('div');row.className='track-row';const rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');const body=document.createElement('div');const title=document.createElement('b');title.textContent=t.title;const artist=document.createElement('p');artist.textContent=t.artist||'GAZETA FM NACIONAL';body.append(title,artist);row.append(rank,body);root.appendChild(row)})}
$('saveTracks').onclick=async()=>{const songs=$('tracksEditor').value.split('\n').map(line=>{const parts=line.split('—');return {title:(parts[0]||'').trim(),artist:(parts.slice(1).join('—')||'').trim()}}).filter(x=>x.title);try{const d=await api('/api/songs',{songs});renderState(d.state);notify('Lista de mais tocadas atualizada.')}catch(e){alert(e.message)}};
$('moreMenu').onclick=()=> $('moreDropdown').classList.toggle('hidden');
function showDashboardTab(name){
document.querySelectorAll('.dash-tab').forEach(el=>el.classList.toggle('hidden',el.dataset.tab!==name));
$('moreDropdown').classList.add('hidden');
}
document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>showDashboardTab(b.dataset.edit)));
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))$('moreDropdown').classList.add('hidden')});
$('saveDiscord').onclick=async()=>{const url=$('discordEdit').value.trim();if(url&&!/^https:///i.test(url)){alert('Informe um link seguro do Discord começando com https://.');return}try{const d=await api('/api/settings',{discordUrl:url});renderState(d.state);alert('Link do Discord salvo.')}catch(e){alert(e.message)}};
$('saveProgram').onclick=async()=>{const djName=$('djEdit').value.trim()||$('djInput').value.trim();const program=$('programEdit').value.trim()||$('programInput').value.trim();$('djInput').value=djName;$('programInput').value=program;try{const d=await api('/api/broadcast',{live:currentState.live,djName,program});renderState(d.state);alert('Programação atualizada.')}catch(e){alert(e.message)}};
function buildCarouselEditors(slides=[]){const root=$('carouselEditors');root.innerHTML='';for(let i=0;i<3;i++){const s=slides[i]||{title:'',subtitle:'',imageUrl:''};const wrap=document.createElement('div');wrap.className='carousel-editor';wrap.innerHTML=<h4>Slide ${i+1}</h4><label class="field-label">Título</label><input data-slide-title="${i}" maxlength="100"><label class="field-label">Frase</label><input data-slide-sub="${i}" maxlength="200"><label class="field-label">Imagem do banner</label><input data-slide-file="${i}" type="file" accept="image/*"><small class="tiny muted" data-slide-file-name="${i}">${s.imageUrl?'Imagem atual salva':'Nenhuma imagem selecionada'}</small><img data-slide-preview="${i}" class="carousel-preview ${s.imageUrl?'':'hidden'}" alt="Prévia do banner ${i+1}">;root.appendChild(wrap);wrap.querySelector('[data-slide-title]').value=s.title||'';wrap.querySelector('[data-slide-sub]').value=s.subtitle||'';const preview=wrap.querySelector('[data-slide-preview]');if(s.imageUrl)preview.src=s.imageUrl;wrap.querySelector([data-slide-file="${i}"]).onchange=e=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith('image/')){notify('Escolha um arquivo de imagem.','error');e.target.value='';return}if(f.size>210241024){notify('A imagem deve ter no máximo 2 MB.','error');e.target.value='';return}wrap.querySelector([data-slide-file-name="${i}"]).textContent=f.name;const url=URL.createObjectURL(f);preview.src=url;preview.classList.remove('hidden')}}}
function renderCarousel(slides){if(!slides||!slides.length)return;const slide=slides[carouselIndex%slides.length];if(!slide)return;const h=document.querySelector('.hero h1');if(h){h.innerHTML='';const a=document.createElement('span');a.textContent=slide.title||'GAZETA FM';const b=document.createElement('span');b.textContent='NACIONAL';h.append(a,b);}const sub=document.querySelector('.hero-sub');if(sub)sub.textContent=slide.subtitle||'A trilha sonora da sua conexão.';const art=document.querySelector('.hero-art');if(art){art.style.backgroundImage=slide.imageUrl?linear-gradient(90deg,#210b35aa,#210b3540),url("${slide.imageUrl.replace(/"/g,'')}"):'';art.style.backgroundSize='cover';art.style.backgroundPosition='center'}}
function fileAsDataUrl(file){
return new Promise((resolve,reject)=>{
const reader=new FileReader();
reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));
reader.onload=()=>{
const img=new Image();
img.onerror=()=>reject(new Error('A imagem escolhida não pôde ser aberta.'));
img.onload=()=>{
const maxW=1400,maxH=900,scale=Math.min(1,maxW/img.width,maxH/img.height);
const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.widthscale));canvas.height=Math.max(1,Math.round(img.heightscale));
const ctx=canvas.getContext('2d');ctx.fillStyle='#241039';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
let quality=.82,data=canvas.toDataURL('image/jpeg',quality);
while(data.length>1200000&&quality>.45){quality-=.08;data=canvas.toDataURL('image/jpeg',quality)}
if(data.length>1800000) return reject(new Error('A imagem ficou muito grande mesmo após a otimização. Escolha outra imagem.'));
resolve(data);
};
img.src=String(reader.result);
};
reader.readAsDataURL(file);
});
}
$('saveCarousel').onclick=async()=>{const carousel=[];try{for(let i=0;i<3;i++){const existing=currentState.settings?.carousel?.[i]||{};const inputEl=document.querySelector([data-slide-file="${i}"]);const file=inputEl&&inputEl.files?inputEl.files[0]:null;const imageUrl=file?await fileAsDataUrl(file):(existing.imageUrl||'');const titleInput=document.querySelector([data-slide-title="${i}"]);const subInput=document.querySelector([data-slide-sub="${i}"]);carousel.push({title:titleInput?titleInput.value:'',subtitle:subInput?subInput.value:'',imageUrl})}const d=await api('/api/settings',{carousel});renderState(d.state);notify('Carrossel salvo! As imagens já aparecem no site.')}catch(e){notify(e.message||'Não foi possível salvar o carrossel.','error')}};
function initMeters(stream){try{audioContext=new (window.AudioContext||window.webkitAudioContext)();const source=audioContext.createMediaStreamSource(stream);analyser=audioContext.createAnalyser();analyser.fftSize=256;source.connect(analyser);const data=new Uint8Array(analyser.frequencyBinCount);clearInterval(meterTimer);meterTimer=setInterval(()=>{if(!analyser)return;analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const x=(v-128)/128;sum+=x*x}const level=Math.min(100,Math.sqrt(sum/data.length)*260);$('voiceMeter').style.width=level+'%';$('audioMeter').style.width=$('musicReturn').checked?level+'%':'0%';$('effectMeter').style.width=currentAudio&&!currentAudio.paused?Math.max(8,level)+'%':'0%';$('sensorStatus').textContent=level>3?'Som detectado no microfone.':'Microfone ativo; aguardando som.'},100)}catch{}}
$('micOpen').onclick=async()=>{try{micStream=await navigator.mediaDevices.getUserMedia({audio:true});$('localMicAudio').srcObject=micStream;$('localMicAudio').classList.remove('hidden');$('micStatus').textContent='Microfone aberto neste navegador.';initMeters(micStream);$('localMicAudio').muted=!$('voiceReturn').checked}catch(e){$('micStatus').textContent='Não foi possível acessar o microfone: '+e.message}};
$('voiceReturn').onchange=()=>{$('localMicAudio').muted=!$('voiceReturn').checked};$('musicReturn').onchange=()=>{if(currentAudio)currentAudio.muted=!$('musicReturn').checked};
const slides=[['GAZETA FM','NACIONAL','A trilha sonora da sua conexão.'],['SINTONIZE','SEU MOMENTO','Música, companhia e informação.'],['VOCÊ ESTÁ','NA GAZETA','Sua rádio, sua comunidade.']];
document.querySelectorAll('.dot').forEach(dot=>dot.onclick=()=>{carouselIndex=Number(dot.dataset.slide);document.querySelectorAll('.dot').forEach(d=>d.classList.toggle('active',d===dot));renderCarousel(currentState.settings?.carousel||[])});setInterval(()=>{const ss=currentState.settings?.carousel||[];if(ss.length>1){carouselIndex=(carouselIndex+1)%Math.min(3,ss.length);document.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('active',i===carouselIndex));renderCarousel(ss)}},5000);

### 📥 Link direto para baixar o arquivo limpo:
Para evitar qualquer bug de cópia do celular de novo, você pode baixar o arquivo limpo e sem cortes direto por aqui:
👉 **[Baixar app.js corrigido em texto limpo](https://githubusercontent.com)**

<FollowUp>
Substitua o código atual no GitHub por este acima. Assim que salvar e o Render atualizar o site (leva cerca de 2 minutos), volte no seu painel. Me avise se o carrossel finalmente **gravou com sucesso e salvou a sua imagem**!
</FollowUp>
