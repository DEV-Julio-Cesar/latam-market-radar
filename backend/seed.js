import { randomUUID } from 'node:crypto';
import { configFromEnv } from './config.js';
import { openDatabase } from './db.js';
import { SqliteRepository } from './repository.js';
import { hashPassword } from './security.js';
import { MarketService } from './service.js';
import { NotificationService } from './notifications.js';
const config=configFromEnv(),db=openDatabase(config.databasePath),repo=new SqliteRepository(db);
const email=(process.env.DEMO_EMAIL || 'demo@radar.local').toLowerCase(),password=process.env.DEMO_PASSWORD || 'RadarDemo!2026';
if(repo.userByEmail(email)) { console.log('Conta de demonstração já existe. Nenhum dado alterado.'); db.close(); }
else {
  // Seed can never send network notifications, even if production adapters are configured.
  const service=new MarketService(repo,new NotificationService(repo,{...config,notificationsEnabled:false}));
  const hash=await hashPassword(password);
  repo.transaction(()=>{
    const user=repo.createUser(email,hash);
    const items=[
      {name:'Carta Raydric',item_id:4133,server:'Freya',refine:null,alert_type:'compra',target_price:15000000,base:18400000},
      {name:'Elunium',item_id:985,server:'Freya',refine:null,alert_type:'compra',target_price:70000,base:87000},
      {name:'Arco Élfico',item_id:18109,server:'Freya',refine:7,alert_type:'venda',target_price:28000000,base:24200000},
      {name:'Carta Marc',item_id:4105,server:'Freya',refine:null,alert_type:'compra',target_price:9000000,base:11600000},
    ];
    items.forEach((item,index)=>{
      const watch=service.createWatch(user,item);
      for(let day=13;day>=0;day--) {
        const factor=1+(Math.sin(day*1.7+index)*0.065)-(13-day)*0.012;
        const price=day===0 && index===0 ? 14800000 : Math.round(item.base*factor/100)*100;
        const observation=repo.createObservation(user.id,{...item,price,quantity:index===1?50:1,observed_at:new Date(Date.now()-day*86400000).toISOString(),request_id:randomUUID()},'demo');
        if(day===0 && index===0) {
          const alert=repo.createAlert(user.id,watch,observation);
          service.notifications.enqueue(alert,user);
        }
      }
    });
  });
  console.log(`Demonstração criada: ${email}. Use a senha DEMO_PASSWORD do .env.example. Preços fictícios.`); db.close();
}
