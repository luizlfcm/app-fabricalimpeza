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
    // Mesmo prefixo usado pelo workflow n8n (fdl_cliente:) — evita colisão
    // com registros de outros apps que usam esse mesmo banco compartilhado
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

    // O n8n já grava no formato exato que o app espera (base/limp/leg/form/perf)
    const permissions = {
      base: !!cliente.base,
      limp: !!cliente.limp,
      leg: !!cliente.leg,
      form: !!cliente.form,
      perf: !!cliente.perf,
    };

    return res.status(200).json({ success: true, permissions });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ success: false, error: 'Erro de conexão. Tente novamente.' });
  }
}
