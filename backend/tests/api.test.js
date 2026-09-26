import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../db.js';
import { SqliteRepository } from '../repository.js';
import { createApp } from '../app.js';
import { configFromEnv } from '../config.js';
import { DiscordAdapter,WhatsAppAdapter,NotificationService } from '../notifications.js';
import { MarketService } from '../service.js';

async function setup(t,overrides={}) {
  const db=openDatabase(':memory:'),repo=new SqliteRepository(db),config={...configFromEnv({}),...overrides};
  const app=createApp(repo,config);
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));db.close();});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,{method='GET',body,cookie='',headers={}}={}) {
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  }
  return {...app,db,repo,request};
}
const credentials={email:'person@example.com',password:'Seguro12345!'};
const watch={name:'Carta Raydric',item_id:4133,server:'Freya',refine:null,alert_type:'compra',target_price:15000000};
const observation=(extra={})=>({...watch,price:14900000,quantity:1,observed_at:new Date().toISOString(),request_id:randomUUID(),...extra});

test('API cria e edita metas opcionais com isolamento entre contas',async t=>{
  const {request}=await setup(t);
  const a=await request('/api/auth/register',{method:'POST',body:credentials});
  const b=await request('/api/auth/register',{method:'POST',body:{...credentials,email:'other@example.com'}});
  for(const alert_type of ['compra','venda']){
    const w=await request('/api/watches',{method:'POST',cookie:a.cookie,body:{...watch,alert_type,target_price:null}});
    assert.equal(w.status,201);assert.equal(w.data.target_price,null);
    const path=`/api/watches/${w.data.id}`;
    assert.equal((await request(path,{method:'PATCH',cookie:b.cookie,body:{target_price:100}})).status,404);
    assert.equal((await request(path,{method:'PATCH',cookie:a.cookie,body:{target_price:100}})).data.target_price,100);
    assert.equal((await request(path,{method:'PATCH',cookie:a.cookie,body:{target_price:null}})).data.target_price,null);
    assert.equal((await request(path,{method:'PATCH',cookie:a.cookie,body:{target_price:0}})).status,422);
  }
});

test('extensão usa token próprio e não aceita cookies ou origem web na importação',async t=>{
  const {request}=await setup(t);
  const login=await request('/api/auth/register',{method:'POST',body:credentials});
  const cookie=login.cookie;
  const pair=await request('/api/collector/pair',{method:'POST',body:{},cookie});
  assert.equal(pair.status,201);
  const headers={Authorization:`Bearer ${pair.data.token}`,Origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
  const w=await request('/api/watches',{method:'POST',cookie,body:{...watch,item_id:null}});
  assert.equal((await request('/api/browser/jobs',{headers})).data.jobs.length,1);
  assert.equal((await request('/api/browser/jobs',{cookie})).status,401);
  assert.equal((await request('/api/browser/jobs',{headers:{...headers,Origin:'https://attacker.example'}})).status,403);
  const reading=await request('/api/browser/readings',{method:'POST',headers,body:{watch_id:w.data.id,status:'ok',name:watch.name,price:100,quantity:1,observed_at:new Date().toISOString()}});
  assert.equal(reading.status,200);assert.equal(reading.data.imported,1);
  await request('/api/collector/revoke',{method:'POST',cookie,body:{}});
  assert.equal((await request('/api/browser/jobs',{headers})).status,401);
});

test('fluxo completo: cadastro, cookie, observação, histórico, alertas, idempotência e logout',async t=>{
  const {request,repo}=await setup(t);
  assert.equal((await request('/api/dashboard')).status,401);
  const registered=await request('/api/auth/register',{method:'POST',body:credentials});
  assert.equal(registered.status,201);
  assert.match(registered.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal(registered.data.password_hash,undefined);
  assert.notEqual(repo.userByEmail(credentials.email).password_hash,credentials.password);
  const cookie=registered.cookie;
  assert.equal((await request('/api/auth/me',{cookie})).data.email,credentials.email);
  const w=await request('/api/watches',{method:'POST',body:watch,cookie});
  assert.equal(w.status,201);
  const input=observation();
  const recorded=await request('/api/observations',{method:'POST',body:input,cookie});
  assert.equal(recorded.status,201);assert.equal(recorded.data.alerts.length,1);
  const retry=await request('/api/observations',{method:'POST',body:input,cookie});
  assert.equal(retry.status,200);assert.equal(retry.data.duplicate,true);
  assert.equal((await request('/api/observations',{method:'POST',body:{...input,price:1},cookie})).status,409);
  const history=await request(`/api/watches/${w.data.id}/history`,{cookie});
  assert.equal(history.data.stats.mean,14900000);assert.equal(history.data.observations.length,1);
  const alerts=(await request('/api/alerts',{cookie})).data;
  assert.equal(alerts.length,1);assert.equal(alerts[0].deliveries.length,2);assert.equal(alerts[0].deliveries[0].status,'disabled');
  const dashboard=(await request('/api/dashboard',{cookie})).data;
  assert.equal(dashboard.alertCount,1);assert.equal(dashboard.observationCount,1);
  await request(`/api/watches/${w.data.id}`,{method:'PATCH',body:{active:false},cookie});
  const paused=await request('/api/observations',{method:'POST',body:observation(),cookie});
  assert.equal(paused.data.alerts.length,0);
  await request('/api/auth/logout',{method:'POST',body:{},cookie});
  assert.equal((await request('/api/auth/me',{cookie})).status,401);
  assert.equal((await request('/api/auth/login',{method:'POST',body:credentials})).status,200);
});
test('contas não acessam histórico, alterações ou dados de outras contas',async t=>{
  const {request}=await setup(t);
  const a=await request('/api/auth/register',{method:'POST',body:credentials});
  const w=await request('/api/watches',{method:'POST',body:watch,cookie:a.cookie});
  await request('/api/observations',{method:'POST',body:observation(),cookie:a.cookie});
  const b=await request('/api/auth/register',{method:'POST',body:{...credentials,email:'other@example.com'}});
  assert.deepEqual((await request('/api/watches',{cookie:b.cookie})).data,[]);
  assert.deepEqual((await request('/api/observations',{cookie:b.cookie})).data,[]);
  assert.deepEqual((await request('/api/alerts',{cookie:b.cookie})).data,[]);
  assert.equal((await request(`/api/watches/${w.data.id}/history`,{cookie:b.cookie})).status,404);
  assert.equal((await request(`/api/watches/${w.data.id}`,{method:'PATCH',body:{active:false},cookie:b.cookie})).status,404);
});
test('segurança de autenticação, origem, validação e cookie seguro',async t=>{
  const {request}=await setup(t,{cookieSecure:true});
  const a=await request('/api/auth/register',{method:'POST',body:credentials});
  assert.match(a.headers.get('set-cookie'),/Secure/);
  assert.equal((await request('/api/auth/register',{method:'POST',body:credentials})).status,409);
  assert.equal((await request('/api/auth/login',{method:'POST',body:{...credentials,password:'incorrect password'}})).status,401);
  assert.equal((await request('/api/auth/login',{method:'POST',body:credentials,headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal((await request('/api/watches',{method:'POST',body:{...watch,target_price:-1},cookie:a.cookie})).status,422);
  assert.equal((await request('/api/observations',{method:'POST',body:observation({quantity:0}),cookie:a.cookie})).status,422);
});
test('limite de tentativas de login',async t=>{
  const {request}=await setup(t);
  for(let i=0;i<20;i++) await request('/api/auth/login',{method:'POST',body:{email:'invalid',password:'short'}});
  assert.equal((await request('/api/auth/login',{method:'POST',body:credentials})).status,429);
});
test('fila durável registra sucesso e falha; não envia destinos de outra conta',async()=>{
  const db=openDatabase(':memory:'),repo=new SqliteRepository(db);
  try {
    const user=repo.createUser('owner@example.com','unused');let sends=0;
    const adapters=[{channel:'discord',configured:()=>true,send:async()=>{sends++;}},{channel:'whatsapp',configured:()=>true,send:async()=>{throw new Error('private token must not leak');}}];
    const notifications=new NotificationService(repo,{notificationsEnabled:true,notificationOwner:user.email},adapters);
    const service=new MarketService(repo,notifications);service.createWatch(user,watch);service.record(user,observation());
    assert.equal(repo.pendingDeliveries().length,2);
    await notifications.drain();await notifications.drain();
    assert.equal(sends,1);
    const deliveries=repo.alerts(user.id)[0].deliveries;
    assert.equal(deliveries[0].status,'sent');assert.equal(deliveries[1].status,'failed');
    assert.ok(!deliveries[1].detail.includes('private token'));
    const other=repo.createUser('other@example.com','unused');service.createWatch(other,watch);service.record(other,observation());await notifications.drain();
    assert.equal(sends,1);assert.equal(repo.alerts(other.id)[0].deliveries[0].status,'disabled');
  } finally {db.close();}
});
test('falha de persistência reverte observação e alerta juntos',()=>{
  const db=openDatabase(':memory:'),repo=new SqliteRepository(db);
  try {
    const user=repo.createUser('owner@example.com','unused');repo.createWatch(user.id,watch);
    const service=new MarketService(repo,{enqueue(){throw new Error('failure');}});
    assert.throws(()=>service.record(user,observation()));
    assert.equal(repo.observations(user.id).length,0);assert.equal(repo.alerts(user.id).length,0);
  }finally{db.close();}
});
test('adaptadores constroem payloads corretos sem rede real',async()=>{
  const calls=[],transport=async(url,options)=>{calls.push({url:String(url),options,body:JSON.parse(options.body)});return {ok:true};};
  const config={discordWebhook:'https://discord.com/api/webhooks/123/token',whatsappToken:'secret',whatsappPhone:'123',whatsappRecipient:'5511999999999',whatsappVersion:'v23.0',whatsappTemplate:'market_alert',whatsappLanguage:'pt_BR'};
  await new DiscordAdapter(config,transport).send('Item no alvo');
  await new WhatsAppAdapter(config,transport).send('Item no alvo');
  assert.deepEqual(calls[0].body.allowed_mentions,{parse:[]});
  assert.equal(calls[1].body.type,'template');assert.equal(calls[1].body.template.components[0].parameters[0].text,'Item no alvo');
  assert.equal(calls[1].options.headers.Authorization,'Bearer secret');
  await assert.rejects(()=>new DiscordAdapter({...config,discordWebhook:'http://localhost/private'},transport).send('x'));
});

test('Discord pessoal isola destinos, oculta credenciais e cancela pendências ao remover',async t=>{
 const {request,repo,notifications}=await setup(t);
 const a=await request('/api/auth/register',{method:'POST',body:credentials});
 const b=await request('/api/auth/register',{method:'POST',body:{...credentials,email:'friend@example.com'}});
 const destinationA='https://discord.com/api/webhooks/111/test_A',destinationB='https://discord.com/api/webhooks/222/test_B';
 assert.equal((await request('/api/settings/discord',{method:'POST',cookie:a.cookie,body:{webhook:'https://example.com/api/webhooks/1/x',enabled:true}})).status,422);
 for(const [cookie,webhook] of [[a.cookie,destinationA],[b.cookie,destinationB]])assert.equal((await request('/api/settings/discord',{method:'POST',cookie,body:{webhook,enabled:true}})).status,200);
 const settings=await request('/api/settings',{cookie:a.cookie});assert.equal(settings.data.discord.enabled,true);assert.equal(JSON.stringify(settings.data).includes('test_A'),false);assert.equal(JSON.stringify(settings.data).includes('test_B'),false);
 const calls=[];notifications.discordTransport=async url=>{calls.push(String(url));return{ok:true};};
 const wa=repo.createWatch(a.data.id,watch),wb=repo.createWatch(b.data.id,watch);
 const oa=repo.createObservation(a.data.id,observation(),'manual'),ob=repo.createObservation(b.data.id,observation(),'manual');
 notifications.enqueue(repo.createAlert(a.data.id,wa,oa),a.data);notifications.enqueue(repo.createAlert(b.data.id,wb,ob),b.data);
 await notifications.drain();assert.deepEqual(calls,[destinationA,destinationB]);
 const oa2=repo.createObservation(a.data.id,observation(),'manual');notifications.enqueue(repo.createAlert(a.data.id,wa,oa2),a.data);
 await request('/api/settings/discord',{method:'POST',cookie:a.cookie,body:{remove:true,enabled:false}});
 await notifications.drain();assert.equal(calls.length,2);assert.equal(repo.discord(a.data.id).webhook,null);assert.equal(repo.discord(b.data.id).webhook,destinationB);
 assert.equal((await request('/api/settings/discord',{method:'POST',body:{enabled:false}})).status,401);
});
