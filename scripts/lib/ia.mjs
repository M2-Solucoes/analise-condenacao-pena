// Formato da resposta da IA por linha (ia/<n>.json) — ver references/prompts.md.
const SN = (v) => { const s = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase(); return s === 'SIM' ? 'SIM' : s === 'NAO' ? 'NÃO' : ''; };

export function respostaValida(j) {
  const erros = [];
  if (!j || typeof j !== 'object') return { ok: false, erros: ['não é um objeto'] };
  if (!SN(j?.ma_fe?.resposta)) erros.push('ma_fe.resposta deve ser SIM ou NÃO');
  if (!SN(j?.oficio?.resposta)) erros.push('oficio.resposta deve ser SIM ou NÃO');
  if (!Array.isArray(j?.advogados_parte_autora)) erros.push('advogados_parte_autora deve ser uma lista');
  return { ok: erros.length === 0, erros };
}

// → { resposta: 'Sim'|'Não', detalhe, conferir: motivo|'' }
export function lerItem(item, tipo) {
  const r = SN(item?.resposta);
  if (!r) return { resposta: '', detalhe: '', conferir: `resposta da IA para ${tipo} ausente ou inválida` };
  const trecho = String(item.trecho ?? '').trim();
  const temTrecho = trecho && !/^n[aã]o se aplica$/i.test(trecho);
  const pag = String(item.pagina ?? '').trim();
  const duvida = /^D[UÚ]VIDA:/i.test(String(item.justificativa ?? '').trim());
  let detalhe = '';
  if (r === 'SIM') {
    const partes = tipo === 'má-fé'
      ? [item.quem && `quem: ${item.quem}`, item.tipo && `tipo: ${item.tipo}`]
      : [item.destinatario && `destinatário: ${item.destinatario}`, item.finalidade && `finalidade: ${item.finalidade}`];
    detalhe = [...partes.filter(Boolean), temTrecho && `trecho (p. ${pag || '?'}): "${trecho}"`].filter(Boolean).join(' · ');
  } else if (duvida) {
    detalhe = String(item.justificativa).trim();
  }
  let conferir = '';
  if (r === 'SIM' && !temTrecho) conferir = `${tipo}: "Sim" sem trecho da decisão`;
  else if (duvida) conferir = `${tipo}: dúvida da IA`;
  return { resposta: r === 'SIM' ? 'Sim' : 'Não', detalhe, conferir };
}
