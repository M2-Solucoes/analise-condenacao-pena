// Texto das decisões (pdftotext, página a página) e leitura dos advogados no cabeçalho.
import { execFileSync } from 'node:child_process';

// → { paginas: [texto], caracteres }. PDF sem camada de texto (digitalizado) volta com caracteres ~0.
export function extrairTexto(arquivoPdf) {
  let saida = '';
  try {
    saida = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', arquivoPdf, '-'], { maxBuffer: 200 * 1024 * 1024 }).toString('utf8');
  } catch { return { paginas: [], caracteres: 0, erro: 'pdftotext não conseguiu ler o arquivo' }; }
  const paginas = saida.split('\f');
  if (paginas.length && !paginas[paginas.length - 1].trim()) paginas.pop();
  const caracteres = paginas.reduce((a, p) => a + p.replace(/\s/g, '').length, 0);
  return { paginas, caracteres };
}

export function textoParaIA(paginas, cabecalho) {
  return [cabecalho, ...paginas.map((p, i) => `\n=== PÁGINA ${i + 1} ===\n${p}`)].join('\n');
}

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

// Inscrições da OAB num texto livre → [{ uf, numero }] (número só com dígitos, sem zeros à esquerda).
// Aceita "OAB/MG 123.456", "123.456 OAB/MG", "OAB MG123456", "MG 12345/O", "OAB/MG nº 1.234".
export function extrairOABs(texto) {
  const s = ` ${String(texto ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `.replace(/\bOAB\b/g, ' ');
  const out = []; const visto = new Set();
  const add = (uf, num) => {
    const n = String(num).replace(/\D/g, '').replace(/^0+/, '');
    if (!UFS.has(uf) || n.length < 3 || n.length > 7) return;
    const k = `${uf}${n}`; if (!visto.has(k)) { visto.add(k); out.push({ uf, numero: n }); }
  };
  // UF antes do número: "MG 123.456", "MG123456", "MG nº 1.234", "MG n.º 12.345", "MG A1234"
  for (const m of s.matchAll(/\b([A-Z]{2})\s*[-\/:]?\s*(?:N\.?[O°º]?\.?\s*)?[A-Z]?(\d[\d.]{2,9})(?![\d])/g)) add(m[1], m[2]);
  // número antes da UF: "123.456 MG", "123.456/MG", "12345/O MG", "12345/A /MG", "123-A MG"
  for (const m of s.matchAll(/(\d[\d.]{2,9})\s*(?:[-\/]\s*[A-Z](?![A-Z]))?\s*[-\/]?\s*([A-Z]{2})\b/g)) add(m[2], m[1]);
  return out;
}

const TELEFONICA = /TELEF[OÔ]NICA|\bVIVO\b|TELESP|\bGVT\b|TELEFONICA/i;
// Papéis do polo ativo no quadro do PJe. Corréus (RÉU/RÉ) têm advogados próprios e NÃO entram.
const POLO_ATIVO = /^(AUTOR|AUTORA|REQUERENTE|EXEQUENTE|RECLAMANTE|IMPETRANTE|EMBARGANTE)\b/;

// Quadro "Partes / Advogados" do cabeçalho do PJe (mapeado em 2026-11-11): a parte termina com o papel entre
// parênteses — "(AUTOR)", "(RÉU/RÉ)"… —, às vezes na LINHA SEGUINTE ao nome quando o nome é longo; os
// advogados dela vêm logo abaixo, com "(ADVOGADO)". Devolve só os advogados das partes do polo ativo.
export function advogadosDoCabecalho(paginas) {
  const linhas = (paginas[0] || '').split('\n').concat((paginas[1] || '').split('\n').slice(0, 40));
  const i0 = linhas.findIndex((l) => /\bPartes\b.*\bAdvogad/i.test(l));
  if (i0 < 0) return [];
  const advogados = []; let parte = null; let pendente = ''; let vazias = 0;
  for (const l of linhas.slice(i0 + 1, i0 + 80)) {
    if (!l.trim()) { if (++vazias >= 2 && (advogados.length || parte)) break; continue; }
    vazias = 0;
    const casos = [...l.matchAll(/([^()]*?)\s*\(([^()]+)\)/g)];
    if (!casos.length) {
      if (/PODER JUDICI|Documento assinado|SENTEN[ÇC]A|DECIS[ÃA]O|AC[ÓO]RD[ÃA]O|Vistos/i.test(l) && (advogados.length || parte)) break;
      pendente = `${pendente} ${l}`.replace(/\s+/g, ' ').trim(); // nome da parte que continua na próxima linha
      continue;
    }
    for (const m of casos) {
      const papel = m[2].replace(/\s+/g, ' ').trim().toUpperCase();
      const nome = (m[1].replace(/\s+/g, ' ').trim() || pendente).trim();
      if (/^ADVOGAD/.test(papel)) {
        if (nome && parte && POLO_ATIVO.test(parte.papel) && !TELEFONICA.test(parte.nome)) advogados.push({ nome, oabs: extrairOABs(l), parte: parte.papel });
      } else {
        parte = { nome: `${pendente} ${m[1]}`.replace(/\s+/g, ' ').trim() || nome, papel };
        pendente = '';
      }
    }
  }
  return advogados;
}
