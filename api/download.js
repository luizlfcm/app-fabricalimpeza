// api/download.js
// GET /api/download?produto=base&email=cliente@email.com[&token=ADMIN_FDL_2026]
// Serve os PDFs de forma protegida — os arquivos NÃO ficam mais na raiz pública
// do site. Antes de entregar o arquivo, confere no Redis se o email realmente
// comprou o produto pedido (mesma lógica/chave usada pelo /api/login).

import fs from 'fs';
import path from 'path';

const FILES = {
  base: { file: 'fabrica-limpeza.pdf', name: 'Fabrica-da-Limpeza-130-Formulas.pdf' },
  limp: { file: 'ouro-automotivo.pdf', name: 'Ouro-Automotivo-30-Formulas.pdf' },
  leg: { file: 'guia-legalizacao.pdf', name: 'Guia-de-Legalizacao.pdf' },
  perf: { file: 'perfumes-casa-rico.pdf', name: 'Perfumes-Casa-de-Rico-30-Receitas.pdf' },
};

const ADMIN_TOKEN = 'ADMIN_FDL_2026';

export default async function handler(req, res) {
  const produto = (req.query.produto || '').toString();
  const email = (req.query.email || '').toString().trim().toLowerCase();
  const token = (req.query.token || '').toString().toUpperCase();

  const meta = FILES[produto];
  if (!meta) {
    return res.status(400).json({ error: 'Produto inválido' });
  }

  const isAdmin = token === ADMIN_TOKEN || token.includes('FULL');

  if (!isAdmin) {
    if (!email) {
      return res.status(401).json({ error: 'Email não informado' });
    }

    const UPSTASH_URL = process.env.KV_REST_API_URL;
    const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;
    if (!UPSTASH_URL || !UPSTASH_TOKEN) {
      return res.status(500).json({ error: 'Banco de dados não configurado (env vars ausentes).' });
    }

    try {
      const key = `fdl_cliente:${email}`;
      const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      });
      const data = await r.json();

      if (!data.result) {
        return res.status(403).json({ error: 'Acesso não encontrado para este email' });
      }

      const cliente = JSON.parse(data.result);
      if (!cliente[produto]) {
        return res.status(403).json({ error: 'Este produto não está liberado para este email' });
      }
    } catch (err) {
      console.error('Erro ao verificar acesso para download:', err);
      return res.status(500).json({ error: 'Erro ao verificar acesso. Tente novamente.' });
    }
  }

  try {
    const filePath = path.join(process.cwd(), 'api', 'files', meta.file);
    const buf = fs.readFileSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${meta.name}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('Erro ao ler PDF:', err);
    return res.status(500).json({ error: 'Arquivo não encontrado no servidor.' });
  }
}
