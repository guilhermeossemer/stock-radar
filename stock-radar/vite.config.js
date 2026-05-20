import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function createJsonResponse(res) {
  return {
    status(code) {
      res.statusCode = code
      return this
    },
    json(body) {
      const payload = JSON.stringify(body)
      res.setHeader('Content-Type', 'application/json')
      res.end(payload)
    },
  }
}

function createApiMiddleware(handler) {
  return async (req, res, next) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)
      req.query = Object.fromEntries(url.searchParams.entries())
      req.url = url.pathname
      req.method = req.method || 'GET'
      const extendedRes = createJsonResponse(res)
      await handler(req, extendedRes)
    } catch (error) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: false, error: error.message }))
    }
  }
}

const apiRoutes = {
  '/api/quote': () => import('./api/quote.js').then((mod) => mod.default),
  '/api/history': () => import('./api/history.js').then((mod) => mod.default),
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vite-api-middleware',
      async configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const route = req.url?.split('?')[0]
          const loader = apiRoutes[route]
          if (!loader) {
            return next()
          }
          const handler = await loader()
          return createApiMiddleware(handler)(req, res, next)
        })
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png'
      ],
      manifest: {
        name: 'Stock Radar',
        short_name: 'Stock Radar',
        description: 'Scanner técnico para ações B3 com instalação mobile.',
        theme_color: '#0c1118',
        background_color: '#060a0f',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ]
})