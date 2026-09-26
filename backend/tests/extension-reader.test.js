import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const parser=readFileSync(new URL('../../extension/parser.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../../extension/reader.js',import.meta.url),'utf8').replace('void readPage().catch(()=>{});','');
async function read({prices=[30000,28000],allowed=true,challenge=false,maxPages=5}={}) {
 let page=0,now=Date.now();const sent=[];
 class Clock extends Date {static now(){return now;}}
 const text=()=>`Vale Varmida\n${prices[page]}\nNome do Comércio\nLoja ${page}\nVendedor\nVendedor ${page}\nTipo\nSELL\nQuantidade\n2`;
 const card={get innerText(){return text();},querySelectorAll:()=>[{}]};
 const document={body:{get innerText(){return challenge?'Just a moment':text();}},querySelector:()=>null,querySelectorAll:selector=>selector==='h3'?[{innerText:'Vale Varmida',getClientRects:()=>[1],parentElement:card}]:page<prices.length-1?[{textContent:String(page+2),disabled:false,getClientRects:()=>[1],getAttribute:()=>null,click:()=>page++}]:[]};
 const context=vm.createContext({document,location:{href:'https://ro.gnjoyamericas.com/pt/intro/shop-search/trading?searchWord=Vale+Varmida&serverType=FREYA&storeType=SELL'},URL,Date:Clock,setTimeout:fn=>{now+=1000;fn();},chrome:{runtime:{sendMessage:async m=>{
  if(m.type==='current-job')return{job:{id:1,runId:'test',name:'Vale Varmida',server:'Freya',maxPages}};
  if(m.type==='page-permit')return{allowed};sent.push(m);return{};
 }}}});
 vm.runInContext(parser+source,context);await vm.runInContext('readPage()',context);return sent;
}
test('paginação coleta todas as ofertas lidas e encontra menor preço na segunda página',async()=>{
 const [result]=await read();assert.equal(result.price,28000);assert.equal(result.pages_read,2);assert.equal(result.partial,false);
 assert.equal(result.offers.length,2);assert.equal(result.offers[0].seller,'Vendedor 1');assert.equal(result.offers[1].shop,'Loja 0');
});
test('limite e orçamento marcam parcial; bloqueio não envia preços',async()=>{
 const [budget]=await read({allowed:false});assert.equal(budget.partial,true);assert.equal(budget.pages_read,1);
 const [cap]=await read({maxPages:1});assert.equal(cap.partial,true);assert.equal(cap.offers.length,1);
 const [blocked]=await read({challenge:true});assert.equal(blocked.status,'blocked');assert.equal(blocked.offers,undefined);
});
