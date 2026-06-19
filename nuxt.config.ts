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
    public: {
      appName: 'Vela',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
    },
  },
  nitro: {
    preset: process.env.VERCEL ? 'vercel' : 'node-server',
  },
})
