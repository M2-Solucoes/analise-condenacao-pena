// Histórico das PAs já analisadas (<base>/_historico.json), para a execução diária não repetir PA.
// Uma PA fica em "Análise de Recurso" até a empresa validar, às vezes por dias; ela entra só no primeiro lote.
import fs from 'node:fs';
import path from 'node:path';

const arquivo = (base) => path.join(base, '_historico.json');

export function lerHistorico(base) {
  try { return JSON.parse(fs.readFileSync(arquivo(base), 'utf8')); } catch { return { pas: {} }; }
}

export function registrarNoHistorico(base, itens) {
  const h = lerHistorico(base);
  for (const it of itens) h.pas[it.paId] = { ...(h.pas[it.paId] || {}), ...it };
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(`${arquivo(base)}.tmp`, JSON.stringify(h, null, 1));
  fs.renameSync(`${arquivo(base)}.tmp`, arquivo(base));
  return Object.keys(h.pas).length;
}
