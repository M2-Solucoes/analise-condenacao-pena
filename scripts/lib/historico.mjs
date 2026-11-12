// Controle de carga (<base>/_historico.json): toda PA que saiu numa planilha entregue fica registrada aqui, com o
// lote e a data em que apareceu pela primeira vez. Uma PA fica em "Análise de Recurso" até a empresa validar, às
// vezes por dias; ela aparece só no primeiro lote e nunca mais (pedido do escritório em 12/11/2026).
// Rodar de novo o MESMO lote (mesmo dia) não tira as PAs dele: só contam as que apareceram em lotes anteriores.
import fs from 'node:fs';
import path from 'node:path';

const arquivo = (base) => path.join(base, '_historico.json');

export function lerHistorico(base) {
  try { return JSON.parse(fs.readFileSync(arquivo(base), 'utf8')); } catch { return { pas: {} }; }
}

// A PA já apareceu numa planilha de outro lote? → { lote, data, ... } ou null
export function jaEnviada(hist, paId, loteAtual) {
  const h = hist.pas[String(paId)];
  return h && h.lote !== loteAtual ? h : null;
}

// Registra as PAs entregues. Se a PA já estava registrada, mantém o lote e a data da primeira aparição.
export function registrarNoHistorico(base, itens) {
  const h = lerHistorico(base);
  for (const it of itens) {
    const id = String(it.paId);
    const antes = h.pas[id];
    h.pas[id] = antes ? { ...antes, ...it, lote: antes.lote, data: antes.data } : { ...it };
  }
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(`${arquivo(base)}.tmp`, JSON.stringify(h, null, 1));
  fs.renameSync(`${arquivo(base)}.tmp`, arquivo(base));
  return Object.keys(h.pas).length;
}
