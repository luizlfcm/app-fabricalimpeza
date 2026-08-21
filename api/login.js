// api/login.js
// GET /api/login?email=cliente@email.com
// Consulta o Redis (Upstash) e retorna as permissoes do cliente por produto.

export default async function handler(req, res) {
  const UPSTASH_URL = process.env.KV_REST_API_URL;
  const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ success: false, error: 'Banco de dados não configurado (env vars ausentes).' });
  }

  const email = (req.query.email || '').toString().trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email não informado' });
  }

  try {
    // Prefixo próprio (fdl_) para não colidir com registros de outros apps
    // que já usam esse mesmo banco Redis compartilhado (ex: Fórmula Auto Pro)
    const key = `fdl_cliente:${email}`;
    const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await r.json();

    if (!data.result) {
      return res.status(200).json({
        success: false,
        error: 'Email não encontrado. Verifique se digitou o mesmo email usado na compra.',
      });
    }

    const cliente = JSON.parse(data.result);
    const produtos = cliente.produtos || {};

    // Mapeia os nomes completos (Redis) para as chaves curtas que o app usa
    const permissions = {
      base: !!produtos.fabrica_limpeza,
      limp: !!produtos.ouro_automotivo,
      leg: !!produtos.guia_legalizacao,
      form: !!produtos.formula_exclusiva,
      perf: !!produtos.perfumes_casa_rico,
    };

    return res.status(200).json({ success: true, permissions });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ success: false, error: 'Erro de conexão. Tente novamente.' });
  }
}
