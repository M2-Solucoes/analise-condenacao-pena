// Telas do eLaw do Pena Carvalho usadas pelo robô — mapeadas em 2026-11-11 (escopo v1.0, telas reais).
//
// O QUE A SESSÃO REVELOU:
//   - o relatório é "Análise de Condenações", no MÓDULO DE RELATÓRIOS (relatorios.elawio.com.br), pasta PA,
//     relatório 62640, modelo padrão 27668 (19 colunas). O eLaw entrega a sessão ao módulo pelo formulário
//     oculto #InfoModuloRelatorio (target _blank); o robô o envia na própria aba. Filtros são mat-select do
//     Angular Material (ids gerados): o robô acha cada um pela ordem dos visíveis — [1] Célula, [4] tipo do
//     Período de Preenchimento (Data específica | Intervalo | Relativo), [5] período. O modelo padrão é
//     protegido: o robô só aplica os filtros na tela, não salva nada;
//   - as colunas de má-fé, ofício, sentença justa, advogado monitorado e adv. da parte autora chegam VAZIAS;
//     o relatório não traz tipo da PA, "Interpor Recurso" nem o id da PA;
//   - processo: busca pela pasta (NPC) na lista de processos (mesma mecânica do robô vivo-base-elaw do hub);
//   - PAs do processo: GET /pa/getListByProcesso?processoId=<id> (HTML da grade: ID, Data, Resultado, Tipo
//     Documento, Status…); detalhe em /pa/details/<idPa> (o idPa é o mesmo do PenaCarvalhoDW). No detalhe:
//     campos em <td><strong>Rótulo</strong></td><td>valor</td> ("Interpor Recurso ?", "Data da Publicação"…)
//     e os quadros "Documentos" e "Documentos Anexados", com download em /documento/download/<id>.
//     A linha do documento também tem "Excluir Documento" e "Alterar": o robô NUNCA usa esses links;
//   - "Publicação - Sentença" é só o aviso de publicação (~1 mil caracteres); a decisão completa vem como
//     "SENTENÇA INTEIRO TEOR" na PA ou, no processo, como "DECISÃO INTEGRAL" (aba Documentos, POST
//     /Documento/getListByProcesso);
//   - advogado da parte autora: campo "Advogado Adverso:" do processo (aba Geral, Dados do Cliente e Partes).
//     A aba "Partes e Advogados" não tem advogado.
import { ELAW, espera, SessaoCaiu, garantirLogado } from './sessao.mjs';

export const RELATORIO = { id: 62640, modelo: 27668, url: 'https://relatorios.elawio.com.br/reporting/reports/run/62640/27668' };

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

async function checarPaginaEstaLogada(page) {
  if (/Auth\/Login|reporting\/login/i.test(page.url())) throw new SessaoCaiu();
}

// ---------------------------------------------------------------- relatório
async function selectsVisiveis(page) {
  const out = [];
  for (const s of await page.$$('mat-select')) if (await s.evaluate((e) => e.offsetParent !== null)) out.push(s);
  return out;
}
const opcoesVisiveis = (page) => page.evaluate(() => [...document.querySelectorAll('mat-option')].filter((o) => o.offsetParent !== null).map((o) => ({ t: o.innerText.trim(), sel: o.getAttribute('aria-selected') === 'true' })));
const clicarOpcao = (page, texto) => page.evaluate((t) => { const o = [...document.querySelectorAll('mat-option')].find((x) => x.offsetParent !== null && x.innerText.trim() === t); if (o) { o.click(); return true; } return false; }, texto);
const chips = (page) => page.evaluate(() => [...document.querySelectorAll('mat-chip, .mat-mdc-chip')].map((c) => c.innerText.trim()).filter((t) => t.includes(':')));

async function passarAvisoDeNovidades(page) {
  for (let i = 0; i < 60; i++) {
    const acao = await page.evaluate(() => {
      const p = document.querySelector('.announcement-dialog-panel');
      if (!p) return 'sem-aviso';
      const bs = [...p.querySelectorAll('button')].filter((b) => !b.disabled && (b.offsetWidth || b.offsetHeight));
      const fim = bs.find((b) => b.innerText.includes('Entendi')); if (fim) { fim.click(); return 'fim'; }
      const prox = bs.find((b) => b.innerText.includes('Próxima')); if (prox) { prox.click(); return 'prox'; }
      return 'travado';
    });
    if (acao === 'sem-aviso' || acao === 'fim') return;
    if (acao === 'travado') throw new Error('o aviso "O que há de novo" do eLaw está aberto e sem botão para avançar: feche-o na janela e rode de novo');
    await espera(300);
  }
}

// Abre a pré-execução, aplica Célula = Vivo, Vivo ES e Período de Preenchimento = intervalo, exporta o Excel
// completo (não o Preview, que para em 2.000 linhas) e devolve o arquivo. de/ate: 'dd/mm/aaaa'.
export async function exportarRelatorio(page, { de, ate, aoProgresso = () => {} }) {
  await garantirLogado(page);
  await page.waitForSelector('#InfoModuloRelatorio', { timeout: 30_000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }),
    page.evaluate(() => { const f = document.querySelector('#InfoModuloRelatorio'); f.target = '_self'; f.submit(); }),
  ]);
  await checarPaginaEstaLogada(page);
  await page.goto(RELATORIO.url, { waitUntil: 'networkidle2', timeout: 60_000 });
  await checarPaginaEstaLogada(page);
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 20_000 }).catch(() => {});
  await passarAvisoDeNovidades(page);
  // começa dos filtros sugeridos (vazios no modelo padrão), descartando o que a tela lembrar
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Restaurar sugestões') && !b.disabled)?.click());
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 20_000 }).catch(() => {});

  // Célula
  let sel = await selectsVisiveis(page);
  if (sel.length < 6) throw new Error(`a pré-execução do relatório mudou (${sel.length} filtros visíveis, esperados 7)`);
  await sel[1].click(); await espera(1200);
  for (const c of ['Vivo', 'Vivo ES']) {
    const ops = await opcoesVisiveis(page);
    const o = ops.find((x) => x.t === c);
    if (!o) throw new Error(`a célula "${c}" não aparece no filtro do relatório para este usuário`);
    if (!o.sel) { await clicarOpcao(page, c); await espera(400); }
  }
  await page.keyboard.press('Escape'); await espera(800);

  // Período de Preenchimento = Intervalo
  sel = await selectsVisiveis(page);
  await sel[4].click(); await espera(1000);
  if (!(await clicarOpcao(page, 'Intervalo'))) throw new Error('o filtro de período não ofereceu "Intervalo"');
  await espera(1200);
  const datas = await preencherIntervalo(page, de, ate);
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 20_000 }).catch(() => {});

  const resumo = await chips(page);
  const chipCel = resumo.find((t) => t.startsWith('Célula:')) || '';
  const chipPer = resumo.find((t) => t.startsWith('Período de Preenchimento:')) || '';
  if (!/Vivo, Vivo ES|Vivo ES, Vivo/.test(chipCel)) throw new Error(`o filtro de célula não ficou como esperado (${chipCel || 'sem resumo'})`);
  // o resumo precisa mostrar datas; "intervalo" sozinho quer dizer que o período não foi aplicado
  if (!/\d/.test(chipPer)) throw new Error(`o filtro de período não foi aplicado (${chipPer || 'sem resumo'}; campos: ${datas.join(' a ')})`);
  aoProgresso(`filtros: ${chipCel} · ${chipPer}`);

  // Exporta: o eLaw processa em segundo plano (RunExports) e entrega o .xlsx (RunSnapshots).
  let arquivo = null; let linhas = null; let falha = null;
  const ouvir = async (resp) => {
    const u = resp.url();
    try {
      if (u.includes('/RunExports/')) {
        const j = await resp.json().catch(() => null);
        if (j?.Status === 'Completed') linhas = j.RowCount ?? null;
        if (j?.Status === 'Failed') falha = j.Error || 'sem detalhe';
      } else if (/RunSnapshots/i.test(u) && resp.request().method() === 'GET' && resp.status() === 200) {
        const buf = await resp.buffer().catch(() => null);
        if (buf && buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b) arquivo = buf; // zip (xlsx)
      }
    } catch { /* resposta já descartada */ }
  };
  page.on('response', ouvir);
  try {
    const clicou = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Exportar Excel') && !x.disabled); if (!b) return false; b.click(); return true; });
    if (!clicou) throw new Error('o botão "Exportar Excel" não está disponível na tela do relatório');
    const fim = Date.now() + 20 * 60_000;
    while (!arquivo && !falha && Date.now() < fim) { await espera(1500); }
    if (falha) throw new Error(`a exportação falhou no eLaw: ${falha}`);
    if (!arquivo) throw new Error('a exportação não terminou em 20 minutos');
    return { arquivo, linhas, filtros: { celula: chipCel, periodo: chipPer } };
  } finally {
    page.off('response', ouvir);
  }
}

// Depois de escolher "Intervalo", aparecem os campos "Início" e "Fim" (mat-datepicker, SÓ LEITURA: não aceitam
// digitação — mapeado em 2026-11-11). A data é escolhida no calendário: os dias têm aria-label
// "dd de <mês> de aaaa" e a navegação é pelos botões "Previous month" / "Next month".
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
async function escolherNoCalendario(page, botao, dataBR) {
  const [d, m, y] = dataBR.split('/').map(Number);
  if (!d || !m || !y) throw new Error(`data inválida: ${dataBR} (use dd/mm/aaaa)`);
  const alvo = `${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${y}`;
  await botao.click();
  await page.waitForSelector('mat-calendar', { timeout: 10_000 }).catch(() => { throw new Error('o calendário do filtro de período não abriu'); });
  await espera(500);
  let esperas = 0;
  for (let i = 0; i < 90; i++) {
    const r = await page.evaluate((a, alvoMes) => {
      // o último calendário visível (o overlay aberto agora); ao trocar de mês os dias são redesenhados
      const c = [...document.querySelectorAll('mat-calendar')].filter((x) => x.offsetParent !== null || x.getClientRects().length).pop();
      if (!c) return 'sem-rotulo:';
      // os rótulos podem vir com espaço inseparável: normaliza antes de comparar
      const rot = (x) => (x?.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const celulas = [...c.querySelectorAll('.mat-calendar-body-cell')];
      const cel = celulas.find((x) => rot(x) === a.toLowerCase());
      if (cel) { if (cel.getAttribute('aria-disabled') === 'true') return 'bloqueada'; cel.click(); return 'ok'; }
      // mês mostrado, pelo rótulo de um dia: "01 de novembro de 2026"
      const m1 = celulas.map((x) => /de (\S+) de (\d{4})/.exec(rot(x))).find(Boolean);
      if (!m1) return `sem-rotulo:${rot(celulas[0])}`;
      const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const atual = Number(m1[2]) * 12 + meses.indexOf(m1[1].toLowerCase());
      (alvoMes < atual ? c.querySelector('.mat-calendar-previous-button') : c.querySelector('.mat-calendar-next-button'))?.click();
      return 'navegou';
    }, alvo, y * 12 + (m - 1));
    if (r === 'ok') { await espera(600); return; }
    if (r === 'bloqueada') throw new Error(`o calendário não deixa escolher ${dataBR}`);
    if (String(r).startsWith('sem-rotulo')) {
      // dias ainda sendo desenhados: espera um pouco antes de desistir
      if (++esperas > 12) throw new Error(`o calendário do filtro de período mudou (rótulo: "${r.slice(11)}")`);
      await espera(400); continue;
    }
    await espera(350);
  }
  throw new Error(`não cheguei a ${dataBR} no calendário`);
}

async function preencherIntervalo(page, de, ate) {
  const botoes = [];
  for (const b of await page.$$('button[aria-label="Open calendar"]')) if (await b.evaluate((e) => e.offsetParent !== null)) botoes.push(b);
  if (botoes.length < 2) throw new Error(`o filtro de período não mostrou os campos Início e Fim (${botoes.length} calendário(s))`);
  await escolherNoCalendario(page, botoes[0], de);
  await escolherNoCalendario(page, botoes[1], ate);
  await page.keyboard.press('Escape').catch(() => {});
  await espera(800);
  const valores = await page.evaluate(() => [...document.querySelectorAll('input.mat-datepicker-input')].filter((i) => i.offsetParent !== null).map((i) => i.value));
  if (valores.filter(Boolean).length < 2) throw new Error(`as datas do intervalo não ficaram nos campos (Início "${valores[0] || ''}", Fim "${valores[1] || ''}")`);
  return valores;
}

// ---------------------------------------------------------------- processo
export async function buscarProcessoPorNpc(page, npc) {
  const alvo = String(npc ?? '').trim();
  if (!alvo) throw new Error('linha sem pasta (NPC)');
  await page.goto(`${ELAW}/processo/list?cache=false`, { waitUntil: 'networkidle2', timeout: 60_000 });
  if (/Auth\/Login/i.test(page.url())) throw new SessaoCaiu();
  await page.waitForSelector('#Filters_NPC', { timeout: 30_000 }).catch(() => { throw new Error('a lista de processos do eLaw não abriu'); });
  await page.click('#Filters_NPC', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#Filters_NPC', alvo);
  await page.select('#Filters_StatusId', '-1');
  await page.select('#Filters_TipoProcessoId', '1');
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.toLowerCase() === '/processo/list', { timeout: 60_000 }).catch(() => null),
    page.click('#buttonSubmit'),
  ]);
  if (!resp) throw new Error('a busca de processos do eLaw não respondeu em 60 s');
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => {});
  const linhas = await page.evaluate(() => {
    const t = [...document.querySelectorAll('table.table-hover')].find((x) => [...x.querySelectorAll('thead th')].some((th) => th.textContent.trim() === 'NPC'));
    if (!t) return /Nenhum registro localizado/i.test(document.body.innerText) ? [] : null;
    const cab = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    return [...t.querySelectorAll('tbody tr')].map((tr) => {
      const a = tr.querySelector('a[href*="/processo/details/"]');
      const m = a && /\/processo\/details\/(\d+)/.exec(a.getAttribute('href'));
      if (!m) return null;
      const desloc = tr.cells.length - cab.length;
      const cel = (n) => tr.cells[cab.indexOf(n) + desloc]?.textContent ?? '';
      return { id: m[1], npc: cel('NPC').trim(), numero: (cel('Número Processo') || cel('Número do Processo') || cel('Processo')).trim() };
    }).filter(Boolean);
  });
  if (linhas == null) throw new Error('a tabela de resultado da busca de processos não apareceu');
  const iguais = linhas.filter((l) => l.npc.replace(/\s/g, '') === alvo.replace(/\s/g, ''));
  const ids = [...new Set(iguais.map((l) => l.id))];
  if (ids.length === 0) throw new Error(`nenhum processo com a pasta ${alvo}`);
  if (ids.length > 1) throw new Error(`${ids.length} processos com a pasta ${alvo}: o robô não escolhe sozinho`);
  return iguais[0];
}

// fetch dentro da aba do eLaw (mesma sessão). Devolve texto.
async function buscarHtml(page, caminho, { metodo = 'GET', corpo = null } = {}) {
  const r = await page.evaluate(async (c, m, b) => {
    const resp = await fetch(c, { method: m, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', ...(b ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}) }, body: b });
    return { status: resp.status, url: resp.url, texto: await resp.text() };
  }, caminho, metodo, corpo);
  if (/Auth\/Login/i.test(r.url)) throw new SessaoCaiu();
  if (r.status >= 400) throw new Error(`o eLaw respondeu ${r.status} em ${caminho.split('?')[0]}`);
  return r.texto;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodificar = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const textoHtml = (h) => decodificar(String(h).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Grade HTML → [{ col: valor }] usando o cabeçalho. `extra(trHtml)` acrescenta campos.
function lerGrade(html, extra = () => ({})) {
  const tab = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  if (!tab) return [];
  const cab = [...(/<thead[^>]*>([\s\S]*?)<\/thead>/i.exec(tab)?.[1] ?? '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => textoHtml(m[1]));
  const corpo = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tab)?.[1] ?? '';
  return corpo.split(/<tr[\s>]/i).slice(1).map((tr) => {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => textoHtml(m[1]));
    const desloc = tds.length - cab.length;
    const o = {};
    cab.forEach((c, i) => { if (c) o[c] = tds[i + desloc] ?? ''; });
    return { ...o, ...extra(tr) };
  });
}

export async function listarPAs(page, processoId) {
  const html = await buscarHtml(page, `/pa/getListByProcesso?processoId=${processoId}&Direction=Descending`);
  return lerGrade(html, (tr) => ({ idDetalhe: (/\/pa\/details\/(\d+)/.exec(tr) || [])[1] || null }))
    .map((l) => ({ id: l.idDetalhe || l.ID, data: l.Data, resultado: l.Resultado, tipoDocumento: l['Tipo Documento'], status: l.Status }))
    .filter((l) => l.id);
}

// Detalhe da PA: campos (rótulo → valor), documentos dos dois quadros e o id do processo.
export async function lerPA(page, idPa) {
  await page.goto(`${ELAW}/pa/details/${idPa}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  if (/Auth\/Login/i.test(page.url())) throw new SessaoCaiu();
  if (/elawio - 500/i.test(await page.title())) throw new Error(`a PA ${idPa} não abriu no eLaw`);
  return await page.evaluate(() => {
    const campos = {};
    for (const s of document.querySelectorAll('td strong, td.column-left')) {
      const td = s.closest('td');
      const rot = (s.tagName === 'STRONG' ? s : td).textContent.trim();
      const v = td?.nextElementSibling;
      if (rot && v && !(rot in campos)) campos[rot] = v.textContent.replace(/\s+/g, ' ').trim();
    }
    const documentos = [];
    for (const t of document.querySelectorAll('table')) {
      const cab = [...t.querySelectorAll('thead th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim());
      if (!cab.includes('ID documento')) continue;
      let quadro = ''; let e = t;
      for (let i = 0; i < 12 && e && !quadro; i++) {
        let irmao = e.previousElementSibling;
        while (irmao && !quadro) { const tx = irmao.textContent.trim(); if (/^Documentos( Anexados)?$/i.test(tx)) quadro = tx; irmao = irmao.previousElementSibling; }
        e = e.parentElement;
      }
      for (const tr of t.querySelectorAll('tbody tr')) {
        const html = tr.innerHTML;
        const id = (/documento\/download\/(\d+)/.exec(html) || [])[1];
        if (!id) continue;
        const tds = [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
        const desloc = tds.length - cab.length;
        const cel = (n) => tds[cab.indexOf(n) + desloc] ?? '';
        documentos.push({ id, nome: cel('Nome'), extensao: cel('Extensão'), tipo: cel('Tipo').replace(/\s*Alterar\s*$/i, ''), dataPublicacao: cel('Data Publicação'), criacao: cel('Data/Hora de Criação'), quadro: quadro || 'Documentos' });
      }
    }
    const link = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').find((h) => /\/processo\/details\/\d+/.test(h));
    return { campos, documentos, processoId: link ? /\/processo\/details\/(\d+)/.exec(link)[1] : null };
  });
}

export async function listarDocumentosProcesso(page, processoId) {
  const docs = [];
  for (let pg = 1; pg <= 20; pg++) {
    const corpo = new URLSearchParams({ page: String(pg), 'Filters.ProcessoId': String(processoId), processoId: String(processoId) }).toString();
    const html = await buscarHtml(page, '/Documento/getListByProcesso', { metodo: 'POST', corpo });
    const linhas = lerGrade(html, (tr) => ({ idDoc: (/documento\/download\/(\d+)/.exec(tr) || [])[1] || null })).filter((l) => l.idDoc);
    if (!linhas.length) break;
    for (const l of linhas) docs.push({ id: l.idDoc, nome: l.Nome || '', extensao: l['Extensão'] || '', tipo: (l.Tipo || '').replace(/\s*Alterar\s*$/i, ''), dataPublicacao: l['Data Publicação'] || '', criacao: l['Data/Hora de Criação'] || '' });
    if (linhas.length < 50) break;
  }
  return docs;
}

// Baixa pelo endereço do documento, na sessão da aba. Nunca navega para Excluir/Alterar.
export async function baixarDocumento(page, docId) {
  if (!/penacarvalho\.elawio\.com\.br/.test(page.url())) await page.goto(`${ELAW}/telainicial`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const r = await page.evaluate(async (id) => {
    const resp = await fetch(`/documento/download/${id}`, { credentials: 'include' });
    const buf = new Uint8Array(await resp.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { status: resp.status, url: resp.url, tipo: resp.headers.get('content-type') || '', disp: resp.headers.get('content-disposition') || '', b64: btoa(bin) };
  }, String(docId));
  if (/Auth\/Login/i.test(r.url)) throw new SessaoCaiu();
  if (r.status !== 200) throw new Error(`download do documento ${docId} respondeu ${r.status}`);
  const conteudo = Buffer.from(r.b64, 'base64');
  if (/text\/html/i.test(r.tipo) && /<html/i.test(conteudo.subarray(0, 400).toString())) throw new Error(`o documento ${docId} veio como página de erro`);
  const nome = decodeURIComponent((/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(r.disp) || [])[1] || '');
  return { conteudo, nome, tipo: r.tipo };
}

export async function lerAdvogadoAdverso(page, processoId) {
  await page.goto(`${ELAW}/processo/details/${processoId}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  if (/Auth\/Login/i.test(page.url())) throw new SessaoCaiu();
  return await page.evaluate(() => {
    const val = (rot) => {
      const s = [...document.querySelectorAll('strong, td, label, span')].find((e) => e.children.length === 0 && e.textContent.trim() === rot);
      const td = s?.closest('td');
      return (td ? td.nextElementSibling : s?.nextElementSibling)?.textContent.replace(/\s+/g, ' ').trim() || '';
    };
    return { advogado: val('Advogado Adverso:'), escritorio: val('Escritório da Parte Adversa:'), parteAdversa: val('Parte Adversa:') };
  });
}

export { norm };
