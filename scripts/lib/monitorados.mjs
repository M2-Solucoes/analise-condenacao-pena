// Lista de advogados monitorados da Vivo — modelo "RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL",
// aba "Lista Advs". Colunas (2026-11-11): NOME, ESTADO, REGIÃO DE ATUAÇÃO, OAB PRINCIPAL, SITUAÇÃO (na OAB),
// OAB SUPLEMENTAR, LISTA (data de entrada), SITUAÇÃO (ATIVO/INATIVO, a última). Só ATIVO conta.
import ExcelJS from 'exceljs';
import { extrairOABs } from './textos.mjs';

export const normNome = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
const valor = (c) => (c && typeof c === 'object' ? (c.text ?? c.result ?? (c.richText ? c.richText.map((r) => r.text).join('') : '')) : c);

export async function carregarLista(arquivo) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arquivo);
  const ws = wb.getWorksheet('Lista Advs') || wb.worksheets.find((w) => w.rowCount > 0);
  if (!ws) throw new Error('a planilha de advogados monitorados não tem a aba "Lista Advs"');
  const cab = ws.getRow(1).values.slice(1).map((v) => normNome(valor(v)));
  const iNome = cab.indexOf('NOME');
  const iOab = cab.indexOf('OAB PRINCIPAL');
  const iSup = cab.indexOf('OAB SUPLEMENTAR');
  const iSit = cab.lastIndexOf('SITUACAO');
  if ([iNome, iOab, iSup, iSit].some((i) => i < 0)) throw new Error(`a planilha de monitorados mudou de modelo: colunas ${cab.join(', ')}`);
  const lista = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = row.values.slice(1).map(valor);
    const nome = String(v[iNome] ?? '').trim();
    if (!nome) return;
    lista.push({
      nome, nomeNorm: normNome(nome),
      oabs: [...extrairOABs(v[iOab]), ...extrairOABs(v[iSup])],
      ativo: normNome(v[iSit]) === 'ATIVO',
      situacao: String(v[iSit] ?? '').trim(),
    });
  });
  return lista;
}

// advogados: [{ nome, oabs: [{uf, numero}] }] → { resultado: 'Sim'|'Não'|'', via, detalhe, obs }
export function comparar(advogados, lista) {
  if (!advogados?.length) return { resultado: '', via: '', detalhe: '', obs: 'advogado da parte autora não identificado' };
  const porOab = new Map(); const porNome = new Map();
  for (const a of lista) {
    // a mesma OAB pode aparecer em mais de uma entrada (ativa e inativa): vale a ativa
    for (const o of a.oabs) { const k = `${o.uf}${o.numero}`; if (!porOab.has(k) || (!porOab.get(k).ativo && a.ativo)) porOab.set(k, a); }
    if (a.nomeNorm.split(' ').length >= 2) (porNome.get(a.nomeNorm) || porNome.set(a.nomeNorm, []).get(a.nomeNorm)).push(a);
  }
  const achados = [];
  for (const adv of advogados) {
    let hit = null; let via = '';
    for (const o of adv.oabs || []) { const a = porOab.get(`${o.uf}${o.numero}`); if (a) { hit = a; via = 'OAB'; break; } }
    if (!hit) {
      const n = normNome(adv.nome);
      if (n.split(' ').length >= 2) {
        const cands = porNome.get(n) || [];
        if (cands.length) { hit = cands.find((c) => c.ativo) || cands[0]; via = 'nome'; }
      }
    }
    if (hit) achados.push({ adv, hit, via });
  }
  const ativo = achados.find((x) => x.hit.ativo);
  if (ativo) {
    return {
      resultado: 'Sim', via: ativo.via, detalhe: `${ativo.hit.nome} (${ativo.hit.situacao})`,
      obs: ativo.via === 'nome' ? 'advogado encontrado pelo nome, sem OAB: conferir' : '',
    };
  }
  const inativo = achados[0];
  if (inativo) return { resultado: 'Não', via: inativo.via, detalhe: `${inativo.hit.nome} (INATIVO)`, obs: 'advogado consta como INATIVO na lista da Vivo' };
  const curtos = advogados.every((a) => normNome(a.nome).split(' ').length < 2 && !(a.oabs || []).length);
  if (curtos) return { resultado: '', via: '', detalhe: '', obs: 'nome do advogado curto demais para comparar (sem OAB)' };
  return { resultado: 'Não', via: '', detalhe: '', obs: '' };
}
