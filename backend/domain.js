export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const normalize = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AppError(422, `${label} inválido.`);
  return value.trim().replace(/\s+/g,' ');
}
function integer(value, label, min = 1, max = 1e12) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new AppError(422, `${label} deve ser um número inteiro entre ${min} e ${max}.`);
  return value;
}
export function credentials(input) {
  const email = text(input.email,'Email',254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(422,'Email inválido.');
  if (typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 128) throw new AppError(422,'A senha deve ter entre 10 e 128 caracteres.');
  return {email,password:input.password};
}
export function validateItem(input) {
  const grade=input.grade==null||input.grade===''?null:input.grade;
  if(grade!==null&&!['none','D','C','B','A'].includes(grade))throw new AppError(422,'Grau inválido.');
  return {grade,name:text(input.name,'Nome',120),server:text(input.server,'Servidor',60),
    item_id:input.item_id == null ? null : integer(input.item_id,'ID do item',1,2147483647),
    refine:input.refine == null ? null : integer(input.refine,'Refino',0,20)};
}
export function validateWatch(input) {
  const item = validateItem(input);
  if (!['compra','venda'].includes(input.alert_type)) throw new AppError(422,'Tipo de alerta inválido.');
  return {...item,alert_type:input.alert_type,target_price:input.target_price == null || input.target_price === '' ? null : integer(input.target_price,'Preço-alvo')};
}
export function validateObservation(input) {
  const item = validateItem(input);
  if (typeof input.observed_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.observed_at)) throw new AppError(422,'Informe a data com fuso horário.');
  const date = new Date(input.observed_at);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60000) throw new AppError(422,'Data inválida ou no futuro.');
  if (typeof input.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id)) throw new AppError(422,'Identificador de envio inválido.');
  return {...item,price:integer(input.price,'Preço'),quantity:integer(input.quantity,'Quantidade',1,1000000),observed_at:date.toISOString(),request_id:input.request_id};
}
export function matches(w,o) {
  // An explicit ID requires the observation to provide the same ID; otherwise use the name.
  const sameItem = w.item_id !== null ? w.item_id === o.item_id : normalize(w.name) === normalize(o.name);
  return sameItem && normalize(w.server) === normalize(o.server) && (w.refine === null || w.refine === o.refine) && (w.grade == null || w.grade === o.grade);
}
export function hitsTarget(w,o) { return w.target_price != null && matches(w,o) && (w.alert_type === 'compra' ? o.price <= w.target_price : o.price >= w.target_price); }
export function statistics(observations) {
  if (!observations.length) return {count:0,mean:null,median:null,min:null,max:null,variation:null,last:null};
  const ordered = [...observations].sort((a,b) => a.observed_at.localeCompare(b.observed_at) || a.id-b.id);
  const prices = ordered.map(o=>o.price).sort((a,b)=>a-b), n=prices.length;
  return {count:n,mean:prices.reduce((a,b)=>a+b,0)/n,median:n%2 ? prices[(n-1)/2] : (prices[n/2-1]+prices[n/2])/2,
    min:prices[0],max:prices[n-1],variation:(ordered[n-1].price/ordered[0].price-1)*100,last:ordered[n-1].price};
}
