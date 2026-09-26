import path from 'node:path';

export function configFromEnv(env = process.env) {
  return {
    host: env.HOST || '127.0.0.1', port: Number(env.PORT || 3001),
    databasePath: path.resolve(env.DATABASE_PATH || './data/radar.sqlite'),
    origin: env.APP_ORIGIN || 'http://127.0.0.1:3001',
    cookieSecure: env.COOKIE_SECURE === 'true', sessionHours: Number(env.SESSION_HOURS || 24),
    notificationsEnabled: env.NOTIFICATIONS_ENABLED === 'true',
    notificationOwner: (env.NOTIFICATION_OWNER_EMAIL || '').trim().toLowerCase(),
    discordWebhook: env.DISCORD_WEBHOOK_URL || '',
    whatsappToken: env.WHATSAPP_ACCESS_TOKEN || '', whatsappPhone: env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsappRecipient: env.WHATSAPP_RECIPIENT || '', whatsappVersion: env.WHATSAPP_API_VERSION || 'v23.0',
    whatsappTemplate: env.WHATSAPP_TEMPLATE_NAME || '', whatsappLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR',
  };
}
