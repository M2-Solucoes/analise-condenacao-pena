// Passo 4: monta a planilha do lote a partir do Análise de Condenações exportado. Traz SÓ as linhas do lote (no
// modo diário, as PAs de sentença em Análise de Recurso), preenche as colunas que o relatório traz vazias,
// acrescenta as colunas de apoio e a aba "Resumo", e registra as PAs no histórico (para não repetir amanhã).
//   node scripts/gerar_planilha.mjs --lote <pasta> --monitorados <RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL.xlsx> [--sem-historico]
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
if (!a.lote || !a.monitorados) { console.log('uso: node scripts/gerar_planilha.mjs --lote <pasta> --monitorados <xlsx da Vivo> [--sem-historico]'); process.exit(1); }
const lote = path.resolve(a.lote);
const P = pastas(lote);
const ctl = lerControle(lote);
const lista = await carregarLista(a.monitorados);
const base = ctl.base || path.dirname(lote);

// Planilha nova: cabeçalho do Análise de Condenações + só as linhas do lote (sem as descartadas), na ordem do lote.
const orig = new ExcelJS.Workbook();
await orig.xlsx.readFile(path.join(lote, ctl.origem.arquivo));
const wo = orig.worksheets[0];
const C = ctl.origem.colunas;
const linhaCab = ctl.origem.linhaCabecalho;
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet(wo.name || 'Análise de Condenações');
const nCols = wo.getRow(linhaCab).cellCount;
for (let i = 1; i <= nCols; i++) ws.getColumn(i).width = wo.getColumn(i).width || 18;
const copiarLinha = (de, para) => {
  const src = wo.getRow(de); const dst = ws.getRow(para);
  for (let i = 1; i <= nCols; i++) { const c = src.getCell(i); dst.getCell(i).value = c.value; dst.getCell(i).style = { ...c.style }; }
  dst.height = src.height;
};
copiarLinha(linhaCab, 1);
const doLote = ctl.linhas.filter((l) => l.situacao !== 'descartada');
doLote.forEach((l, i) => copiarLinha(l.linha, i + 2));

const APOIO = ['Má-fé · detalhe', 'Ofício · detalhe', 'Sugestão dispensa recursal (PA)', 'Interpor recurso (PA)', 'Status e tipo de análise (PA)', 'Sentença justa · motivo', 'Advogado · fonte', 'Pasta do processo', 'Situação da linha', 'Observações'];
const A = Object.fromEntries(APOIO.map((t, i) => [t, nCols + 1 + i]));
const cabRow = ws.getRow(1);
const estiloCab = cabRow.getCell(C.processo).style;
for (const [t, i] of Object.entries(A)) { const c = cabRow.getCell(i); c.value = t; c.style = { ...estiloCab }; ws.getColumn(i).width = /detalhe|Observa|motivo/.test(t) ? 60 : 26; }

const fmtAdv = (x) => `${x.nome}${x.oabs?.length ? ` (${x.oabs.map((o) => `OAB/${o.uf} ${o.numero}`).join(', ')})` : ''}`;
const fmtSug = (v) => (/^true$/i.test(v) ? 'Sim' : /^false$/i.test(v) ? 'Não' : v || '(sem registro)');
const cont = { linhas: doLote.length, concluidas: 0, conferir: 0, falha: 0, pendente: 0, documentos: 0, soDispositivo: 0, maFe: 0, maFeIndicios: 0, oficio: 0, justa: 0, injusta: 0, justaBranco: 0, monitorado: 0, advNaoIdentificado: 0 };
const ocorrencias = [];
const paraHistorico = [];

doLote.forEach((l, i) => {
  const row = ws.getRow(i + 2);
  const set = (col, v) => { row.getCell(col).value = v; };
  const obs = [...(l.obs || [])];
  let situacao;

  if (l.situacao === 'falha') { situacao = `Falha: ${l.motivo}`; cont.falha++; ocorrencias.push([l.n, l.processo, l.motivo, l.tentativas >= 3 ? 'parada para verificação depois de 3 tentativas' : 'será tentada de novo na próxima execução']); }
  else if (l.situacao === 'conferir') { situacao = 'Conferir'; cont.conferir++; ocorrencias.push([l.n, l.processo, obs.join('; '), 'linha marcada para conferência; nenhuma PA foi escolhida']); }
  else if (l.situacao !== 'coletada') { situacao = 'Pendente'; cont.pendente++; }
  else {
    cont.documentos += (l.documentos || []).length;
    if (l.fonteDecisao === 'dispositivo') cont.soDispositivo++;
    // IA: má-fé (só condenação expressa) e ofício
    const fIa = path.join(P.ia, `${l.n}.json`);
    let ia = null;
    if (fs.existsSync(fIa)) { try { ia = JSON.parse(fs.readFileSync(fIa, 'utf8')); if (!respostaValida(ia).ok) ia = null; } catch { ia = null; } }
    if (ia) {
      const mf = lerItem(ia.ma_fe, 'má-fé'); const of = lerItem(ia.oficio, 'ofício');
      set(C.maFe, mf.resposta); set(C.oficio, of.resposta);
      set(A['Má-fé · detalhe'], mf.detalhe); set(A['Ofício · detalhe'], of.detalhe);
      if (mf.conferir) obs.push(mf.conferir); if (of.conferir) obs.push(of.conferir);
      if (mf.resposta === 'Sim') cont.maFe++; else if (mf.detalhe) cont.maFeIndicios++;
      if (of.resposta === 'Sim') cont.oficio++;
    } else obs.push('sem resposta da IA para má-fé e ofício');
    // sentença justa/injusta
    const sug = l.pa?.sugestaoDispensa || ''; const rec = String(l.pa?.interporRecurso || '').trim();
    set(A['Sugestão dispensa recursal (PA)'], fmtSug(sug));
    set(A['Interpor recurso (PA)'], rec || '(em branco)');
    set(A['Status e tipo de análise (PA)'], [l.pa?.status, l.pa?.tipoAnalise].filter(Boolean).join(' · '));
    const sj = sentencaJusta(sug, rec);
    set(C.justa, sj.valor); set(A['Sentença justa · motivo'], sj.motivo);
    if (sj.valor === 'Justa') cont.justa++; else if (sj.valor === 'Injusta') cont.injusta++; else cont.justaBranco++;
    if (sj.conferir) obs.push(`sentença justa: ${sj.motivo}`);
    // advogado da parte autora: eLaw, cabeçalho da decisão e leitura da IA
    const fontes = []; const advs = [];
    const add = (x, fonte) => { if (!x?.nome) return; const k = normNome(x.nome); const ja = advs.find((y) => normNome(y.nome) === k); if (ja) { for (const o of x.oabs || []) if (!ja.oabs.some((p) => p.uf === o.uf && p.numero === o.numero)) ja.oabs.push(o); } else advs.push({ nome: x.nome.trim(), oabs: [...(x.oabs || [])] }); if (!fontes.includes(fonte)) fontes.push(fonte); };
    if (l.advogados?.elaw) add(l.advogados.elaw, 'eLaw (Advogado Adverso)');
    for (const x of l.advogados?.cabecalho || []) add(x, 'cabeçalho da decisão');
    for (const x of ia?.advogados_parte_autora || []) add({ nome: x.nome, oabs: extrairOABs(x.oab) }, 'leitura da decisão pela IA');
    const comp = comparar(advs, lista);
    set(C.monitorado, comp.resultado);
    set(C.advAutora, advs.map(fmtAdv).join('; '));
    set(A['Advogado · fonte'], [fontes.join(' + '), comp.via && `comparado por ${comp.via}`, comp.detalhe && `lista: ${comp.detalhe}`].filter(Boolean).join(' · '));
    if (comp.obs) obs.push(comp.obs);
    if (comp.resultado === 'Sim') cont.monitorado++;
    if (!advs.length) cont.advNaoIdentificado++;
    const pastaDocs = l.documentos?.length ? path.dirname(path.join(lote, l.documentos[0].arquivo)) : '';
    set(A['Pasta do processo'], pastaDocs ? `${pastaDocs} (${l.documentos.length} documento(s))` : 'nenhum documento na PA');
    const precisaConferir = obs.some((o) => /conferir|d[uú]vida|sem trecho|sem resposta|só pelo dispositivo|conflito|sem sugest|saiu da An/i.test(o));
    situacao = precisaConferir ? 'Concluída · conferir' : 'Concluída';
    cont.concluidas++; if (precisaConferir) cont.conferir++;
    if (l.paId && ia) paraHistorico.push({ paId: String(l.paId), lote: path.basename(lote), data: hojeBR(), processo: l.processo });
  }
  set(A['Situação da linha'], situacao);
  set(A['Observações'], obs.join('; '));
});

// Aba Resumo
const r = wb.addWorksheet('Resumo');
r.getColumn(1).width = 52; r.getColumn(2).width = 24; r.getColumn(3).width = 70; r.getColumn(4).width = 50;
const rec = ctl.origem?.recurso;
const quando = ctl.modo === 'periodo' && ctl.periodo ? `Período ${ctl.periodo.de} a ${ctl.periodo.ate}` : `Lote ${path.basename(lote)} (PAs de sentença em Análise de Recurso)`;
const frase = `${quando}: ${cont.linhas} linha(s); ${cont.concluidas} concluída(s), ${cont.conferir} para conferir, ${cont.falha} com falha e ${cont.pendente} pendente(s).`;
const linhasResumo = [
  ['Resumo', frase], [],
  ['Números', ''],
  ...(rec ? [
    ['PAs em Análise de Recurso (Vivo e Vivo ES)', rec.naEtapa], ['  de sentença', rec.sentencas], ['  já analisadas em dias anteriores (fora deste lote)', rec.jaAnalisadas],
    ['  sem resultado preenchido (fora)', rec.semResultado], ['PAs sem linha no Análise de Condenações', (ctl.semLinha || []).length],
  ] : []),
  ['Linhas analisadas', cont.linhas], ['Documentos baixados', cont.documentos], ['Analisadas só pelo dispositivo (sem inteiro teor no eLaw)', cont.soDispositivo],
  ['Litigância de má-fé = Sim (condenação expressa)', cont.maFe], ['Má-fé: só indícios ou menções (no detalhe)', cont.maFeIndicios], ['Expedição de ofício = Sim', cont.oficio],
  ['Sentença justa = Justa', cont.justa], ['Sentença justa = Injusta', cont.injusta], ['Sentença justa em branco (conferir)', cont.justaBranco],
  ['Advogado monitorado = Sim', cont.monitorado], ['Advogado da parte autora não identificado', cont.advNaoIdentificado],
  ['Linhas para conferir', cont.conferir], ['Linhas com falha', cont.falha], ['Linhas pendentes', cont.pendente], [],
  ['Ocorrências', ''], ['Linha', 'Processo', 'O que aconteceu', 'O que o robô fez'],
  ...ocorrencias,
  ...(ctl.semLinha || []).map((p) => ['—', p.processo, `PA ${p.paId} em Análise de Recurso sem linha no Análise de Condenações`, 'fora da planilha; conferir no eLaw']),
];
for (const v of linhasResumo) r.addRow(v);
for (const t of ['Resumo', 'Números', 'Ocorrências']) { const i = linhasResumo.findIndex((x) => x[0] === t); if (i >= 0) r.getRow(i + 1).font = { bold: true }; }

const saida = a.saida ? path.resolve(a.saida) : path.join(P.planilhas, `Análise de Condenações - Vivo e Vivo ES - ${path.basename(lote)}.xlsx`);
await wb.xlsx.writeFile(saida);
if (!a['sem-historico'] && paraHistorico.length) {
  const total = registrarNoHistorico(base, paraHistorico);
  console.log(`Histórico: ${paraHistorico.length} PA(s) registradas como analisadas (${total} no total).`);
}
console.log(frase);
console.log(`Má-fé Sim: ${cont.maFe} (indícios só no detalhe: ${cont.maFeIndicios}) · Ofício Sim: ${cont.oficio} · Sentença Justa/Injusta/branco: ${cont.justa}/${cont.injusta}/${cont.justaBranco} · Monitorado Sim: ${cont.monitorado}`);
console.log(`Planilha: ${saida}`);
