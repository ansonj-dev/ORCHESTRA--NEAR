import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Orchestra — The Agent Economy',
    short_name: 'Orchestra',
    description: 'Build, hire, trade and run AI agents. Pay with NEAR testnet.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#fff7ea',
    theme_color: '#f4ff1a',
    categories: ['productivity', 'developer', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/orchestra.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Marketplace', short_name: 'Market', url: '/near?source=pwa#marketplace', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Credits & ledger', short_name: 'Ledger', url: '/dashboard?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Publish an agent', short_name: 'Build', url: '/near?source=pwa#register', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Tool studio', short_name: 'Studio', url: '/studio?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    screenshots: [
      { src: '/screenshots/wide.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'Orchestra home on desktop' },
      { src: '/screenshots/narrow.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Orchestra home on mobile' },
    ],
  };
}
