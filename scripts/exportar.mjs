// Passo 1: monta o lote do dia.
//
// Padrão (escopo v1.1, pedido do escritório em 11/11/2026): só as PAs de SENTENÇA na etapa de dispensa recursal,
// com status "Análise de Recurso", das células Vivo e Vivo ES, que ainda não foram analisadas em lotes anteriores.
//   1. exporta "PA'S- Análise de Recurso" (lista as PAs nessa etapa, com o ID da PA);
//   2. exporta "Análise de Condenações" (a planilha enviada à empresa) desde o cadastro da PA mais antiga;
//   3. fica só com as linhas do Análise de Condenações dessas PAs (pelo número do processo).
//
//   node scripts/exportar.mjs --diario                      (lote em <base>/<AAAA-MM-DD>; base padrão ~/Projetos Claude/Análise de Condenações)
//   node scripts/exportar.mjs --lote <pasta> [--incluir-anteriores]
//   node scripts/exportar.mjs --lote <pasta> --arquivo-recurso <xlsx> --arquivo-condenacoes <xlsx>   (exportados à mão)
//   node scripts/exportar.mjs --lote <pasta> --todas-do-periodo --de dd/mm/aaaa --ate dd/mm/aaaa      (modo antigo, para teste)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { conectar } from './lib/sessao.mjs';
import { exportarRelatorio, RELATORIOS, norm, soDigitos } from './lib/elaw.mjs';
import { argumentos, pastas, gravarControle, dataISO, hojeBR } from './lib/lote.mjs';
import { lerHistorico } from './lib/historico.mjs';

const a = argumentos();
const base = path.resolve(a.base || path.join(os.homedir(), 'Projetos Claude', 'Análise de Condenações'));
const lote = path.resolve(a.lote || (a.diario ? path.join(base, hojeBR()) : ''));
if (!a.lote && !a.diario) {
  console.log('uso: node scripts/exportar.mjs --diario | --lote <pasta> [--incluir-anteriores] | --todas-do-periodo --de dd/mm/aaaa --ate dd/mm/aaaa');
  process.exit(1);
}
const P = pastas(lote);
if (fs.existsSync(P.controle) && !a.substituir) {
  console.log(`O lote ${lote} já existe. Para continuar, rode o coletar.mjs nele; para recomeçar do zero, use --substituir.`);
  process.exit(1);
}
for (const d of [P.planilhas, P.processos, P.textos, P.ia]) fs.mkdirSync(d, { recursive: true });

const valor = (c) => (c && typeof c === 'object' && !(c instanceof Date) ? (c.text ?? c.result ?? (c.richText ? c.richText.map((r) => r.text).join('') : '')) : c);
const brData = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
async function lerPlanilha(arquivo, teste) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arquivo);
  const ws = wb.worksheets[0]; let linhaCab = 0; let cab = []; const linhas = [];
  ws.eachRow((row, n) => {
    const v = row.values.slice(1).map(valor);
    if (!linhaCab) { const nv = v.map(norm); if (teste(nv)) { linhaCab = n; cab = nv; } return; }
    linhas.push({ n, v });
  });
  return { linhaCab, cab, linhas };
}

let conexao = null;
const sessao = async () => (conexao ||= await conectar());
async function exportar(rel, destino, opcoes = {}) {
  const { page } = await sessao();
  console.log(`Exportando ${rel.nome}…`);
  const r = await exportarRelatorio(page, { rel, ...opcoes, aoProgresso: (m) => console.log(`  ${m}`) });
  fs.writeFileSync(destino, r.arquivo);
  return r;
}

try {
  const hoje = hojeBR();
  const arqCond = path.join(P.planilhas, `Análise de Condenações - original - ${hoje}.xlsx`);
  let modo = 'analise-recurso'; let pasSelecionadas = []; let filtrosCond = null; let linhasElawCond = null; let periodo = null; let infoRecurso = null;

  if (a['todas-do-periodo']) {
    // ---- modo antigo: todas as PAs preenchidas no período
    modo = 'periodo';
    if (!a.de || !a.ate) throw new Error('--todas-do-periodo precisa de --de e --ate');
    periodo = { de: a.de, ate: a.ate };
    if (a['arquivo-condenacoes']) fs.copyFileSync(a['arquivo-condenacoes'], arqCond);
    else { const r = await exportar(RELATORIOS.condenacoes, arqCond, { de: a.de, ate: a.ate }); filtrosCond = r.filtros; linhasElawCond = r.linhas; }
  } else {
    // ---- padrão: PAs em Análise de Recurso
    const arqRec = path.join(P.planilhas, `PAs em Análise de Recurso - ${hoje}.xlsx`);
    if (a['arquivo-recurso']) fs.copyFileSync(a['arquivo-recurso'], arqRec);
    else await exportar(RELATORIOS.analiseRecurso, arqRec);
    const rec = await lerPlanilha(arqRec, (v) => v.includes('ID DA PA') && v.includes('STATUS PA'));
    if (!rec.linhaCab) throw new Error('o relatório de Análise de Recurso não tem o cabeçalho esperado (colunas ID da PA e Status PA)');
    const ci = (n) => rec.cab.indexOf(n);
    const todas = rec.linhas.map(({ v }) => ({
      paId: String(v[ci('ID DA PA')] ?? '').trim(), status: String(v[ci('STATUS PA')] ?? '').trim(), resultado: String(v[ci('RESULTADO DA PA')] ?? '').trim(),
      processo: String(v[ci('NUMERO DO PROCESSO')] ?? '').trim(), processoIdElaw: String(v[ci('ID DO PROCESSO')] ?? '').trim(), npc: String(v[ci('NPC')] ?? '').trim(),
      celula: String(v[ci('CELULA')] ?? '').trim(), cadastro: dataISO(v[ci('DATA DE CADASTRO')]),
    })).filter((x) => x.paId);
    const naEtapa = todas.filter((x) => /AN[AÁ]LISE D?E? ?RECURSO/i.test(norm(x.status)));
    const sentencas = naEtapa.filter((x) => norm(x.resultado) === 'SENTENCA');
    const hist = lerHistorico(base);
    const anteriores = sentencas.filter((x) => hist.pas[x.paId]);
    pasSelecionadas = a['incluir-anteriores'] ? sentencas : sentencas.filter((x) => !hist.pas[x.paId]);
    infoRecurso = { arquivo: path.relative(lote, arqRec), total: todas.length, naEtapa: naEtapa.length, sentencas: sentencas.length, semResultado: naEtapa.filter((x) => !x.resultado).length, jaAnalisadas: anteriores.length };
    console.log(`PAs em Análise de Recurso (Vivo e Vivo ES): ${naEtapa.length} · de sentença: ${sentencas.length}${infoRecurso.semResultado ? ` · sem resultado preenchido: ${infoRecurso.semResultado}` : ''} · já analisadas antes: ${anteriores.length}${a['incluir-anteriores'] ? ' (incluídas, --incluir-anteriores)' : ''} · novas: ${sentencas.length - anteriores.length}`);
    if (!pasSelecionadas.length) {
      gravarControle(lote, { versao: 2, modo, criado: new Date().toISOString(), base, origem: { recurso: infoRecurso }, linhas: [], semLinha: [] });
      console.log('Nenhuma PA nova para analisar hoje. O lote foi registrado vazio.');
      process.exit(0);
    }
    // Análise de Condenações desde o cadastro da PA mais antiga até hoje
    const desde = pasSelecionadas.map((x) => x.cadastro).filter(Boolean).sort()[0] || hoje;
    periodo = { de: brData(desde), ate: brData(hoje) };
    if (a['arquivo-condenacoes']) fs.copyFileSync(a['arquivo-condenacoes'], arqCond);
    else { const r = await exportar(RELATORIOS.condenacoes, arqCond, periodo); filtrosCond = r.filtros; linhasElawCond = r.linhas; }
  }

  // Análise de Condenações: cabeçalho e colunas
  const cond = await lerPlanilha(arqCond, (v) => v.includes('PASTAS') && v.includes('PROCESSO'));
  if (!cond.linhaCab) throw new Error('o Análise de Condenações não tem o cabeçalho esperado (colunas PASTAS e PROCESSO)');
  const col = (t) => cond.cab.findIndex(t) + 1;
  const C = {
    pastas: col((c) => c === 'PASTAS'), processo: col((c) => c === 'PROCESSO'), dataPublicacao: col((c) => c === 'DATA PUBLICACAO'),
    tipoSentenca: col((c) => c === 'TIPO DE SENTENCA'), dispositivo: col((c) => c === 'DISPOSITIVO'), maFe: col((c) => c.includes('LITIGANCIA')),
    oficio: col((c) => c.includes('EXPEDICAO DE OFICIO')), justa: col((c) => c.startsWith('SENTENCA JUSTA')), monitorado: col((c) => c.includes('MONITORADO')),
    advAutora: col((c) => c.includes('PARTE AUTORA') && c.startsWith('ADV')),
  };
  const faltam = Object.entries(C).filter(([, i]) => i < 1).map(([k]) => k);
  if (faltam.length) throw new Error(`o Análise de Condenações não tem as colunas: ${faltam.join(', ')}. O modelo do relatório mudou?`);
  const linhaDe = ({ n, v }) => ({
    linha: n, pastas: String(v[C.pastas - 1] ?? '').trim(), processo: String(v[C.processo - 1] ?? '').trim(),
    dataPublicacao: dataISO(v[C.dataPublicacao - 1]), tipoSentenca: String(v[C.tipoSentenca - 1] ?? '').trim(), dispositivo: String(v[C.dispositivo - 1] ?? '').trim(),
  });

  const linhas = []; const semLinha = [];
  if (modo === 'periodo') {
    for (const r of cond.linhas) { const l = linhaDe(r); if (l.processo || l.pastas) linhas.push({ n: linhas.length + 1, ...l, situacao: 'pendente', tentativas: 0, obs: [] }); }
  } else {
    const porProcesso = new Map();
    for (const r of cond.linhas) { const l = linhaDe(r); const k = soDigitos(l.processo); if (k) (porProcesso.get(k) || porProcesso.set(k, []).get(k)).push(l); }
    for (const pa of pasSelecionadas) {
      const cands = porProcesso.get(soDigitos(pa.processo)) || [];
      if (!cands.length) { semLinha.push(pa); continue; }
      // mais de uma linha do mesmo processo: o coletar confere a data de publicação da PA e descarta as outras
      for (const l of cands) linhas.push({ n: linhas.length + 1, ...l, paId: pa.paId, processoIdElaw: pa.processoIdElaw, celula: pa.celula, cadastroPA: pa.cadastro, situacao: 'pendente', tentativas: 0, obs: [] });
    }
  }

  gravarControle(lote, {
    versao: 2, modo, criado: new Date().toISOString(), base, periodo,
    origem: { arquivo: path.relative(lote, arqCond), filtros: filtrosCond, linhasElaw: linhasElawCond, linhaCabecalho: cond.linhaCab, colunas: C, recurso: infoRecurso },
    linhas, semLinha,
  });
  console.log(`Análise de Condenações${periodo ? ` (preenchimento de ${periodo.de} a ${periodo.ate})` : ''}: ${cond.linhas.length} linha(s).`);
  console.log(`Lote: ${linhas.length} linha(s) para analisar${modo === 'analise-recurso' ? ` de ${pasSelecionadas.length} PA(s)` : ''}.${semLinha.length ? ` ${semLinha.length} PA(s) sem linha no Análise de Condenações (vão para o Resumo): ${semLinha.map((x) => x.paId).join(', ')}.` : ''}`);
  console.log(`Próximo passo: node scripts/coletar.mjs --lote "${lote}"`);
} catch (e) {
  console.log(`FALHA: ${e.message}`);
  console.log('Alternativa: exporte à mão no eLaw e rode de novo com --arquivo-recurso / --arquivo-condenacoes.');
  process.exitCode = e.code === 'SESSAO' ? 3 : 2;
} finally {
  conexao?.browser.disconnect();
}
