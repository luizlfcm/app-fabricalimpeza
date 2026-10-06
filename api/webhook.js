// api/webhook.js
// POST recebido da Hotmart a cada evento de compra — RESERVA do fluxo n8n.
// Se o n8n falhar, este endpoint libera/remove o acesso no Upstash no MESMO
// formato que o n8n e o painel /admin.html gravam (flags planas base/limp/...).
//
// Segurança: exige a variável HOTTOK (Hotmart > Ferramentas > Webhook > hottok).
// Sem ela configurada o endpoint fica desligado (503), para ninguém forjar compras.
//
// Atomicidade: a gravação é feita por script Lua (EVAL) no Upstash, então se o
// n8n e este webhook rodarem ao mesmo tempo, um não apaga o produto do outro.

import { timingSafeEqual } from 'crypto';

// product.id da Hotmart -> flag usada pelo app
const PRODUCT_MAP = {
  '4425534': 'base', // Fábrica da Limpeza Premium
  '5959285': 'limp', // Ouro Automotivo
  '6000725': 'leg',  // Guia de Legalização Rápida
  '4447291': 'form', // Fórmula Personalizada Premium
  '5959154': 'perf', // Cheiro de Riqueza / Perfumes de Casa de Rico
};

const STATUS_LIBERA = ['APPROVED', 'COMPLETE', 'COMPLETED'];
const STATUS_REMOVE = ['REFUNDED', 'CHARGEBACK', 'CANCELLED', 'CANCELED', 'PARTIALLY_REFUNDED'];

const LUA = `
local v = redis.call('GET', KEYS[1])
local c
if v then
  c = cjson.decode(v)
else
  c = { token = ARGV[3], nome = ARGV[2], email = ARGV[4], base = false, limp = false, leg = false, form = false, perf = false, criadoEm = ARGV[6] }
end
if not c.token then c.token = ARGV[3] end
if not c.criadoEm then c.criadoEm = ARGV[6] end
if ARGV[2] ~= '' and (c.nome == nil or c.nome == '' or c.nome == 'Cliente') then c.nome = ARGV[2] end
c.email = ARGV[4]
c[ARGV[1]] = (ARGV[5] == '1')
c.atualizadoEm = ARGV[6]
redis.call('SET', KEYS[1], cjson.encode(c))
return 1
`;

function agora() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function gerarToken() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t = 'FDL_';
  for (let i = 0; i < 12; i++) t += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return t;
}

function hottokOk(recebido, esperado) {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(String(recebido));
  const b = Buffer.from(String(esperado));
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const UPSTASH_URL = process.env.KV_REST_API_URL;
  const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;
  const HOTTOK = process.env.HOTTOK;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: 'Banco de dados não configurado (env vars ausentes).' });
  }
  if (!HOTTOK) {
    return res.status(503).json({ error: 'Webhook desligado: configure a variável HOTTOK na Vercel.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  const recebido = req.headers['x-hotmart-hottok'] || body.hottok;
  if (!hottokOk(recebido, HOTTOK)) {
    return res.status(401).json({ error: 'Hottok inválido' });
  }

  try {
    const productId = String(body?.data?.product?.id || '');
    const status = String(body?.data?.purchase?.status || '').toUpperCase();
    const email = (body?.data?.buyer?.email || '').toString().trim().toLowerCase();
    const nome = (body?.data?.buyer?.name || '').toString().slice(0, 80);

    const flag = PRODUCT_MAP[productId];
    if (!flag || !email) {
      return res.status(200).json({ ok: true, ignored: true, motivo: 'produto ou email ausente' });
    }

    const libera = STATUS_LIBERA.includes(status);
    const remove = STATUS_REMOVE.includes(status);
    if (!libera && !remove) {
      return res.status(200).json({ ok: true, ignored: true, status });
    }

    // Mesmo prefixo usado pelo n8n e pelo login (fdl_cliente:)
    const redisKey = `fdl_cliente:${email}`;

    const r = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        'EVAL', LUA, '1', redisKey,
        flag, nome, gerarToken(), email, libera ? '1' : '0', agora(),
      ]),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    return res.status(200).json({ ok: true, email, produto: flag, liberado: libera });
  } catch (err) {
    console.error('Erro no webhook:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao processar webhook' });
  }
}
