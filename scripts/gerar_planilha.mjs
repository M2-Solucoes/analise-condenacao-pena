// Passo 4: monta as planilhas do lote — UMA POR CÉLULA, Vivo e Vivo ES (pedido do escritório em 12/11/2026) — a partir
// do Análise de Condenações exportado. Cada planilha traz só as PAs da célula analisadas neste lote, preenche as
// colunas que o relatório traz vazias, acrescenta as colunas de apoio e a aba "Resumo", e registra as PAs no
// controle de carga (_historico.json): uma PA que saiu numa planilha não aparece de novo nos dias seguintes.
//   node scripts/gerar_planilha.mjs --lote <pasta> --monitorados <RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL.xlsx>
//                                   [--sem-historico] [--pasta-saida <pasta>]
//
// Entra na planilha (e no controle de carga) só a linha analisada: coletada no eLaw e lida pela IA. Linha com falha,
// não coletada ou sem leitura da IA fica fora, aparece nas ocorrências do Resumo e volta na próxima execução. Assim,
// "apareceu na planilha" e "registrada no controle de carga" são sempre a mesma coisa.
//
// Regras (escopo v1.1):
//   - Litigância de má-fé: "Sim" só com condenação expressa; indícios, advertências e menções só no detalhe.
//   - Sentença justa/injusta: "Justa" / "Injusta" pela sugestão de dispensa recursal do escritório e pelo
//     "Interpor Recurso ?" da PA (ver sentencaJusta em lib/ia.mjs).
//   - Advogado monitorado: OAB primeiro, nome completo depois; só ATIVO conta.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { argumentos, pastas, lerControle, hojeBR } from './lib/lote.mjs';
import { carregarLista, comparar, normNome } from './lib/monitorados.mjs';
import { extrairOABs } from './lib/textos.mjs';
import { respostaValida, lerItem, sentencaJusta } from './lib/ia.mjs';
import { registrarNoHistorico } from './lib/historico.mjs';

const a = argumentos();
if (!a.lote || !a.monitorados) { console.log('uso: node scripts/gerar_planilha.mjs --lote <pasta> --monitorados <xlsx da Vivo> [--sem-historico] [--pasta-saida <pasta>]'); process.exit(1); }
const lote = path.resolve(a.lote);
const nomeLote = path.basename(lote);
const P = pastas(lote);
const ctl = lerControle(lote);
const base = ctl.base || path.dirname(lote);
const rec = ctl.origem?.recurso;
const ORDEM = ['Vivo', 'Vivo ES'];

const doLote = ctl.linhas.filter((l) => l.situacao !== 'descartada');
if (!doLote.length && !(ctl.semLinha || []).length) {
  console.log(`Lote ${nomeLote}: nenhuma PA nova${rec?.jaEnviadas ? ` (${rec.jaEnviadas} PA(s) já enviada(s) em dias anteriores continuam em Análise de Recurso)` : ''}. Nenhuma planilha gerada.`);
  process.exit(0);
}
const lista = await carregarLista(a.monitorados);

// Análise de Condenações original: cabeçalho e linhas a copiar
const orig = new ExcelJS.Workbook();
await orig.xlsx.readFile(path.join(lote, ctl.origem.arquivo));
const wo = orig.worksheets[0];
const C = ctl.origem.colunas;
const linhaCab = ctl.origem.linhaCabecalho;
const nCols = wo.getRow(linhaCab).cellCount;

// leitura da IA de cada linha coletada; só a linha coletada E lida pela IA entra na planilha
const lerIA = (l) => {
  const f = path.join(P.ia, `${l.n}.json`);
  if (!fs.existsSync(f)) return null;
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return respostaValida(j).ok ? j : null; } catch { return null; }
};
for (const l of doLote) l.ia = l.situacao === 'coletada' ? lerIA(l) : null;
const entregue = (l) => l.situacao === 'coletada' && !!l.ia;

// célula: vem do relatório de Análise de Recurso. No modo por período o Análise de Condenações não traz a célula, e as
// linhas vão juntas numa planilha "Vivo e Vivo ES".
const JUNTAS = 'Vivo e Vivo ES';
const celulaDe = (x) => String(x?.celula || '').trim() || JUNTAS;
const ordem = (c) => (ORDEM.includes(c) ? ORDEM.indexOf(c) : 99);
const celulas = [...new Set([...doLote, ...(ctl.semLinha || [])].map(celulaDe))].sort((x, y) => ordem(x) - ordem(y) || x.localeCompare(y));

const APOIO = ['Má-fé · detalhe', 'Ofício · detalhe', 'Sugestão dispensa recursal (PA)', 'Interpor recurso (PA)', 'Status e tipo de análise (PA)', 'Sentença justa · motivo', 'Advogado · fonte', 'Pasta do processo', 'Situação da linha', 'Observações'];
const fmtAdv = (x) => `${x.nome}${x.oabs?.length ? ` (${x.oabs.map((o) => `OAB/${o.uf} ${o.numero}`).join(', ')})` : ''}`;
const fmtSug = (v) => (/^true$/i.test(v) ? 'Sim' : /^false$/i.test(v) ? 'Não' : v || '(sem registro)');
const brData = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10).split('-').reverse().join('/') : String(iso || ''));
// valor do campo de advogado que indica parte sem advogado (já normalizado por normNome: sem acento, maiúsculo)
const SEM_ADVOGADO = /^(ATERMACAO|ATERMADO|SEM ADVOGADO|PARTE SEM ADVOGADO|JUS POSTULANDI)$/;
const VOLTA ='fora da planilha e do controle de carga; entra de novo na próxima execução';

async function montar(celula) {
  const linhas = doLote.filter((l) => celulaDe(l) === celula);
  const naPlanilha = linhas.filter(entregue);
  const fora = linhas.filter((l) => !entregue(l));
  const semLinha = (ctl.semLinha || []).filter((p) => celulaDe(p) === celula);
  const anteriores = (rec?.anteriores || []).filter((p) => celulaDe(p) === celula);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(wo.name || 'Análise de Condenações');
  for (let i = 1; i <= nCols; i++) ws.getColumn(i).width = wo.getColumn(i).width || 18;
  const copiarLinha = (de, para) => {
    const src = wo.getRow(de); const dst = ws.getRow(para);
    for (let i = 1; i <= nCols; i++) { const c = src.getCell(i); dst.getCell(i).value = c.value; dst.getCell(i).style = { ...c.style }; }
    dst.height = src.height;
  };
  copiarLinha(linhaCab, 1);
  naPlanilha.forEach((l, i) => copiarLinha(l.linha, i + 2));
  const A = Object.fromEntries(APOIO.map((t, i) => [t, nCols + 1 + i]));
  const cabRow = ws.getRow(1);
  const estiloCab = cabRow.getCell(C.processo).style;
  for (const [t, i] of Object.entries(A)) { const c = cabRow.getCell(i); c.value = t; c.style = { ...estiloCab }; ws.getColumn(i).width = /detalhe|Observa|motivo/.test(t) ? 60 : 26; }

  const cont = { conferir: 0, documentos: 0, soDispositivo: 0, maFe: 0, maFeIndicios: 0, oficio: 0, justa: 0, injusta: 0, justaBranco: 0, monitorado: 0, advNaoIdentificado: 0, semAdvogado: 0 };
  const ocorrencias = [];
  const paraHistorico = [];

  naPlanilha.forEach((l, i) => {
    const row = ws.getRow(i + 2);
    const set = (col, v) => { row.getCell(col).value = v; };
    const obs = [...(l.obs || [])];
    const ia = l.ia;
    cont.documentos += (l.documentos || []).length;
    if (l.fonteDecisao === 'dispositivo') cont.soDispositivo++;
    // IA: má-fé (só condenação expressa) e ofício
    const mf = lerItem(ia.ma_fe, 'má-fé'); const of = lerItem(ia.oficio, 'ofício');
    set(C.maFe, mf.resposta); set(C.oficio, of.resposta);
    set(A['Má-fé · detalhe'], mf.detalhe); set(A['Ofício · detalhe'], of.detalhe);
    if (mf.conferir) obs.push(mf.conferir); if (of.conferir) obs.push(of.conferir);
    if (mf.resposta === 'Sim') cont.maFe++; else if (mf.detalhe) cont.maFeIndicios++;
    if (of.resposta === 'Sim') cont.oficio++;
    // sentença justa/injusta
    const sug = l.pa?.sugestaoDispensa || ''; const recurso = String(l.pa?.interporRecurso || '').trim();
    set(A['Sugestão dispensa recursal (PA)'], fmtSug(sug));
    set(A['Interpor recurso (PA)'], recurso || '(em branco)');
    set(A['Status e tipo de análise (PA)'], [l.pa?.status, l.pa?.tipoAnalise].filter(Boolean).join(' · '));
    const sj = sentencaJusta(sug, recurso);
    set(C.justa, sj.valor); set(A['Sentença justa · motivo'], sj.motivo);
    if (sj.valor === 'Justa') cont.justa++; else if (sj.valor === 'Injusta') cont.injusta++; else cont.justaBranco++;
    if (sj.conferir) obs.push(`sentença justa: ${sj.motivo}`);
    // advogado da parte autora: eLaw, cabeçalho da decisão e leitura da IA
    // "ATERMAÇÃO" (e equivalentes) no eLaw quer dizer que a parte entrou sem advogado (Juizado): não é nome de
    // advogado. Sem nenhum advogado nas outras fontes, a linha fica "Não" e "sem advogado (atermação)" (27/11/2026).
    const fontes = []; const advs = []; let semAdvogado = '';
    const add = (x, fonte) => { if (!x?.nome) return; if (SEM_ADVOGADO.test(normNome(x.nome))) { semAdvogado ||= fonte; return; } const k = normNome(x.nome); const ja = advs.find((y) => normNome(y.nome) === k); if (ja) { for (const o of x.oabs || []) if (!ja.oabs.some((p) => p.uf === o.uf && p.numero === o.numero)) ja.oabs.push(o); } else advs.push({ nome: x.nome.trim(), oabs: [...(x.oabs || [])] }); if (!fontes.includes(fonte)) fontes.push(fonte); };
    if (l.advogados?.elaw) add(l.advogados.elaw, 'eLaw (Advogado Adverso)');
    for (const x of l.advogados?.cabecalho || []) add(x, 'cabeçalho da decisão');
    for (const x of ia.advogados_parte_autora || []) add({ nome: x.nome, oabs: extrairOABs(x.oab) }, 'leitura da decisão pela IA');
    if (!advs.length && semAdvogado) {
      set(C.monitorado, 'Não');
      set(C.advAutora, 'Sem advogado (atermação)');
      set(A['Advogado · fonte'], `${semAdvogado}: atermação; a decisão não cita advogado da parte autora`);
      cont.semAdvogado++;
    } else {
      const comp = comparar(advs, lista);
      set(C.monitorado, comp.resultado);
      set(C.advAutora, advs.map(fmtAdv).join('; '));
      set(A['Advogado · fonte'], [fontes.join(' + '), comp.via && `comparado por ${comp.via}`, comp.detalhe && `lista: ${comp.detalhe}`].filter(Boolean).join(' · '));
      if (comp.obs) obs.push(comp.obs);
      if (semAdvogado) obs.push('o eLaw indica atermação, mas a decisão cita advogado da parte autora');
      if (comp.resultado === 'Sim') cont.monitorado++;
      if (!advs.length) cont.advNaoIdentificado++;
    }
    const pastaDocs = l.documentos?.length ? path.dirname(path.join(lote, l.documentos[0].arquivo)) : '';
    set(A['Pasta do processo'], pastaDocs ? `${pastaDocs} (${l.documentos.length} documento(s))` : 'nenhum documento na PA');
    const precisaConferir = obs.some((o) => /conferir|d[uú]vida|sem trecho|sem resposta|só pelo dispositivo|conflito|sem sugest|saiu da An/i.test(o));
    if (precisaConferir) cont.conferir++;
    set(A['Situação da linha'], precisaConferir ? 'Concluída · conferir' : 'Concluída');
    set(A['Observações'], obs.join('; '));
    if (l.paId) paraHistorico.push({ paId: String(l.paId), lote: nomeLote, data: hojeBR(), processo: l.processo, celula: l.celula || '' });
  });

  // linhas que não entraram na planilha: voltam na próxima execução
  for (const l of fora) {
    if (l.situacao === 'falha') ocorrencias.push([l.n, l.processo, `falha na coleta: ${l.motivo}`, VOLTA]);
    else if (l.situacao === 'conferir') ocorrencias.push([l.n, l.processo, (l.obs || []).join('; '), 'fora da planilha; nenhuma PA foi escolhida (conferir no eLaw)']);
    else if (l.situacao === 'coletada') ocorrencias.push([l.n, l.processo, 'a decisão não foi lida pela IA', VOLTA]);
    else ocorrencias.push([l.n, l.processo, 'linha não coletada (a execução parou antes)', VOLTA]);
  }
  for (const p of semLinha) ocorrencias.push(['—', p.processo, `PA ${p.paId} em Análise de Recurso sem linha no Análise de Condenações`, VOLTA]);

  // Aba Resumo
  const r = wb.addWorksheet('Resumo');
  r.getColumn(1).width = 58; r.getColumn(2).width = 26; r.getColumn(3).width = 70; r.getColumn(4).width = 60;
  const rc = rec?.porCelula?.[celula];
  const quando = ctl.modo === 'periodo' && ctl.periodo ? `período ${ctl.periodo.de} a ${ctl.periodo.ate}` : `lote ${nomeLote}`;
  const frase = `${celula} · ${quando}: ${naPlanilha.length} PA(s) na planilha${cont.conferir ? `, ${cont.conferir} para conferir` : ''}${fora.length + semLinha.length ? `; ${fora.length + semLinha.length} fora da planilha (voltam na próxima execução)` : ''}${anteriores.length ? `; ${anteriores.length} já enviada(s) em dias anteriores, não repetida(s)` : ''}.`;
  const linhasResumo = [
    ['Resumo', frase], [],
    ['Números', ''],
    ...(rec ? [
      [`PAs em Análise de Recurso (${celula})`, rc?.naEtapa ?? '—'], ['  de sentença', rc?.sentencas ?? '—'],
      ['  já enviadas em planilhas de dias anteriores (não repetidas)', rc?.jaEnviadas ?? anteriores.length],
      ['  sem resultado preenchido (fora)', rc?.semResultado ?? '—'], ['  novas neste lote', rc?.novas ?? '—'],
      ['PAs sem linha no Análise de Condenações', semLinha.length],
    ] : []),
    ['Linhas na planilha', naPlanilha.length], ['Linhas fora da planilha (voltam na próxima execução)', fora.length + semLinha.length],
    ['Documentos baixados', cont.documentos], ['Analisadas só pelo dispositivo (sem inteiro teor no eLaw)', cont.soDispositivo],
    ['Litigância de má-fé = Sim (condenação expressa)', cont.maFe], ['Má-fé: só indícios ou menções (no detalhe)', cont.maFeIndicios], ['Expedição de ofício = Sim', cont.oficio],
    ['Sentença justa = Justa', cont.justa], ['Sentença justa = Injusta', cont.injusta], ['Sentença justa em branco (conferir)', cont.justaBranco],
    ['Advogado monitorado = Sim', cont.monitorado], ['Parte autora sem advogado (atermação)', cont.semAdvogado], ['Advogado da parte autora não identificado', cont.advNaoIdentificado],
    ['Linhas para conferir', cont.conferir], [],
    ['Ocorrências', ''], ['Linha', 'Processo', 'O que aconteceu', 'O que o robô fez'],
    ...(ocorrencias.length ? ocorrencias : [['—', '', 'nenhuma', '']]), [],
    ['Controle de carga', ''], ['PA', 'Processo', 'Saiu na planilha de', 'Hoje'],
    ...(anteriores.length
      ? anteriores.map((p) => [p.paId, p.processo, brData(p.enviadaEm), rec?.incluiuAnteriores ? 'reprocessada (--incluir-anteriores)' : 'continua em Análise de Recurso; não repetida'])
      : [['—', '', 'nenhuma PA já enviada continua em Análise de Recurso', '']]),
  ];
  for (const v of linhasResumo) r.addRow(v);
  for (const t of ['Resumo', 'Números', 'Ocorrências', 'Controle de carga']) { const i = linhasResumo.findIndex((x) => x[0] === t); if (i >= 0) r.getRow(i + 1).font = { bold: true }; }

  const dir = a['pasta-saida'] ? path.resolve(a['pasta-saida']) : P.planilhas;
  fs.mkdirSync(dir, { recursive: true });
  const saida = path.join(dir, `Análise de Condenações - ${celula} - ${nomeLote}.xlsx`);
  await wb.xlsx.writeFile(saida);
  return { celula, saida, cont, frase, paraHistorico, naPlanilha: naPlanilha.length };
}

const resultados = [];
for (const cel of celulas) resultados.push(await montar(cel));

const paraHistorico = resultados.flatMap((x) => x.paraHistorico);
if (!a['sem-historico'] && paraHistorico.length) {
  const total = registrarNoHistorico(base, paraHistorico);
  console.log(`Controle de carga: ${paraHistorico.length} PA(s) registradas como enviadas (${total} no total). Elas não aparecem de novo nos próximos dias.`);
}
for (const x of resultados) {
  console.log(x.frase);
  console.log(`  Má-fé Sim: ${x.cont.maFe} (indícios só no detalhe: ${x.cont.maFeIndicios}) · Ofício Sim: ${x.cont.oficio} · Sentença Justa/Injusta/branco: ${x.cont.justa}/${x.cont.injusta}/${x.cont.justaBranco} · Monitorado Sim: ${x.cont.monitorado}`);
  console.log(`  Planilha: ${x.saida}`);
}
if (!celulas.includes(JUNTAS)) for (const cel of ORDEM.filter((c) => !celulas.includes(c))) console.log(`${cel}: nenhuma PA nova neste lote; sem planilha.`);
