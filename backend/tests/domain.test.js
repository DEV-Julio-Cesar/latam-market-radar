import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { matches,hitsTarget,statistics,validateObservation,validateWatch,credentials } from '../domain.js';
const watch={name:'Carta Raydric',item_id:null,server:'Freya',refine:null,alert_type:'compra',target_price:15000000};
const observation={...watch,price:15000000,quantity:1,observed_at:new Date().toISOString(),request_id:randomUUID()};
test('compra e venda incluem igualdade e usam limites opostos',()=>{
  assert.equal(hitsTarget(watch,observation),true);
  assert.equal(hitsTarget(watch,{...observation,price:15000001}),false);
  assert.equal(hitsTarget({...watch,alert_type:'venda'},{...observation,price:15000001}),true);
  assert.equal(hitsTarget({...watch,alert_type:'venda'},{...observation,price:14999999}),false);
});
test('identidade: normalização, ID, servidor, refino exato e refino livre',()=>{
  assert.equal(matches(watch,{...observation,name:'  CARTA   RAYDRIC ',server:'freya',refine:7}),true);
  assert.equal(matches({...watch,item_id:4133},observation),false);
  assert.equal(matches({...watch,item_id:4133},{...observation,item_id:4133,name:'Outro alias'}),true);
  assert.equal(matches({...watch,refine:0},{...observation,refine:null}),false);
  assert.equal(matches({...watch,refine:7},{...observation,refine:7}),true);
  assert.equal(matches(watch,{...observation,server:'Outro'}),false);
});
test('estatística respeita ordem temporal e mediana par, ímpar e vazia',()=>{
  const samples=[{id:3,price:50,observed_at:'2026-01-03'},{id:1,price:100,observed_at:'2026-01-01'},{id:2,price:200,observed_at:'2026-01-02'}];
  assert.deepEqual(statistics(samples),{count:3,mean:350/3,median:100,min:50,max:200,variation:-50,last:50});
  assert.equal(statistics(samples.slice(0,2)).median,75);
  assert.equal(statistics([]).mean,null);
  assert.equal(statistics([samples[0]]).variation,0);
});
test('validação rejeita valores negativos, fracionários, enormes, datas futuras e sem fuso',()=>{
  for(const price of [-1,0,1.5,1e13,'123']) assert.throws(()=>validateObservation({...observation,price}));
  assert.throws(()=>validateObservation({...observation,observed_at:'2020-01-01T12:00:00'}));
  assert.throws(()=>validateObservation({...observation,observed_at:new Date(Date.now()+86400000).toISOString()}));
  assert.throws(()=>validateObservation({...observation,request_id:'invalid'}));
  assert.throws(()=>validateWatch({...watch,refine:21}));
  assert.throws(()=>validateWatch({...watch,alert_type:'unknown'}));
  assert.equal(validateObservation(observation).price,15000000);
  assert.equal(credentials({email:'USER@example.com',password:'longpassword'}).email,'user@example.com');
});

test('meta opcional em compra e venda não gera alerta; zero continua inválido',()=>{
 for(const alert_type of ['compra','venda'])for(const target_price of [null,undefined,'']){
   const w=validateWatch({...watch,alert_type,target_price});assert.equal(w.target_price,null);assert.equal(hitsTarget(w,observation),false);
 }
 assert.throws(()=>validateWatch({...watch,target_price:0}));
});

test('grau é independente do refino e desconhecido não corresponde a sem grau',()=>{
 assert.equal(validateWatch({...watch,grade:'A'}).grade,'A');
 assert.throws(()=>validateWatch({...watch,grade:'S'}));
 assert.equal(matches({...watch,grade:'A'},{...observation,grade:'B'}),false);
 assert.equal(matches({...watch,grade:'A'},{...observation,grade:'A'}),true);
 assert.equal(matches({...watch,grade:'none'},observation),false);
 assert.equal(matches({...watch,grade:null},{...observation,grade:'A'}),true);
 assert.equal(hitsTarget({...watch,grade:'A'},{...observation,grade:'B'}),false);
});
