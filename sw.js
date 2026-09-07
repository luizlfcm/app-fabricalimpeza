// sw.js — Service Worker mínimo, necessário para o Chrome/Android
// considerar o app instalável de verdade (não só atalho).

const CACHE_NAME = 'fabrica-limpeza-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Passa as requisições direto pra rede (sem cache agressivo por enquanto).
// Ter esse "fetch handler" registrado já satisfaz o critério de
// instalabilidade do Chrome — o cache de verdade pode vir depois.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
