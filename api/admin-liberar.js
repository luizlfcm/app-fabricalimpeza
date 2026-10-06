// api/admin-liberar.js
// Painel administrativo: consulta / libera / revoga acesso de um cliente direto no Upstash.
// Protegido pela variável de ambiente ADMIN_KEY (header x-admin-key).
// Uso pela página /admin.html — não é chamado pelo app dos clientes.
import { randomBytes, timingSafeEqual } from 'crypto';

const PREFIXO = 'fdl_cliente:';          // prefixo da chave no Upstash
const TOKEN_PREFIXO = 'FDL_';
const PRODUTOS = ["base", "limp", "leg", "form", "perf"];
const UPSTASH_DEFAULT_URL = '';

function agora() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function chaveOk(recebida) {
  const esperada = process.env.ADMIN_KEY || '';
  if (!esperada || !recebida) return false;
  const a = Buffer.from(String(recebida));
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

function gerarToken() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  let t = '';
  for (let i = 0; i < 12; i++) t += alfabeto[bytes[i] % alfabeto.length];
  return TOKEN_PREFIXO + t;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' });

  if (!process.env.ADMIN_KEY) {
    return res.status(503).json({ ok: false, error: 'ADMIN_KEY não configurada na Vercel.' });
  }
  if (!chaveOk(req.headers['x-admin-key'])) {
    return res.status(401).json({ ok: false, error: 'Senha incorreta.' });
  }

  const URL_ = process.env.KV_REST_API_URL || UPSTASH_DEFAULT_URL;
  const TOKEN_ = process.env.KV_REST_API_TOKEN; // precisa ser o token com escrita (não o read-only)
  if (!URL_ || !TOKEN_) {
    return res.status(500).json({ ok: false, error: 'Credenciais do Upstash ausentes (KV_REST_API_URL / KV_REST_API_TOKEN).' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
  }

  const key = encodeURIComponent(PREFIXO + email);
  const auth = { Authorization: `Bearer ${TOKEN_}` };

  try {
    const g = await fetch(`${URL_}/get/${key}`, { headers: auth, cache: 'no-store' });
    const gd = await g.json();
    let atual = null;
    if (gd.result) { try { atual = JSON.parse(gd.result); } catch (e) { atual = null; } }

    // Apenas consultar
    if (body.acao === 'consultar') {
      return res.status(200).json({ ok: true, existe: !!atual, cliente: atual });
    }

    // Liberar / revogar: só altera os produtos enviados, preserva o resto
    const cliente = atual || {
      token: gerarToken(),
      nome: 'Cliente',
      email,
      criadoEm: agora(),
    };
    cliente.email = email;
    if (body.nome) cliente.nome = String(body.nome).slice(0, 80);
    if (!cliente.token) cliente.token = gerarToken();
    if (!cliente.criadoEm) cliente.criadoEm = agora();

    const pedidos = body.produtos || {};
    PRODUTOS.forEach((p) => {
      if (typeof pedidos[p] === 'boolean') cliente[p] = pedidos[p];
      else if (typeof cliente[p] !== 'boolean') cliente[p] = false;
    });
    cliente.atualizadoEm = agora();

    const s = await fetch(`${URL_}/set/${key}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'text/plain' },
      body: JSON.stringify(cliente),
    });
    const sd = await s.json();
    if (sd.error) throw new Error(sd.error);

    // Confere que gravou mesmo
    const v = await fetch(`${URL_}/get/${key}`, { headers: auth, cache: 'no-store' });
    const vd = await v.json();
    if (!vd.result) throw new Error('Não confirmou a gravação.');

    return res.status(200).json({ ok: true, gravado: true, cliente: JSON.parse(vd.result) });
  } catch (e) {
    console.error('admin-liberar erro:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao falar com o banco: ' + e.message });
  }
}
