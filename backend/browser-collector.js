import { randomUUID } from 'node:crypto';
import { AppError, normalize, validateObservation } from './domain.js';
import { hashToken, newToken } from './security.js';
import { MarketService } from './service.js';

// A paired extension submits only public, rendered prices. No GNJOY request is made here.
export class BrowserCollector {
  constructor(repo, notifications) {
    this.repo = repo;

    this.service = new MarketService(repo, notifications, {
      name: 'browser',
      normalize: validateObservation
    });
  }
  async pair(user) {
    const token = newToken(),
      expires = new Date(Date.now() + 7 * 86400000).toISOString();
    await this.repo.db.prepare(`INSERT INTO browser_connections(user_id,token_hash,expires_at,status) VALUES(?,?,?,'Aguardando extensão') ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,status=excluded.status`).run(user.id, hashToken(token), expires);
    return {
      token,
      expires_at: expires
    };
  }
  async revoke(user) {
    await this.repo.db.prepare('DELETE FROM browser_connections WHERE user_id=?').run(user.id);
  }
  async status(user) {
    const state = (await this.repo.db.prepare('SELECT expires_at,last_read,status FROM browser_connections WHERE user_id=?').get(user.id)) || {
      status: 'Não conectado'
    };
    const last_success = (await this.repo.db.prepare("SELECT item_name,status,received_at FROM browser_read_log WHERE user_id=? AND status IN ('ok','empty') ORDER BY id DESC LIMIT 1").get(user.id)) || null;
    return {
      ...state,
      last_success,
      recent_reads: await this.repo.db.prepare('SELECT item_name,status,reader_version,detail,received_at FROM browser_read_log WHERE user_id=? ORDER BY id DESC LIMIT 10').all(user.id)
    };
  }
  async log(user, w, input, detail) {
    const version = typeof input.reader_version === 'string' ? input.reader_version.slice(0, 20) : 'anterior a 1.1.2';
    await this.repo.db.prepare('INSERT INTO browser_read_log(user_id,watch_id,item_name,status,reader_version,detail,received_at) VALUES(?,?,?,?,?,?,?)').run(user.id, w.id, w.name, input.status, version, detail, new Date().toISOString());
    await this.repo.db.prepare('DELETE FROM browser_read_log WHERE user_id=? AND id NOT IN (SELECT id FROM browser_read_log WHERE user_id=? ORDER BY id DESC LIMIT 100)').run(user.id, user.id);
  }
  async user(token) {
    const connection = await this.repo.db.prepare('SELECT user_id FROM browser_connections WHERE token_hash=? AND expires_at>?').get(hashToken(token), new Date().toISOString());
    if (!connection) throw new AppError(401, 'Conexão expirada ou revogada. Gere outra chave no Radar.');
    return await this.repo.userById(connection.user_id);
  }
  async jobs(user) {
    const all = (await this.repo.watches(user.id)).filter(w => w.active);
    const compatible = w => w.item_id === null && w.refine === null && w.grade == null && ['freya', 'nidhogg', 'yggdrasil'].includes(normalize(w.server));
    return {
      jobs: all.filter(compatible).map(w => ({
        id: w.id,
        name: w.name,
        server: w.server
      })),
      skipped: all.filter(w => !compatible(w)).length
    };
  }
  async receive(user, input) {
    const w = await this.repo.watch(user.id, input.watch_id);
    if (!w || !w.active) throw new AppError(404, 'Monitoramento não encontrado ou pausado.');
    if (!(await this.jobs(user)).jobs.some(j => j.id === w.id)) throw new AppError(422, 'Modo navegador exige nome sem ID, refino ou grau e servidor suportado.');
    if (!['ok', 'empty', 'blocked', 'error'].includes(input.status)) throw new AppError(422, 'Estado de leitura inválido.');
    const now = new Date().toISOString();
    if (input.status !== 'ok') {
      if (input.status === 'empty') await this.repo.db.prepare('INSERT INTO browser_offers VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,watch_id) DO UPDATE SET offers_json=excluded.offers_json,observed_at=excluded.observed_at,pages_read=excluded.pages_read,partial=excluded.partial').run(user.id, w.id, '[]', now, Number.isInteger(input.pages_read) && input.pages_read >= 1 && input.pages_read <= 5 ? input.pages_read : 1, Number(input.partial !== false));
      const message = {
        empty: 'Nenhuma oferta exata na página lida',
        blocked: 'Pausado: verificação ou bloqueio do site',
        error: 'Pausado: não foi possível interpretar a página'
      }[input.status];
      const names = Array.isArray(input.candidate_names) ? input.candidate_names.filter(n => typeof n === 'string').slice(0, 5).map(n => n.slice(0, 120)) : [];
      await this.log(user, w, input, names.length ? `${message}. Nomes exibidos: ${names.join(', ')}` : message);
      await this.repo.db.prepare('UPDATE browser_connections SET status=?,last_read=? WHERE user_id=?').run(message, now, user.id);
      return {
        imported: 0
      };
    }
    if (normalize(input.name || '') !== normalize(w.name)) throw new AppError(422, 'O nome lido não corresponde ao item monitorado.');
    const o = validateObservation({
      name: w.name,
      item_id: null,
      refine: null,
      server: w.server,
      price: input.price,
      quantity: input.quantity,
      observed_at: input.observed_at,
      request_id: randomUUID()
    });
    if (Date.now() - new Date(o.observed_at).getTime() > 120000) throw new AppError(422, 'Leitura antiga. Consulte novamente.');
    if (input.offers !== undefined && (!Array.isArray(input.offers) || !input.offers.length || input.offers.length > 500)) throw new AppError(422, 'Lista de ofertas inválida.');
    const offers = (input.offers || [input]).map(offer => {
      if (typeof offer?.name !== 'string' || normalize(offer.name) !== normalize(w.name)) throw new AppError(422, 'Oferta de outro item.');
      const checked = validateObservation({
        ...o,
        price: offer.price,
        quantity: offer.quantity
      });
      const field = (key, max) => {
        if (offer[key] != null && (typeof offer[key] !== 'string' || offer[key].length > max)) throw new AppError(422, 'Dados da loja inválidos.');
        return offer[key]?.trim() || '';
      };
      return {
        name: w.name,
        price: checked.price,
        quantity: checked.quantity,
        seller: field('seller', 120),
        shop: field('shop', 200)
      };
    }).sort((a, b) => a.price - b.price);
    if (offers[0].price !== o.price) throw new AppError(422, 'Menor preço incompatível com as ofertas.');
    // One minimum-price sample per visible page, recorded only when its price changes.
    const fingerprint = String(o.price);
    const old = await this.repo.db.prepare('SELECT fingerprint FROM browser_snapshots WHERE user_id=? AND watch_id=?').get(user.id, w.id);
    let result = {
      alerts: [],
      duplicate: true
    };
    if (old?.fingerprint !== fingerprint) result = await this.service.record(user, o);
    await this.repo.db.prepare('INSERT INTO browser_snapshots VALUES(?,?,?,?) ON CONFLICT(user_id,watch_id) DO UPDATE SET fingerprint=excluded.fingerprint,observed_at=excluded.observed_at').run(user.id, w.id, fingerprint, now);
    await this.repo.db.prepare("UPDATE browser_connections SET status='Leitura recebida do navegador (página parcial)',last_read=? WHERE user_id=?").run(now, user.id);
    const pages = Number.isInteger(input.pages_read) && input.pages_read >= 1 && input.pages_read <= 5 ? input.pages_read : 1;
    await this.repo.db.prepare('INSERT INTO browser_offers VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,watch_id) DO UPDATE SET offers_json=excluded.offers_json,observed_at=excluded.observed_at,pages_read=excluded.pages_read,partial=excluded.partial').run(user.id, w.id, JSON.stringify(offers), o.observed_at, pages, Number(input.partial !== false || !input.offers));
    await this.log(user, w, input, `${o.price.toLocaleString('pt-BR')} z; ${result.duplicate ? 'preço sem mudança' : 'observação salva'}; ${pages} página(s); ${input.partial === false ? 'fim da paginação informada' : 'cobertura parcial'}`);
    return {
      imported: result.duplicate ? 0 : 1,
      alerts: result.alerts.length
    };
  }
}
