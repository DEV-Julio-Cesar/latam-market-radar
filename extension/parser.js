// Only plain visible card text is parsed. No hidden state, cookies or network interception.
globalThis.RadarParser={
  normalize:s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR'),
  parseCard(name,text,wanted) {
    if(this.normalize(name)!==this.normalize(wanted))return null;
    text=text.replace(/\s+/g,' ').trim();
    name=name.replace(/\s+/g,' ').trim();
    const afterName=text.slice(text.indexOf(name)+name.length).trim();
    const priceMatch=afterName.match(/^([\d.]+)(?:\s*z)?(?:\s|$)/i);
    const quantityMatch=text.match(/Quantidade\s*:?[\s\n]*([\d.]+)/i);
    if(!priceMatch||!quantityMatch)return null;
    const price=Number(priceMatch[1].replaceAll('.','')),quantity=Number(quantityMatch[1].replaceAll('.',''));
    if(!Number.isSafeInteger(price)||price<=0||price>1e12||!Number.isSafeInteger(quantity)||quantity<1||quantity>1e6)return null;
    return {name:name.trim(),price,quantity};
  },
  blocked(text) {return /just a moment|verify you are human|verifique.{0,30}humano|enable javascript and cookies|too many requests|access denied|checking your browser|verifica[çc][aã]o de seguran[çc]a/i.test(text);}
};
