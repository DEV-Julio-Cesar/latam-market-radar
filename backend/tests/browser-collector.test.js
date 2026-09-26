import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../db.js';
import {SqliteRepository} from '../repository.js';
import {BrowserCollector} from '../browser-collector.js';
import {NotificationService} from '../notifications.js';
import '../../extension/parser.js';
test('cartão Vale Varmida com rótulos quebrados preserva nome exato e preço',()=>{
  const text='Vale Varmida\n28.000\nNome do\nComércio\nVarmida 28k\nVendedor\nLoja\nTipo\nSELL\nQuantidade\n1812';
  assert.deepEqual(RadarParser.parseCard('Vale Varmida',text,'Vale Varmida'),{name:'Vale Varmida',price:28000,quantity:1812});
  assert.equal(RadarParser.parseCard('Vale Varmida',text,'Vale'),null);
  assert.match(text,/Nome\s+do\s+Comércio/);
});
test('parser diferencia nomes, lê preço e quantidade e detecta desafio',()=>{
  const text='Elunium\n6.999\nNome do Comércio ELUNIUM\nVendedor Loja\nTipo BUY Quantidade 390';
  assert.deepEqual(RadarParser.parseCard('Elunium',text,'Elunium'),{name:'Elunium',price:6999,quantity:390});
  assert.equal(RadarParser.parseCard('Elunium Perfeito',text,'Elunium'),null);
  assert.equal(RadarParser.parseCard('Elunium','Elunium Sem preço','Elunium'),null);
  assert.equal(RadarParser.blocked('Just a moment... Enable JavaScript and cookies'),true);
});
test('conexão é privada, revogável, deduplica e não importa vazio como zero',()=>{
  const db=openDatabase(':memory:'),repo=new SqliteRepository(db);
  try {
    const a=repo.createUser('a@example.com','unused'),b=repo.createUser('b@example.com','unused');
    const w=repo.createWatch(a.id,{name:'Elunium',item_id:null,server:'Freya',refine:null,alert_type:'compra',target_price:8000});
    repo.createWatch(a.id,{name:'Carta',item_id:4133,server:'Freya',refine:null,alert_type:'compra',target_price:8000});
    const collector=new BrowserCollector(repo,new NotificationService(repo,{notificationsEnabled:false},[]));
    const {token}=collector.pair(a);assert.equal(collector.user(token).id,a.id);
    assert.equal(collector.jobs(a).jobs.length,1);assert.equal(collector.jobs(a).skipped,1);
    const input={watch_id:w.id,status:'ok',name:'Elunium',price:6999,quantity:390,observed_at:new Date().toISOString()};
    assert.throws(()=>collector.receive(b,input));
    assert.equal(collector.receive(a,input).imported,1);
    assert.equal(collector.receive(a,input).imported,0);
    assert.equal(repo.alerts(a.id).length,1);
    assert.equal(repo.observations(a.id)[0].source,'browser');
    collector.receive(a,{watch_id:w.id,status:'empty'});assert.equal(repo.observations(a.id).length,1);
    assert.equal(collector.status(a).recent_reads[0].item_name,'Elunium');
    assert.equal(collector.status(a).recent_reads[0].status,'empty');
    assert.equal(collector.status(b).recent_reads.length,0);
    assert.throws(()=>collector.receive(a,{...input,name:'Elunium Perfeito'}));
    collector.revoke(a);assert.throws(()=>collector.user(token));
  }finally{db.close();}
});

test('lista preserva ofertas acima da meta, atualiza estoque e isola usuários',()=>{
 const db=openDatabase(':memory:'),repo=new SqliteRepository(db);
 try{
  const a=repo.createUser('offers@example.com','unused'),b=repo.createUser('other@example.com','unused');
  const w=repo.createWatch(a.id,{name:'Vale Varmida',item_id:null,server:'Freya',refine:null,alert_type:'venda',target_price:null});
  const collector=new BrowserCollector(repo,new NotificationService(repo,{notificationsEnabled:false},[]));
  const offers=[{name:w.name,price:28000,quantity:2,seller:'Loja A',shop:'Varmida'},{name:w.name,price:40000,quantity:9,seller:'Loja B',shop:'Ofertas'}];
  const input={watch_id:w.id,status:'ok',...offers[0],offers,observed_at:new Date().toISOString(),pages_read:2,partial:false};
  assert.equal(collector.receive(a,input).imported,1);assert.equal(repo.alerts(a.id).length,0);
  assert.equal(repo.offers(a.id,w.id).offers.length,2);assert.equal(repo.offers(b.id,w.id),null);
  offers[1].quantity=10;assert.equal(collector.receive(a,input).imported,0);assert.equal(repo.offers(a.id,w.id).offers[1].quantity,10);
  assert.throws(()=>collector.receive(a,{...input,offers:[{...offers[0],name:'Outro'}]}));
  assert.equal(repo.offers(a.id,w.id).offers.length,2);
  collector.receive(a,{watch_id:w.id,status:'blocked'});assert.equal(repo.offers(a.id,w.id).offers.length,2);
  repo.setTarget(a.id,w.id,31000);assert.equal(repo.watch(a.id,w.id).target_price,31000);
  repo.setTarget(a.id,w.id,null);assert.equal(repo.watch(a.id,w.id).target_price,null);
  collector.receive(a,{watch_id:w.id,status:'empty'});assert.equal(repo.offers(a.id,w.id).offers.length,0);
 }finally{db.close();}
});
