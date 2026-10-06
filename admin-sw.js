// Service worker só do painel admin (escopo /admin.html) — não afeta o app dos clientes.
// Sem cache: o painel precisa sempre falar com o banco ao vivo.
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){ e.respondWith(fetch(e.request)); });
