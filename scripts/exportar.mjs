// Passo 1: exporta o relatório "Análise de Condenações" (células Vivo e Vivo ES, período de preenchimento)
// e cria o lote com o controle de cada linha.
//   node scripts/exportar.mjs --lote <pasta> --de dd/mm/aaaa --ate dd/mm/aaaa
//   node scripts/exportar.mjs --lote <pasta> --arquivo <xlsx exportado à mão>   (se a exportação automática falhar)
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { conectar } from './lib/sessao.mjs';
import { exportarRelatorio, norm } from './lib/elaw.mjs';
import { argumentos, pastas, gravarControle, dataISO, hojeBR } from './lib/lote.mjs';

const a = argumentos();
if (!a.lote || (!a.arquivo && (!a.de || !a.ate))) {
  console.log('uso: node scripts/exportar.mjs --lote <pasta> --de dd/mm/aaaa --ate dd/mm/aaaa  |  --arquivo <xlsx>');
  process.exit(1);
}
const lote = path.resolve(a.lote);
const P = pastas(lote);
if (fs.existsSync(P.controle) && !a.substituir) {
  console.log(`O lote ${lote} já existe. Para recomeçar do zero, use outra pasta ou --substituir.`);
  process.exit(1);
}
for (const d of [P.planilhas, P.processos, P.textos, P.ia]) fs.mkdirSync(d, { recursive: true });

const destino = path.join(P.planilhas, `Análise de Condenações - original - ${hojeBR()}.xlsx`);
let filtros = null; let linhasElaw = null;
if (a.arquivo) {
  fs.copyFileSync(a.arquivo, destino);
  console.log(`Relatório recebido à mão: ${path.basename(a.arquivo)}`);
} else {
  const { browser, page } = await conectar();
  try {
    console.log(`Exportando o Análise de Condenações de ${a.de} a ${a.ate} (células Vivo e Vivo ES)…`);
    const r = await exportarRelatorio(page, { de: a.de, ate: a.ate, aoProgresso: (m) => console.log(`  ${m}`) });
    fs.writeFileSync(destino, r.arquivo);
    filtros = r.filtros; linhasElaw = r.linhas;
  } catch (e) {
    console.log(`FALHA na exportação: ${e.message}`);
    console.log('Alternativa: exporte à mão no eLaw (mesmos filtros) e rode de novo com --arquivo <xlsx>.');
    process.exit(e.code === 'SESSAO' ? 3 : 2);
  } finally {
    browser.disconnect();
  }
}

// Lê a planilha: cabeçalho = linha com PASTAS e PROCESSO.
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(destino);
const ws = wb.worksheets[0];
const valor = (c) => (c && typeof c === 'object' && !(c instanceof Date) ? (c.text ?? c.result ?? (c.richText ? c.richText.map((r) => r.text).join('') : '')) : c);
let linhaCab = 0; let cab = [];
ws.eachRow((row, n) => {
  if (linhaCab) return;
  const v = row.values.slice(1).map((x) => norm(valor(x)));
  if (v.includes('PASTAS') && v.includes('PROCESSO')) { linhaCab = n; cab = v; }
});
if (!linhaCab) { console.log('A planilha não tem o cabeçalho esperado (colunas PASTAS e PROCESSO).'); process.exit(2); }
const col = (teste) => cab.findIndex((c) => teste(c)) + 1; // 1-based
const C = {
  pastas: col((c) => c === 'PASTAS'), processo: col((c) => c === 'PROCESSO'),
  dataPublicacao: col((c) => c === 'DATA PUBLICACAO'), tipoSentenca: col((c) => c === 'TIPO DE SENTENCA'),
  dispositivo: col((c) => c === 'DISPOSITIVO'), maFe: col((c) => c.includes('LITIGANCIA')), oficio: col((c) => c.includes('EXPEDICAO DE OFICIO')),
  justa: col((c) => c.startsWith('SENTENCA JUSTA')), monitorado: col((c) => c.includes('MONITORADO')), advAutora: col((c) => c.includes('PARTE AUTORA') && c.startsWith('ADV')),
};
const faltam = Object.entries(C).filter(([, i]) => i < 1).map(([k]) => k);
if (faltam.length) { console.log(`A planilha não tem as colunas: ${faltam.join(', ')}. O modelo do relatório mudou?`); process.exit(2); }

const linhas = [];
ws.eachRow((row, n) => {
  if (n <= linhaCab) return;
  const g = (i) => valor(row.getCell(i).value);
  const processo = String(g(C.processo) ?? '').trim();
  const pastasV = String(g(C.pastas) ?? '').trim();
  if (!processo && !pastasV) return;
  linhas.push({
    n: linhas.length + 1, linha: n, pastas: pastasV, processo,
    dataPublicacao: dataISO(g(C.dataPublicacao)), tipoSentenca: String(g(C.tipoSentenca) ?? '').trim(),
    dispositivo: String(g(C.dispositivo) ?? '').trim(), situacao: 'pendente', tentativas: 0, obs: [],
  });
});

gravarControle(lote, {
  versao: 1, criado: new Date().toISOString(),
  periodo: a.arquivo ? null : { de: a.de, ate: a.ate },
  origem: { arquivo: path.relative(lote, destino), filtros, linhasElaw, linhaCabecalho: linhaCab, colunas: C },
  linhas,
});
const porTipo = linhas.reduce((m, l) => ((m[l.tipoSentenca || '(sem tipo)'] = (m[l.tipoSentenca || '(sem tipo)'] || 0) + 1), m), {});
console.log(`Relatório salvo: ${path.relative(lote, destino)}`);
console.log(`${linhas.length} linhas no relatório${linhasElaw != null ? ` (o eLaw informou ${linhasElaw})` : ''}. Tipos de sentença: ${Object.entries(porTipo).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`Próximo passo: node scripts/coletar.mjs --lote "${lote}" --limite 20`);
