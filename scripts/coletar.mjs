// Passo 2: para cada linha pendente, acha o processo e a PA no eLaw, lê "Interpor Recurso ?", baixa os
// documentos para Processos/<número do processo>/, separa o texto da decisão para a IA e lê o advogado.
// Só leitura no eLaw. Retoma de onde parou.
//   node scripts/coletar.mjs --lote <pasta> [--limite 20] [--linhas 3,7,9 [--refazer]] [--refazer-falhas]
import fs from 'node:fs';
import path from 'node:path';
import { conectar, garantirLogado } from './lib/sessao.mjs';
import { buscarProcessoPorNpc, listarPAs, lerPA, listarDocumentosProcesso, baixarDocumento, lerAdvogadoAdverso, ultimoValorNoHistorico, norm, soDigitos } from './lib/elaw.mjs';
import { extrairTexto, textoParaIA, advogadosDoCabecalho, extrairOABs } from './lib/textos.mjs';
import { argumentos, pastas, lerControle, gravarControle, nomeSeguro, dataISO } from './lib/lote.mjs';

const a = argumentos();
if (!a.lote) { console.log('uso: node scripts/coletar.mjs --lote <pasta> [--limite N] [--linhas 1,2] [--refazer-falhas]'); process.exit(1); }
const lote = path.resolve(a.lote);
const P = pastas(lote);
const ctl = lerControle(lote);
const MAX_TENT = 3;

const escolhidas = a.linhas ? new Set(String(a.linhas).split(',').map(Number)) : null;
// --refazer (só com --linhas): reprocessa as linhas indicadas mesmo já coletadas
let fila = ctl.linhas.filter((l) => (escolhidas ? escolhidas.has(l.n) : true) &&
  ((a.refazer && escolhidas) || l.situacao === 'pendente' || (l.situacao === 'falha' && (a['refazer-falhas'] || l.tentativas < MAX_TENT))));
if (a.limite) fila = fila.slice(0, Number(a.limite));
if (!fila.length) { console.log('Nada a coletar neste lote.'); process.exit(0); }

// Acórdãos não entram nesta planilha (definido pelo escritório em 11/11/2026).
const RESULTADOS_PA = /^SENTENCA$/;
const DECISAO = /INTEIRO TEOR|DECISAO INTEGRAL|^ACORDAO|^SENTENCA/;
const dias = (a1, b1) => Math.abs((new Date(a1) - new Date(b1)) / 86400000);

function salvar(pastaProc, nomeBase, doc, conteudo) {
  const ext = (doc.extensao || path.extname(doc.nome || '') || '.pdf').replace(/^\.?/, '.').toLowerCase();
  const arq = path.join(pastaProc, nomeSeguro(`${nomeBase}${ext}`));
  if (!fs.existsSync(arq)) fs.writeFileSync(arq, conteudo);
  return arq;
}

const { browser, page } = await conectar();
let feitas = 0; let falhas = 0; let conferir = 0;
try {
  await garantirLogado(page);
  console.log(`Coletando ${fila.length} linha(s) do lote ${path.basename(lote)}…`);
  for (const l of fila) {
    const rot = `Linha ${l.n} · ${l.processo || l.pastas}`;
    l.obs = [];
    try {
      let proc; let pa = null; let detalhe = null;
      if (l.paId) {
        // Modo padrão (v1.1): a PA veio do relatório "PA'S- Análise de Recurso" — vai direto ao detalhe dela.
        detalhe = await lerPA(page, l.paId);
        const c0 = detalhe.campos;
        const datas = [dataISO(c0['Data da Publicação']), ...detalhe.documentos.map((x) => dataISO(x.dataPublicacao))].filter(Boolean);
        if (l.dataPublicacao && datas.length && !datas.includes(l.dataPublicacao)) {
          // o processo tem outra sentença no Análise de Condenações: esta linha não é a da PA em análise
          l.situacao = 'descartada'; l.motivo = `linha de outra sentença do mesmo processo (publicação ${l.dataPublicacao}; a PA ${l.paId} é de ${datas[0]})`;
          console.log(`${rot}: descartada — ${l.motivo}`);
          gravarControle(lote, ctl);
          continue;
        }
        pa = { id: l.paId, resultado: c0['Resultado PA'] || 'Sentença', status: c0.Status || '' };
        if (!RESULTADOS_PA.test(norm(pa.resultado))) throw new Error(`a PA ${l.paId} não é de sentença (${pa.resultado})`);
        if (!/AN[AÁ]LISE/i.test(norm(pa.status))) l.obs.push(`a PA saiu da Análise de Recurso antes da coleta (status ${pa.status || '?'})`);
        proc = { id: detalhe.processoId || l.processoIdElaw, numero: l.processo };
        if (!proc.id) throw new Error(`a PA ${l.paId} não mostrou o link do processo`);
      } else {
        // Modo por período (--todas-do-periodo): acha o processo pela pasta e a PA pela data de publicação.
        proc = await buscarProcessoPorNpc(page, l.pastas);
        if (l.processo && soDigitos(proc.numero) && soDigitos(proc.numero) !== soDigitos(l.processo)) {
          throw new Error(`a pasta ${l.pastas} leva ao processo ${proc.numero}, diferente do relatório`);
        }
        const pas = (await listarPAs(page, proc.id)).filter((p) => RESULTADOS_PA.test(norm(p.resultado)));
        for (const cand of pas) {
          const d = await lerPA(page, cand.id);
          const datas = [dataISO(d.campos['Data da Publicação']), ...d.documentos.map((x) => dataISO(x.dataPublicacao))].filter(Boolean);
          if (l.dataPublicacao && datas.includes(l.dataPublicacao)) { pa = cand; detalhe = d; break; }
        }
        if (!pa) {
          l.situacao = 'conferir'; conferir++;
          l.obs.push(pas.length ? `nenhuma PA de sentença com a publicação de ${l.dataPublicacao || '(sem data)'} (${pas.length} PA(s) no processo)` : 'o processo não tem PA de sentença');
          console.log(`${rot}: CONFERIR — ${l.obs.at(-1)}`);
          gravarControle(lote, ctl);
          continue;
        }
      }
      l.processoId = proc.id;
      const c = detalhe.campos;
      l.pa = {
        id: pa.id, resultado: pa.resultado, status: c.Status || pa.status || '',
        interporRecurso: c['Interpor Recurso ?'] ?? '', vaiEmbargar: c['Vai Embargar ?'] ?? '',
        // sugestão do escritório: campo do relatório (se houver) ou, na PA, a última alteração no histórico
        sugestaoDispensa: l.sugestaoDispensa || ultimoValorNoHistorico(detalhe.historico, /Sugest[aã]o Dispensa Recursal/i),
        tipoAnalise: c['Tipo de análise *'] || c['Tipo de análise'] || '',
        dataPublicacao: dataISO(c['Data da Publicação']) || l.dataPublicacao, descricao: c['Descrição da Sentença'] || c['Descrição da Decisão'] || '',
      };
      // 3. documentos da PA (os dois quadros)
      const pastaProc = path.join(P.processos, nomeSeguro(l.processo || proc.numero || l.pastas));
      fs.mkdirSync(pastaProc, { recursive: true });
      const tipoPA = 'Sentença';
      const vistos = new Set(); l.documentos = [];
      for (const doc of detalhe.documentos) {
        if (vistos.has(doc.id)) continue; vistos.add(doc.id);
        const r = await baixarDocumentoComRetentativa(page, doc.id);
        const arq = salvar(pastaProc, `${tipoPA} - ${l.pa.dataPublicacao || 'sem data'} - ${doc.tipo || doc.nome || 'Documento'} - ${doc.id}`, doc, r.conteudo);
        const t = /\.pdf$/i.test(arq) ? extrairTexto(arq) : { paginas: [], caracteres: 0 };
        l.documentos.push({ id: doc.id, tipo: doc.tipo, quadro: doc.quadro, arquivo: path.relative(lote, arq), caracteres: t.caracteres, paginas: t.paginas.length, origem: 'PA' });
      }
      // 4. decisão de inteiro teor: o documento da PA que não é a publicação, com mais texto
      let decisao = l.documentos.filter((d) => !/PUBLICA/.test(norm(d.tipo))).sort((x, y) => y.caracteres - x.caracteres)[0];
      if (!decisao || decisao.caracteres < 2500) {
        const ref = l.pa.dataPublicacao || l.dataPublicacao;
        const docsProc = (await listarDocumentosProcesso(page, proc.id)).filter((d) => DECISAO.test(norm(d.tipo)) && !/PUBLICA/.test(norm(d.tipo)) && !vistos.has(d.id))
          .filter((d) => { const dt = dataISO(d.dataPublicacao) || dataISO(d.criacao); return !ref || !dt || dias(dt, ref) <= 15; })
          .slice(0, 3);
        for (const doc of docsProc) {
          vistos.add(doc.id);
          const r = await baixarDocumentoComRetentativa(page, doc.id);
          const arq = salvar(pastaProc, `${tipoPA} - ${l.pa.dataPublicacao || 'sem data'} - ${doc.tipo} (processo) - ${doc.id}`, doc, r.conteudo);
          const t = /\.pdf$/i.test(arq) ? extrairTexto(arq) : { paginas: [], caracteres: 0 };
          l.documentos.push({ id: doc.id, tipo: doc.tipo, quadro: 'Documentos do processo', arquivo: path.relative(lote, arq), caracteres: t.caracteres, paginas: t.paginas.length, origem: 'processo' });
        }
        const melhor = l.documentos.filter((d) => !/PUBLICA/.test(norm(d.tipo))).sort((x, y) => y.caracteres - x.caracteres)[0];
        if (melhor && melhor.caracteres >= 2500) decisao = melhor;
        else if (melhor && melhor.caracteres < 200 && melhor.paginas > 0) decisao = melhor; // digitalizado: a IA lê a imagem
        else decisao = null;
      }
      // 5. texto para a IA
      const cab = `LINHA ${l.n} | PROCESSO ${l.processo} | PA ${pa.id} (${tipoPA}) | PUBLICAÇÃO ${l.pa.dataPublicacao || '?'}`;
      let paginas = [];
      if (decisao) {
        const t = extrairTexto(path.join(lote, decisao.arquivo));
        paginas = t.paginas;
        l.fonteDecisao = decisao.origem === 'processo' ? 'decisão integral do processo' : 'inteiro teor da PA';
        l.arquivoDecisao = decisao.arquivo;
        const corpo = t.caracteres < 200
          ? `${cab}\nFONTE: ${l.fonteDecisao}\nPDF SEM TEXTO (digitalizado): leia o arquivo ${path.join(lote, decisao.arquivo)} como imagem.`
          : textoParaIA(paginas, `${cab}\nFONTE: ${l.fonteDecisao} (${decisao.arquivo})`);
        fs.writeFileSync(path.join(P.textos, `${l.n}.txt`), corpo);
      } else {
        l.fonteDecisao = 'dispositivo';
        l.obs.push('analisada só pelo dispositivo: o eLaw não tem a decisão de inteiro teor');
        fs.writeFileSync(path.join(P.textos, `${l.n}.txt`), `${cab}\nFONTE: só o dispositivo (o eLaw não tem o inteiro teor)\n\n=== DISPOSITIVO (relatório) ===\n${l.dispositivo}\n\n=== DESCRIÇÃO NA PA ===\n${l.pa.descricao}\n`);
      }
      l.texto = path.join('textos', `${l.n}.txt`);
      // 6. advogado da parte autora
      const adv = await lerAdvogadoAdverso(page, proc.id);
      l.advogados = {
        elaw: adv.advogado ? { nome: adv.advogado, oabs: extrairOABs(adv.advogado) } : null,
        cabecalho: advogadosDoCabecalho(paginas),
      };
      l.situacao = 'coletada'; l.coletadaEm = new Date().toISOString(); feitas++;
      console.log(`${rot}: ok — PA ${pa.id} (${l.pa.status || tipoPA}; sugestão de dispensa: ${l.pa.sugestaoDispensa || 'sem registro'}; recurso: ${l.pa.interporRecurso || 'em branco'}) · ${l.documentos.length} documento(s) · decisão: ${l.fonteDecisao} · advogado: ${l.advogados.elaw ? 'eLaw' : ''}${l.advogados.cabecalho.length ? `${l.advogados.elaw ? ' + ' : ''}decisão` : ''}${!l.advogados.elaw && !l.advogados.cabecalho.length ? 'não achado (a IA procura)' : ''}`);
    } catch (e) {
      if (e.code === 'SESSAO') { gravarControle(lote, ctl); throw e; }
      l.situacao = 'falha'; l.tentativas = (l.tentativas || 0) + 1; l.motivo = e.message; falhas++;
      console.log(`${rot}: FALHA (tentativa ${l.tentativas}) — ${e.message}`);
    }
    gravarControle(lote, ctl);
  }
} catch (e) {
  if (e.code === 'SESSAO') {
    console.log(`PAROU: ${e.message}. Depois do login, rode o mesmo comando: ele continua da linha em que parou.`);
    process.exitCode = 3;
  } else throw e;
} finally {
  browser.disconnect();
  const t = ctl.linhas.reduce((m, l) => ((m[l.situacao] = (m[l.situacao] || 0) + 1), m), {});
  console.log(`\nNesta execução: ${feitas} coletada(s), ${conferir} para conferir, ${falhas} falha(s). No lote: ${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(' · ')}.`);
}

async function baixarDocumentoComRetentativa(pg, id) {
  let ultimo;
  for (let i = 0; i < 3; i++) {
    try { return await baixarDocumento(pg, id); } catch (e) { if (e.code === 'SESSAO') throw e; ultimo = e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
  throw new Error(`falha no download do documento ${id} depois de 3 tentativas (${ultimo.message})`);
}
