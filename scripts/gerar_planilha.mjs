// Passo 4: monta a planilha final a partir do relatório original. Preenche as colunas que o relatório já traz
// vazias (má-fé, ofício, sentença justa, advogado monitorado, adv. da parte autora), acrescenta as colunas de
// apoio e a aba "Resumo".
//   node scripts/gerar_planilha.mjs --lote <pasta> --monitorados <RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL.xlsx>
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { argumentos, pastas, lerControle, hojeBR } from './lib/lote.mjs';
import { carregarLista, comparar, normNome } from './lib/monitorados.mjs';
import { extrairOABs } from './lib/textos.mjs';
import { respostaValida, lerItem } from './lib/ia.mjs';

const a = argumentos();
if (!a.lote || !a.monitorados) { console.log('uso: node scripts/gerar_planilha.mjs --lote <pasta> --monitorados <xlsx da Vivo>'); process.exit(1); }
const lote = path.resolve(a.lote);
const P = pastas(lote);
const ctl = lerControle(lote);
const lista = await carregarLista(a.monitorados);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join(lote, ctl.origem.arquivo));
const ws = wb.worksheets[0];
const C = ctl.origem.colunas;
const linhaCab = ctl.origem.linhaCabecalho;

const APOIO = ['Má-fé · detalhe', 'Ofício · detalhe', 'Interpor recurso (PA)', 'Advogado · fonte', 'Pasta do processo', 'Situação da linha', 'Observações'];
const ultima = ws.getRow(linhaCab).cellCount;
const A = Object.fromEntries(APOIO.map((t, i) => [t, ultima + 1 + i]));
const cabRow = ws.getRow(linhaCab);
const estiloCab = cabRow.getCell(C.processo).style;
for (const [t, i] of Object.entries(A)) { const c = cabRow.getCell(i); c.value = t; c.style = estiloCab; ws.getColumn(i).width = t === 'Observações' || t.includes('detalhe') ? 60 : 24; }
cabRow.commit?.();

const fmtAdv = (x) => `${x.nome}${x.oabs?.length ? ` (${x.oabs.map((o) => `OAB/${o.uf} ${o.numero}`).join(', ')})` : ''}`;
const cont = { linhas: ctl.linhas.length, concluidas: 0, conferir: 0, falha: 0, pendente: 0, sentenca: 0, acordao: 0, documentos: 0, soDispositivo: 0, maFe: 0, oficio: 0, justa: 0, injusta: 0, recursoBranco: 0, monitorado: 0, advNaoIdentificado: 0 };
const ocorrencias = [];

for (const l of ctl.linhas) {
  const row = ws.getRow(l.linha);
  const set = (col, v) => { row.getCell(col).value = v; };
  const obs = [...(l.obs || [])];
  let situacao;

  if (l.situacao === 'falha') { situacao = `Falha: ${l.motivo}`; cont.falha++; ocorrencias.push([l.n, l.processo, l.motivo, l.tentativas >= 3 ? 'parada para verificação depois de 3 tentativas' : 'será tentada de novo na próxima execução']); }
  else if (l.situacao === 'conferir') { situacao = 'Conferir'; cont.conferir++; ocorrencias.push([l.n, l.processo, obs.join('; '), 'linha marcada para conferência; nenhuma PA foi escolhida']); }
  else if (l.situacao !== 'coletada') { situacao = 'Pendente'; cont.pendente++; }
  else {
    if (/ACORD/i.test(l.pa?.resultado || '')) cont.acordao++; else cont.sentenca++;
    cont.documentos += (l.documentos || []).length;
    if (l.fonteDecisao === 'dispositivo') cont.soDispositivo++;
    // IA: má-fé e ofício
    const fIa = path.join(P.ia, `${l.n}.json`);
    let ia = null;
    if (fs.existsSync(fIa)) { try { ia = JSON.parse(fs.readFileSync(fIa, 'utf8')); if (!respostaValida(ia).ok) ia = null; } catch { ia = null; } }
    if (ia) {
      const mf = lerItem(ia.ma_fe, 'má-fé'); const of = lerItem(ia.oficio, 'ofício');
      set(C.maFe, mf.resposta); set(C.oficio, of.resposta);
      set(A['Má-fé · detalhe'], mf.detalhe); set(A['Ofício · detalhe'], of.detalhe);
      if (mf.conferir) obs.push(mf.conferir); if (of.conferir) obs.push(of.conferir);
      if (mf.resposta === 'Sim') cont.maFe++; if (of.resposta === 'Sim') cont.oficio++;
    } else obs.push('sem resposta da IA para má-fé e ofício');
    // sentença justa pelo Interpor Recurso da PA
    const rec = String(l.pa?.interporRecurso || '').trim();
    set(A['Interpor recurso (PA)'], rec || '(em branco)');
    if (/^n[aã]o$/i.test(rec)) { set(C.justa, 'Sim'); cont.justa++; }
    else if (/^sim$/i.test(rec)) { set(C.justa, 'Não'); cont.injusta++; }
    else { obs.push('recurso não informado na PA'); cont.recursoBranco++; }
    // advogado da parte autora: eLaw, cabeçalho da decisão e leitura da IA
    const fontes = [];
    const advs = [];
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
    const precisaConferir = obs.some((o) => /conferir|d[uú]vida|sem trecho|sem resposta|só pelo dispositivo/i.test(o));
    situacao = precisaConferir ? 'Concluída · conferir' : 'Concluída';
    cont.concluidas++; if (precisaConferir) cont.conferir++;
  }
  set(A['Situação da linha'], situacao);
  set(A['Observações'], obs.join('; '));
  row.commit?.();
}

// Aba Resumo
const ex = wb.getWorksheet('Resumo'); if (ex) wb.removeWorksheet(ex.id);
const r = wb.addWorksheet('Resumo');
r.getColumn(1).width = 46; r.getColumn(2).width = 22; r.getColumn(3).width = 70; r.getColumn(4).width = 50;
const per = ctl.periodo ? `${ctl.periodo.de} a ${ctl.periodo.ate}` : 'relatório recebido à mão';
const frase = `Período ${per}: ${cont.linhas} linha(s) no relatório; ${cont.concluidas} concluída(s), ${cont.conferir} para conferir, ${cont.falha} com falha e ${cont.pendente} ainda pendente(s).`;
const linhasResumo = [
  ['Resumo', frase], [],
  ['Números', ''],
  ['Linhas no relatório (células Vivo e Vivo ES)', cont.linhas],
  ['PAs de sentença analisadas', cont.sentenca], ['PAs de acórdão analisadas', cont.acordao],
  ['Documentos baixados', cont.documentos], ['Analisadas só pelo dispositivo (sem inteiro teor no eLaw)', cont.soDispositivo],
  ['Litigância de má-fé = Sim', cont.maFe], ['Expedição de ofício = Sim', cont.oficio],
  ['Sentença justa = Sim', cont.justa], ['Sentença justa = Não', cont.injusta], ['Recurso em branco na PA', cont.recursoBranco],
  ['Advogado monitorado = Sim', cont.monitorado], ['Advogado da parte autora não identificado', cont.advNaoIdentificado],
  ['Linhas para conferir', cont.conferir], ['Linhas com falha', cont.falha], ['Linhas pendentes', cont.pendente], [],
  ['Ocorrências', ''], ['Linha', 'Processo', 'O que aconteceu', 'O que o robô fez'],
  ...ocorrencias,
];
for (const v of linhasResumo) r.addRow(v);
r.getRow(1).font = { bold: true }; r.getRow(3).font = { bold: true }; r.getRow(linhasResumo.findIndex((x) => x[0] === 'Ocorrências') + 1).font = { bold: true };

const saida = a.saida ? path.resolve(a.saida) : path.join(P.planilhas, `Análise de Condenações - Vivo e Vivo ES - ${hojeBR()}.xlsx`);
await wb.xlsx.writeFile(saida);
console.log(frase);
console.log(`Má-fé Sim: ${cont.maFe} · Ofício Sim: ${cont.oficio} · Sentença justa Sim/Não/branco: ${cont.justa}/${cont.injusta}/${cont.recursoBranco} · Monitorado Sim: ${cont.monitorado}`);
console.log(`Planilha: ${saida}`);
