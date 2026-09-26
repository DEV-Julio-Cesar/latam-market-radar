import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../extension/background.js',import.meta.url),'utf8');
function harness(existing=false,jobs=[{id:1,name:'Vale Varmida',server:'Freya'}]){
  let now=Date.now();class Clock extends Date {static now(){return now;}}
  const state={running:true,token:'test',...(existing?{tabId:9}:{})},calls=[];
  const url='https://ro.gnjoyamericas.com/pt/intro/shop-search/trading?storeType=SELL&serverType=FREYA&searchWord=Vale+Varmida';
  const context=vm.createContext({URL,URLSearchParams,Date:Clock,AbortSignal,console,fetch:async()=>({ok:true,json:async()=>({jobs,skipped:0})}),chrome:{
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,state[k]])),set:async value=>Object.assign(state,value),remove:async key=>delete state[key]}},
    tabs:{get:async()=>({id:9,url}),create:async options=>{calls.push(['create',options.url]);return{id:9};},update:async(id,options)=>{assert.equal(state.tabId,id);calls.push(['update',options.url]);},reload:async id=>calls.push(['reload',id])},
    alarms:{onAlarm:{addListener(){}},clear:async()=>{}},runtime:{onStartup:{addListener(){}},onMessage:{addListener(){}}}
  }});
  vm.runInContext(source,context);return {state,calls,context,url,advance:ms=>now+=ms};
}
test('primeira aba é associada antes de carregar o mercado; intervalo não é ignorado',async()=>{
  const h=harness();await vm.runInContext('tick()',h.context);
  assert.deepEqual(h.calls,[['create','about:blank'],['update',h.url]]);
  h.state.job=null;await vm.runInContext('tick()',h.context);assert.equal(h.calls.length,2);
});
test('mesmo item recarrega a aba e produz uma nova leitura',async()=>{
  const h=harness(true);await vm.runInContext('tick()',h.context);
  assert.deepEqual(h.calls,[['reload',9]]);
});

test('cada item tem intervalo próprio de cinco minutos; trabalho ativo não é interrompido',async()=>{
 const h=harness(true,[{id:1,name:'Vale Varmida',server:'Freya'},{id:2,name:'Elunium',server:'Freya'}]);
 await vm.runInContext('tick()',h.context);h.advance(30000);
 await vm.runInContext('tick()',h.context);assert.equal(h.calls.length,1);assert.equal(h.state.running,true);
 h.state.job=null;await vm.runInContext('tick()',h.context);assert.equal(h.state.job.id,2);
 h.state.job=null;h.advance(269999);await vm.runInContext('tick()',h.context);assert.equal(h.state.job,null);
 h.advance(1);await vm.runInContext('tick()',h.context);assert.equal(h.state.job.id,1);
});
test('limite de navegações e timeout pausam ou adiam sem novas buscas',async()=>{
 const h=harness(true);h.state.requestTimes=Array(30).fill(Date.now()-10000);
 await vm.runInContext('tick()',h.context);assert.equal(h.calls.length,0);
 h.state.requestTimes=[];await vm.runInContext('tick()',h.context);h.advance(180001);
 await vm.runInContext('tick()',h.context);assert.equal(h.state.running,false);assert.equal(h.calls.length,1);
});
