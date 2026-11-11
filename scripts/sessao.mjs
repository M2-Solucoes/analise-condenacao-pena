// Janela do Chrome do robô.
//   node scripts/sessao.mjs abrir           (deixar rodando em segundo plano; a pessoa faz o login na janela)
//   node scripts/sessao.mjs esperar-login   (sai quando o eLaw estiver logado; até 15 min)
//   node scripts/sessao.mjs status
//   node scripts/sessao.mjs fechar
import fs from 'node:fs';
import { abrirChrome, conectar, estaLogado, espera, ELAW, ARQ_PARAR } from './lib/sessao.mjs';

const cmd = process.argv[2];

if (cmd === 'abrir') {
  const browser = await abrirChrome();
  const [page] = await browser.pages();
  await page.goto(ELAW, { waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {});
  console.log('Janela do robô aberta no eLaw. Faça o login nela e não feche a aba.');
  const fim = Date.now() + 10 * 3600_000;
  let avisou = false;
  while (Date.now() < fim && !fs.existsSync(ARQ_PARAR) && browser.connected) {
    if (!avisou) {
      for (const p of await browser.pages().catch(() => [])) {
        if (await p.$('li.current-user').catch(() => null)) { console.log('LOGADO no eLaw.'); avisou = true; break; }
      }
    }
    await espera(3000);
  }
  await browser.close().catch(() => {});
  fs.rmSync(ARQ_PARAR, { force: true });
  console.log('Janela do robô fechada.');
} else if (cmd === 'esperar-login') {
  const fim = Date.now() + 15 * 60_000;
  for (;;) {
    try {
      const { browser, page } = await conectar();
      const ok = await page.$('li.current-user').catch(() => null);
      browser.disconnect();
      if (ok) { console.log('LOGADO'); process.exit(0); }
    } catch (e) { console.log('aguardando o Chrome do robô:', e.message); }
    if (Date.now() > fim) { console.log('TEMPO ESGOTADO: o login não foi feito em 15 minutos'); process.exit(2); }
    await espera(3000);
  }
} else if (cmd === 'status') {
  const { browser, page } = await conectar();
  console.log((await estaLogado(page)) ? 'LOGADO' : 'NÃO LOGADO: faça o login na janela do robô');
  browser.disconnect();
} else if (cmd === 'fechar') {
  fs.writeFileSync(ARQ_PARAR, '1');
  console.log('Pedido de fechamento enviado.');
} else {
  console.log('uso: node scripts/sessao.mjs abrir | esperar-login | status | fechar');
  process.exit(1);
}
