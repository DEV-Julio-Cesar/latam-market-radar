const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function cards(wanted) {
  const found=[],names=new Set(),offers=[];let rendered=0;
  for(const heading of document.querySelectorAll('h3')) {
    if(!heading.getClientRects().length)continue;
    let card=heading.parentElement;
    for(let level=0;card&&level<6;level++,card=card.parentElement) {
      if(card.querySelectorAll('h3').length>1)break;
      if(/Quantidade/.test(card.innerText)&&/Nome\s+do\s+Comércio/.test(card.innerText)) {
        const parsed=RadarParser.parseCard(heading.innerText,card.innerText,heading.innerText);
        if(parsed){offers.push(parsed);rendered++;if(names.size<5)names.add(parsed.name);}
        const exact=RadarParser.parseCard(heading.innerText,card.innerText,wanted);
        if(exact){
          const text=card.innerText.replace(/\s+/g,' ');
          found.push({...exact,seller:(text.match(/Vendedor\s*:?(.*?)\s+Tipo\b/i)?.[1]||'').trim().slice(0,120),shop:(text.match(/Nome\s+do\s+Comércio\s*:?(.*?)\s+Vendedor\b/i)?.[1]||'').trim().slice(0,200)});
        }
        break;
      }
    }
  }
  return {found,names:[...names],rendered,offers};
}
function blocked() {
  return RadarParser.blocked(document.body.innerText)||Boolean(document.querySelector('iframe[src*="challenges.cloudflare.com"],#challenge-running,#challenge-stage'));
}
async function readPage() {
  const {job}=await chrome.runtime.sendMessage({type:'current-job'});
  if(!job)return;
  const matches=()=>{const p=new URL(location.href).searchParams;return p.get('searchWord')===job.name&&p.get('serverType')===job.server.toUpperCase()&&p.get('storeType')==='SELL';};
  if(!matches())return;
  const send=data=>chrome.runtime.sendMessage({type:'reading',jobId:job.id,runId:job.runId,...data});
  const all=[],names=new Set();let pages=0,previous=null,partial=false;
  const seen=new Set();
  for(let page=1;page<=job.maxPages;page++) {
    const deadline=Date.now()+25000;let snapshot=null,stable=null;
    while(Date.now()<deadline) {
      if(!matches()){await send({status:'error'});return;}
      if(blocked()){await send({status:'blocked'});return;}
      const result=cards(job.name),signature=JSON.stringify(result);
      if(result.rendered&&signature!==previous) {
        if(stable===signature){snapshot={...result,signature};break;}
        stable=signature;
      }
      if(page===1&&/Nenhum registro encontrado/i.test(document.body.innerText)){await send({status:'empty',pages_read:1});return;}
      await wait(1000);
    }
    if(!snapshot) {
      if(!pages){await send({status:'error'});return;}
      partial=true;break;
    }
    if(seen.has(snapshot.signature)){partial=true;break;}
    seen.add(snapshot.signature);previous=snapshot.signature;pages++;
    all.push(...snapshot.found);snapshot.names.forEach(n=>{if(names.size<5)names.add(n);});
    const buttons=[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length);
    const next=buttons.filter(b=>b.textContent.trim()===String(page+1)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true');
    if(next.length!==1) {
      partial=next.length>1||buttons.some(b=>/next|próxim/i.test(b.getAttribute('aria-label')||b.textContent));break;
    }
    if(page===job.maxPages){partial=true;break;}
    await wait(5500);
    if(!matches()){await send({status:'error'});return;}
      if(blocked()){await send({status:'blocked'});return;}
    const permission=await chrome.runtime.sendMessage({type:'page-permit',runId:job.runId});
    if(!permission.allowed){partial=true;break;}
    const now=new URL(location.href).searchParams;
    if(now.get('searchWord')!==job.name||now.get('serverType')!==job.server.toUpperCase()){await send({status:'error'});return;}
    next[0].click();
  }
  if(all.length) {
    all.sort((a,b)=>a.price-b.price);
    await send({status:'ok',...all[0],offers:all.slice(0,500),observed_at:new Date().toISOString(),pages_read:pages,partial:partial||all.length>500});
  }else await send({status:'empty',candidate_names:[...names],pages_read:pages,partial});
}
void readPage().catch(()=>{});
