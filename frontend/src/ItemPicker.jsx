import React, {useMemo,useState} from 'react';
import initialCatalog from './catalog.json';
export default function ItemPicker({watches,onSelect}) {
  const [query,setQuery]=useState(''),[category,setCategory]=useState('Todas'),[expanded,setExpanded]=useState(false);
  const items=useMemo(()=>{const all=new Map();for(const item of [...initialCatalog,...watches.map(w=>({name:w.name,category:'Meus itens'}))]){const key=item.name.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');if(!all.has(key))all.set(key,item);}return [...all.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));},[watches]);
  const categories=['Todas',...new Set(items.map(i=>i.category))];
  const found=items.filter(i=>(category==='Todas'||i.category===category)&&i.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  return <section className="item-picker"><button type="button" className="button secondary" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>Escolher item do catálogo</button>{expanded&&<><p>Catálogo inicial com {items.length} nomes, incluindo seus itens. Ainda não contém todos os itens do LATAM.</p><div className="picker-filters"><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Buscar no catálogo<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Opcional: filtrar pelo nome"/></label></div><div className="picker-items">{found.map(i=><button type="button" className="picker-item" key={i.name} onClick={()=>{onSelect(i);setExpanded(false);}}><strong>{i.name}</strong><small>{i.category}</small></button>)}</div>{!found.length&&<p>Nenhum item encontrado. Você pode preencher o nome manualmente.</p>}</>}</section>;
}
