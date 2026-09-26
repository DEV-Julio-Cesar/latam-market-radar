async function readPage() {
  const {job}=await chrome.runtime.sendMessage({type:'current-job'});
  if(!job)return;
  const params=new URL(location.href).searchParams;
  if(params.get('searchWord')!==job.name||params.get('serverType')!==job.server.toUpperCase()||params.get('storeType')!=='SELL')return;
  let sawOtherOffers=false;
  const candidateNames=new Set();
  const deadline=Date.now()+25000;
  while(Date.now()<deadline) {
    const visible=document.body.innerText;
    if(RadarParser.blocked(visible)||document.querySelector('iframe[src*="challenges.cloudflare.com"],#challenge-running,#challenge-stage')) {
      await chrome.runtime.sendMessage({type:'reading',jobId:job.id,status:'blocked'});return;
    }
    if(/Nenhum registro encontrado/i.test(visible)) {
      await chrome.runtime.sendMessage({type:'reading',jobId:job.id,status:'empty'});return;
    }
    const found=[];
    for(const heading of document.querySelectorAll('h3')) {
      if(!heading.getClientRects().length)continue;
      let card=heading.parentElement;
      for(let level=0;card&&level<6;level++,card=card.parentElement) {
        if(card.querySelectorAll('h3').length>1)break;
        if(/Quantidade/.test(card.innerText)&&/Nome\s+do\s+Comércio/.test(card.innerText)) {
          if(RadarParser.parseCard(heading.innerText,card.innerText,heading.innerText)) {
            sawOtherOffers=true;
            if(candidateNames.size<5)candidateNames.add(heading.innerText.trim().slice(0,120));
          }
          const item=RadarParser.parseCard(heading.innerText,card.innerText,job.name);
          if(item)found.push(item);
          break;
        }
      }
    }
    if(found.length) {
      found.sort((a,b)=>a.price-b.price);
      await chrome.runtime.sendMessage({type:'reading',jobId:job.id,status:'ok',...found[0],observed_at:new Date().toISOString()});return;
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await chrome.runtime.sendMessage({type:'reading',jobId:job.id,status:sawOtherOffers?'empty':'error',candidate_names:[...candidateNames]});
}
void readPage().catch(()=>{});
