const base='http://127.0.0.1:3001';
let busy=false;
const INTERVAL=300000;
async function permit() {
  const state=await chrome.storage.local.get('requestTimes');
  const times=(state.requestTimes||[]).filter(t=>t>Date.now()-900000);
  if(times.length>=30||(times.length&&Date.now()-times.at(-1)<5000))return false;
  await chrome.storage.local.set({requestTimes:[...times,Date.now()]});return true;
}
async function api(path,body) {
  const {token}=await chrome.storage.local.get('token');
  if(!token)throw Error('Cole a chave gerada no Radar.');
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Falha na conexão local.');return data;
}
async function pause(message) {await chrome.storage.local.set({running:false,job:null,message});await chrome.alarms.clear('radar');}
async function tick() {
  if(busy)return;busy=true;
  try {
    const state=await chrome.storage.local.get(['running','lastRequest','lastChecked','tabId','job']);
    if(!state.running)return;
    if(state.job){if(Date.now()-(state.job.startedAt||state.lastRequest||0)>180000)await pause('Leitura excedeu 3 minutos. Verifique a aba e reinicie.');return;}
    const {jobs,skipped}=await api('/api/browser/jobs');
    if(!jobs.length){await chrome.storage.local.set({message:`Nenhum monitoramento compatível. ${skipped} ignorado(s): use nome sem ID/refino.`});return;}
    const checked=state.lastChecked||{};
    const due=jobs.filter(j=>Date.now()-(checked[j.id]||0)>=INTERVAL).sort((a,b)=>(checked[a.id]||0)-(checked[b.id]||0));
    if(!due.length)return;
    if(!await permit()){await chrome.storage.local.set({message:'Aguardando limite de consultas; intervalo pode exceder 5 minutos.'});return;}
    const job={...due[0],startedAt:Date.now(),runId:`${Date.now()}-${Math.random()}`,maxPages:5};
    const url=new URL('https://ro.gnjoyamericas.com/pt/intro/shop-search/trading');
    url.search=new URLSearchParams({storeType:'SELL',serverType:job.server.toUpperCase(),searchWord:job.name}).toString();
    await chrome.storage.local.set({job,lastRequest:Date.now(),lastChecked:{...checked,[job.id]:Date.now()},message:`Lendo ${job.name}, até 5 páginas. Meta: 5 minutos por item. ${skipped} ignorado(s).`});
    let tab;
    if(state.tabId) {
      try {tab=await chrome.tabs.get(state.tabId);} catch {await pause('A aba do mercado foi fechada. Clique Iniciar para abrir outra.');await chrome.storage.local.remove('tabId');return;}
      if(!tab.url?.startsWith('https://ro.gnjoyamericas.com/')){await pause('A aba foi usada para outra página. Reinicie para abrir uma aba dedicada.');await chrome.storage.local.remove('tabId');return;}
      if(tab.url===String(url))await chrome.tabs.reload(state.tabId);
      else await chrome.tabs.update(state.tabId,{url:String(url)});
    } else {
      // Bind the tab before loading: even a fast cached page must find its job.
      tab=await chrome.tabs.create({url:'about:blank',active:true});
      await chrome.storage.local.set({tabId:tab.id});
      await chrome.tabs.update(tab.id,{url:String(url)});
    }
  }catch(error){await pause(error.message);}finally{busy=false;}
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='radar')void tick();});
chrome.runtime.onStartup.addListener(()=>{void pause('Navegador reiniciado. Inicie novamente quando estiver pronto.');});
chrome.runtime.onInstalled?.addListener(()=>{void pause('Extensão atualizada. Clique Iniciar para ativar esta versão.');});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  (async()=>{
    if(message.type==='current-job') {
      const state=await chrome.storage.local.get(['job','tabId','running']);
      return {job:state.running&&sender.tab?.id===state.tabId?state.job:null};
    }
    if(message.type==='page-permit') {
      const state=await chrome.storage.local.get(['job','tabId','running']);
      if(!state.running||sender.tab?.id!==state.tabId||message.runId!==state.job?.runId)return {allowed:false};
      return {allowed:await permit()};
    }
    if(message.type==='reading') {
      const state=await chrome.storage.local.get(['job','tabId','running']);
      if(!state.running||sender.tab?.id!==state.tabId||state.job?.id!==message.jobId||state.job.runId!==message.runId)return {ignored:true};
      const result=await api('/api/browser/readings',{...message,watch_id:state.job.id,reader_version:chrome.runtime.getManifest().version});
      await chrome.storage.local.set({job:null,message:message.status==='ok'?`${state.job.name}: ${message.pages_read} página(s), ${message.partial?'cobertura parcial':'fim da paginação'}. ${result.imported} novo preço. Consultas automáticas ativas.`:'Nenhuma oferta exata nas páginas lidas. Consultas automáticas ativas.'});
      if(['blocked','error'].includes(message.status))await pause('Pausado: bloqueio, verificação ou página não reconhecida. Nenhuma tentativa de contorno será feita.');
      return result;
    }
    if(sender.tab||sender.url!==chrome.runtime.getURL('popup.html'))throw Error('Comando não autorizado.');
    if(message.type==='start') {
      await chrome.storage.local.set({token:message.token});await api('/api/browser/jobs');
      const current=await chrome.storage.local.get('running');
      if(!current.running)await chrome.storage.local.set({running:true,job:null});
      await chrome.alarms.create('radar',{periodInMinutes:0.5,delayInMinutes:0.5});await tick();return {ok:true};
    }
    if(message.type==='stop'){await pause('Pausado por você.');return {ok:true};}
    return {error:'Comando inválido.'};
  })().then(reply).catch(async error=>{await pause(error.message);reply({error:error.message});});
  return true;
});
