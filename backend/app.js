import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, credentials, validateWatch } from './domain.js';
import { hashPassword, verifyPassword, hashToken, newToken, readToken, sessionCookie } from './security.js';
import { NotificationService } from './notifications.js';
import { MarketService } from './service.js';
import { BrowserCollector } from './browser-collector.js';

const frontendDist=fileURLToPath(new URL('../frontend/dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
async function body(req) {
  const contentType=(req.headers['content-type'] || '').split(';')[0];
  if(contentType !== 'application/json') throw new AppError(415,'Envie conteúdo JSON.');
  let data='',size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>262144) throw new AppError(413,'Solicitação muito grande.'); data+=chunk; }
  try { const value=JSON.parse(data); if(!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value; }
  catch { throw new AppError(400,'JSON inválido.'); }
}
function json(res,status,value) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }

export function createApp(repo,config,adapters) {
  const notifications=new NotificationService(repo,config,adapters), service=new MarketService(repo,notifications);
  const collector=new BrowserCollector(repo,notifications);
  const attempts=new Map();
  const dummyHashPromise=hashPassword('dummy password timing protection');
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    try {
      const url=new URL(req.url,'http://localhost'),path=url.pathname;
      const origin=req.headers.origin;
      const allowedOrigin=config.origin;
      if(path.startsWith('/api/browser/')) {
        // Extension-only bearer scope, deliberately separate from browser cookies.
        if(origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))throw new AppError(403,'Origem da extensão inválida.');
        if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
        if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type, Authorization'});return res.end();}
        const authorization=req.headers.authorization||'';
        if(!authorization.startsWith('Bearer '))throw new AppError(401,'Chave de conexão necessária.');
        const owner=collector.user(authorization.slice(7));
        if(path==='/api/browser/jobs'&&req.method==='GET')return json(res,200,collector.jobs(owner));
        if(path==='/api/browser/readings'&&req.method==='POST') {
          const result=collector.receive(owner,await body(req));json(res,200,result);
          void notifications.drain().catch(()=>console.error('Falha na fila.'));return;
        }
        throw new AppError(404,'Recurso não encontrado.');
      }
      if(origin && origin !== allowedOrigin) throw new AppError(403,'Origem não autorizada.');
      if(origin) { res.setHeader('Access-Control-Allow-Origin',allowedOrigin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Credentials','true'); }
      if(req.method==='OPTIONS') { res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}); return res.end(); }
      if(['POST','PATCH'].includes(req.method) && req.headers['sec-fetch-site']==='cross-site') throw new AppError(403,'Solicitação entre sites não autorizada.');
      if(path==='/api/health' && req.method==='GET') return json(res,200,{status:'ok',source:'manual'});
      if(['/api/auth/register','/api/auth/login'].includes(path) && req.method==='POST') {
        const key=req.socket.remoteAddress,now=Date.now();
        for(const [ip,entry] of attempts) if(entry.until<=now) attempts.delete(ip);
        const entry=attempts.get(key) || {count:0,until:now+15*60*1000};
        if(entry.count>=20) { res.setHeader('Retry-After',Math.ceil((entry.until-now)/1000)); throw new AppError(429,'Muitas tentativas. Aguarde 15 minutos.'); }
        entry.count++; attempts.set(key,entry);
        const input=credentials(await body(req));
        let user=repo.userByEmail(input.email);
        if(path.endsWith('register')) {
          if(user) throw new AppError(409,'Não foi possível cadastrar este email.');
          const hash=await hashPassword(input.password);
          // Recheck after async hashing to handle concurrent registrations.
          if(repo.userByEmail(input.email)) throw new AppError(409,'Não foi possível cadastrar este email.');
          user=repo.createUser(input.email,hash);
        } else if(!await verifyPassword(input.password,user?.password_hash || await dummyHashPromise) || !user) {
          throw new AppError(401,'Email ou senha incorretos.');
        }
        const oldToken=readToken(req); if(oldToken) repo.deleteSession(hashToken(oldToken));
        const token=newToken(); repo.createSession(hashToken(token),user.id,new Date(Date.now()+config.sessionHours*3600000).toISOString());
        res.setHeader('Set-Cookie',sessionCookie(token,config));
        return json(res,path.endsWith('register')?201:200,{id:user.id,email:user.email});
      }
      if(path.startsWith('/api/')) {
        const session=repo.session(hashToken(readToken(req))),user=session && repo.userById(session.user_id);
        if(!user) throw new AppError(401,'Faça login para continuar.');
        if(path==='/api/auth/me' && req.method==='GET') return json(res,200,user);
        if(path==='/api/collector'&&req.method==='GET')return json(res,200,collector.status(user));
        if(path==='/api/collector/pair'&&req.method==='POST'){await body(req);return json(res,201,collector.pair(user));}
        if(path==='/api/collector/revoke'&&req.method==='POST'){await body(req);collector.revoke(user);return json(res,200,{ok:true});}
        if(path==='/api/auth/logout' && req.method==='POST') {
          await body(req); repo.deleteSession(hashToken(readToken(req))); res.setHeader('Set-Cookie',sessionCookie('',config,true)); return json(res,200,{ok:true});
        }
        if(path==='/api/dashboard' && req.method==='GET') return json(res,200,service.dashboard(user));
        if(path==='/api/watches' && req.method==='GET') return json(res,200,repo.watches(user.id));
        if(path==='/api/watches' && req.method==='POST') return json(res,201,service.createWatch(user,await body(req)));
        const history=path.match(/^\/api\/watches\/(\d+)\/history$/);
        if(history && req.method==='GET') return json(res,200,service.history(user,Number(history[1])));
        const watch=path.match(/^\/api\/watches\/(\d+)$/);
        if(watch && req.method==='PATCH') {
          const id=Number(watch[1]),input=await body(req);
          const existing=repo.watch(user.id,id);
          if(!existing) throw new AppError(404,'Item não encontrado.');
          if(Object.hasOwn(input,'target_price'))return json(res,200,repo.setTarget(user.id,id,validateWatch({...existing,target_price:input.target_price}).target_price));
          if(typeof input.active !== 'boolean') throw new AppError(422,'Informe active como verdadeiro ou falso.');
          if(!repo.watch(user.id,id)) throw new AppError(404,'Item não encontrado.');
          return json(res,200,repo.toggleWatch(user.id,id,input.active));
        }
        if(path==='/api/observations' && req.method==='GET') return json(res,200,repo.observations(user.id).reverse());
        if(path==='/api/observations' && req.method==='POST') {
          const result=service.record(user,await body(req)); json(res,result.duplicate?200:201,result);
          void notifications.drain().catch(()=>console.error('Falha ao processar fila de notificações.')); return;
        }
        if(path==='/api/alerts' && req.method==='GET') return json(res,200,repo.alerts(user.id));
        if(path==='/api/settings' && req.method==='GET') return json(res,200,{source:'manual',notificationsEnabled:config.notificationsEnabled,channels:notifications.adapters.map(a=>({name:a.channel,enabled:config.notificationsEnabled && config.notificationOwner===user.email && a.configured()}))});
        throw new AppError(404,'Recurso não encontrado.');
      }
      if(req.method!=='GET' && req.method!=='HEAD') throw new AppError(405,'Método não permitido.');
      const decoded=decodeURIComponent(path),file=resolve(frontendDist,`.${decoded}`);
      if(file !== resolve(frontendDist) && !file.startsWith(frontendDist.endsWith(sep)?frontendDist:frontendDist+sep)) throw new AppError(404,'Página não encontrada.');
      let target=file;
      try { if(!(await stat(target)).isFile()) target=resolve(frontendDist,'index.html'); }
      catch { target=resolve(frontendDist,'index.html'); }
      let content;
      try { content=await readFile(target); } catch { throw new AppError(503,'Interface não compilada. Execute npm run build ou use npm run dev:ui.'); }
      res.writeHead(200,{'Content-Type':mime[extname(target)] || 'application/octet-stream','Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:content);
    } catch(error) {
      if(!error.status) console.error('Erro interno:',error.code || error.name);
      if(!res.headersSent) json(res,error.status || 500,{error:error.status?error.message:'Erro interno. Tente novamente.'});
      else res.end();
    }
  });
  server.requestTimeout=15000;
  return {server,service,notifications};
}
