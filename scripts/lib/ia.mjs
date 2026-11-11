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
  const partesDetalhe = [];
  if (r === 'SIM') {
    const partes = tipo === 'má-fé'
      ? ['condenação expressa', item.quem && `quem: ${item.quem}`]
      : [item.destinatario && `destinatário: ${item.destinatario}`, item.finalidade && `finalidade: ${item.finalidade}`];
    partesDetalhe.push([...partes.filter(Boolean), temTrecho && `trecho (p. ${pag || '?'}): "${trecho}"`].filter(Boolean).join(' · '));
  } else if (duvida) {
    partesDetalhe.push(String(item.justificativa).trim());
  }
  // Má-fé (escopo v1.1): indícios, advertências e menções vão só para o detalhe — nunca viram "Sim" na coluna.
  if (tipo === 'má-fé' && Array.isArray(item.indicios)) {
    for (const i of item.indicios) {
      const t = String(i?.trecho ?? '').trim();
      if (!t) continue;
      partesDetalhe.push(`${i.tipo || 'indício'}${i.quem ? ` (${i.quem})` : ''}, p. ${String(i.pagina ?? '?').trim() || '?'}: "${t}"`);
    }
  }
  let conferir = '';
  if (r === 'SIM' && !temTrecho) conferir = `${tipo}: "Sim" sem trecho da decisão`;
  else if (duvida) conferir = `${tipo}: dúvida da IA`;
  return { resposta: r === 'SIM' ? 'Sim' : 'Não', detalhe: partesDetalhe.join(' | '), conferir };
}

// Sentença justa/injusta (escopo v1.1, regra do escritório): considera a sugestão do escritório pela dispensa
// recursal ("Sugestão Dispensa Recursal Pena Carvalho?", no eLaw "Is Sugestao Dispensa Recursal M T A") e o
// "Interpor Recurso ?" da PA — nenhum dos dois sozinho decide quando o outro aponta para o lado contrário.
//   sugestão Sim/True e recurso ≠ Sim  → Justa
//   recurso Sim e sugestão ≠ Sim/True  → Injusta
//   sugestão Não/False e recurso ≠ Sim → Injusta (o escritório sugere recorrer)
//   sugestão Sim e recurso Sim         → em branco, conferir (campos em conflito)
//   sem sugestão e sem recurso         → em branco, conferir
export function sentencaJusta(sugestao, recurso) {
  const sim = (v) => /^(sim|true)$/i.test(String(v ?? '').trim());
  const nao = (v) => /^(n[aã]o|false)$/i.test(String(v ?? '').trim());
  const s = sim(sugestao) ? 'S' : nao(sugestao) ? 'N' : '';
  const r = sim(recurso) ? 'S' : nao(recurso) ? 'N' : '';
  if (s === 'S' && r === 'S') return { valor: '', motivo: 'campos em conflito: sugestão de dispensa = Sim e Interpor Recurso = Sim', conferir: true };
  if (s === 'S') return { valor: 'Justa', motivo: 'sugestão do escritório pela dispensa recursal' };
  if (r === 'S') return { valor: 'Injusta', motivo: 'indicação de interposição de recurso (Interpor Recurso = Sim)' };
  if (s === 'N') return { valor: 'Injusta', motivo: 'o escritório não sugere a dispensa recursal (sugere recorrer)' };
  return { valor: '', motivo: 'sem sugestão de dispensa nem indicação de recurso na PA', conferir: true };
}
