// api/webhook.js
// POST recebido da Hotmart (diretamente ou via n8n) a cada evento de compra.
// Atualiza (ou remove) a permissao do produto correspondente no Redis.

const PRODUCT_MAP = {
  '4425534': 'fabrica_limpeza',      // Fábrica da Limpeza Premium
  '5959285': 'ouro_automotivo',      // Ouro Automotivo
  '6000725': 'guia_legalizacao',     // Guia de Legalização Rápida
  '4447291': 'formula_exclusiva',    // Fórmula Personalizada Premium
  '5959154': 'perfumes_casa_rico',   // Cheiro de Riqueza / Perfumes de Casa de Rico
};

const STATUS_LIBERA = ['APPROVED', 'COMPLETE', 'COMPLETED'];
const STATUS_REMOVE = ['REFUNDED', 'CHARGEBACK', 'CANCELLED', 'CANCELED', 'PARTIALLY_REFUNDED'];

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

  const body = req.body || {};

  // Validação do Hottok, se configurado (a Hotmart envia esse token no payload
  // em "hottok" para validar que a chamada é realmente dela)
  if (HOTTOK && body.hottok && body.hottok !== HOTTOK) {
    return res.status(401).json({ error: 'Hottok inválido' });
  }

  try {
    const productId = String(body?.data?.product?.id || '');
    const status = body?.data?.purchase?.status || '';
    const email = (body?.data?.buyer?.email || '').toString().trim().toLowerCase();
    const nome = body?.data?.buyer?.name || '';

    const produtoKey = PRODUCT_MAP[productId];

    if (!produtoKey || !email) {
      return res.status(200).json({ ok: true, ignored: true, motivo: 'produto ou email ausente' });
    }

    const libera = STATUS_LIBERA.includes(status);
    const remove = STATUS_REMOVE.includes(status);

    if (!libera && !remove) {
      return res.status(200).json({ ok: true, ignored: true, status });
    }

    const redisKey = `fdl_cliente:${email}`;

    // Busca o registro atual (se existir) para não sobrescrever outros produtos
    const getRes = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(redisKey)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const getData = await getRes.json();

    let cliente = { nome, produtos: {} };
    if (getData.result) {
      cliente = JSON.parse(getData.result);
      if (!cliente.produtos) cliente.produtos = {};
      if (nome) cliente.nome = nome;
    }

    cliente.produtos[produtoKey] = !!libera;

    await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(redisKey)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(cliente),
    });

    return res.status(200).json({ ok: true, email, produto: produtoKey, liberado: libera });
  } catch (err) {
    console.error('Erro no webhook:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao processar webhook' });
  }
}
