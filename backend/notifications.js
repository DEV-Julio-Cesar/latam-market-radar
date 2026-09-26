// These are the only outbound HTTP adapters. Nothing contacts GNJOY or the game.
export class DiscordAdapter {
  channel = 'discord';
  constructor(config, transport = fetch) { this.config = config; this.transport = transport; }
  configured() { return Boolean(this.config.discordWebhook); }
  async send(message) {
    const url = new URL(this.config.discordWebhook);
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !/^\/api\/webhooks\/\d+\//.test(url.pathname)) throw new Error('Webhook Discord inválido.');
    const response = await this.transport(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:message,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000),redirect:'error'});
    if (!response.ok) throw new Error(`Discord respondeu HTTP ${response.status}.`);
  }
}
export class WhatsAppAdapter {
  channel = 'whatsapp';
  constructor(config, transport = fetch) { this.config = config; this.transport = transport; }
  configured() { const c=this.config; return Boolean(c.whatsappToken && c.whatsappPhone && c.whatsappRecipient && c.whatsappTemplate); }
  async send(message) {
    const c=this.config;
    if (!/^v\d+\.\d+$/.test(c.whatsappVersion) || !/^\d+$/.test(c.whatsappPhone) || !/^\d+$/.test(c.whatsappRecipient)) throw new Error('Configuração WhatsApp inválida.');
    const response = await this.transport(`https://graph.facebook.com/${c.whatsappVersion}/${c.whatsappPhone}/messages`, {
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${c.whatsappToken}`},
      body:JSON.stringify({messaging_product:'whatsapp',to:c.whatsappRecipient,type:'template',template:{name:c.whatsappTemplate,language:{code:c.whatsappLanguage},components:[{type:'body',parameters:[{type:'text',text:message}]}]}}),
      signal:AbortSignal.timeout(10000),redirect:'error',
    });
    if (!response.ok) throw new Error(`WhatsApp respondeu HTTP ${response.status}.`);
  }
}
export function alertMessage(a) {
  return `Latam Market Radar | ${a.alert_type === 'compra' ? 'Compra' : 'Venda'}: ${a.name} • ${a.server} • ${a.price.toLocaleString('pt-BR')} z • alvo ${a.target_price.toLocaleString('pt-BR')} z. Observação manual; confirme a disponibilidade.`;
}
export class NotificationService {
  constructor(repository,config,adapters) {
    this.repository=repository; this.config=config;
    this.adapters=adapters || [new DiscordAdapter(config),new WhatsAppAdapter(config)];
    this.running=false;
  }
  enqueue(alert,user) {
    for (const adapter of this.adapters) {
      const enabled=this.config.notificationsEnabled && this.config.notificationOwner === user.email && adapter.configured();
      this.repository.createDelivery(alert.id,adapter.channel,enabled ? 'pending':'disabled',enabled ? '' : 'Canal desativado, não configurado ou conta sem destino.');
    }
  }
  async drain() {
    if (this.running) return;
    this.running=true;
    try {
      for (const delivery of this.repository.pendingDeliveries()) {
        const adapter=this.adapters.find(a=>a.channel===delivery.channel);
        const owner=this.repository.userById(delivery.user_id);
        if (!this.config.notificationsEnabled || owner?.email !== this.config.notificationOwner || !adapter?.configured()) {
          this.repository.setDelivery(delivery.delivery_id,'disabled','Canal indisponível na configuração atual.'); continue;
        }
        this.repository.setDelivery(delivery.delivery_id,'sending');
        try { await adapter.send(alertMessage(delivery)); this.repository.setDelivery(delivery.delivery_id,'sent','Aceito pelo provedor.'); }
        catch { this.repository.setDelivery(delivery.delivery_id,'failed','Falha ou timeout no provedor. Sem reenvio automático para evitar duplicação.'); }
      }
    } finally { this.running=false; }
  }
}
