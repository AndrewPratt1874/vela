export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui-pro', '@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Vela',
      link: [{ rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    },
  },
  supabase: {
    types: '~/types/database.ts',
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/login', '/confirm', '/forgot-password', '/reset-password'],
    },
  },
  runtimeConfig: {
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    mail: {
      host: process.env.MAIL_SMTP_HOST || 'smtp.mandrillapp.com',
      port: process.env.MAIL_SMTP_PORT || '587',
      user: process.env.MAIL_SMTP_USER || '',
      pass: process.env.MAIL_SMTP_PASS || '',
      from: process.env.MAIL_FROM || 'noreply@codable.online',
      fromName: process.env.MAIL_FROM_NAME || 'Vela',
    },
    mailgun: {
      // HTTP webhook signing key (Mailgun dashboard → Webhooks). Verifies
      // inbound POSTs are genuinely from Mailgun. Required to accept mail.
      signingKey: process.env.MAILGUN_SIGNING_KEY || '',
      // Domain the inbound route receives on, e.g. "inbound.codable.online".
      // Used to build per-ticket Reply-To addresses (ticket+<id>@<domain>).
      inboundDomain: process.env.MAILGUN_INBOUND_DOMAIN || '',
    },
    public: {
      appName: 'Vela',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
    },
  },
  nitro: {
    preset: process.env.VERCEL ? 'vercel' : 'node-server',
  },
})
