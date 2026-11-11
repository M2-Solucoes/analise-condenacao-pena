// Passo 3 (preparação): separa as linhas coletadas que ainda não têm resposta da IA em lotes para os subagentes.
//   node scripts/ia_lotes.mjs --lote <pasta> [--tamanho 8]
// Cada subagente lê references/prompts.md e grava ia/<n>.json para cada linha do seu lote.
import fs from 'node:fs';
import path from 'node:path';
import { argumentos, pastas, lerControle } from './lib/lote.mjs';
import { respostaValida } from './lib/ia.mjs';

const a = argumentos();
if (!a.lote) { console.log('uso: node scripts/ia_lotes.mjs --lote <pasta> [--tamanho 8]'); process.exit(1); }
const lote = path.resolve(a.lote);
const P = pastas(lote);
const ctl = lerControle(lote);
const tam = Number(a.tamanho || 8);

const pend = ctl.linhas.filter((l) => l.situacao === 'coletada').filter((l) => {
  const f = path.join(P.ia, `${l.n}.json`);
  if (!fs.existsSync(f)) return true;
  try { return !respostaValida(JSON.parse(fs.readFileSync(f, 'utf8'))).ok; } catch { return true; }
});
const lotes = [];
for (let i = 0; i < pend.length; i += tam) lotes.push(pend.slice(i, i + tam).map((l) => l.n));
fs.writeFileSync(path.join(P.ia, 'lotes.json'), JSON.stringify(lotes));
if (!lotes.length) { console.log('Todas as linhas coletadas já têm resposta válida da IA.'); process.exit(0); }
console.log(`${pend.length} linha(s) para a IA, em ${lotes.length} lote(s) de até ${tam}:`);
lotes.forEach((ls, i) => console.log(`  lote ${i + 1}: linhas ${ls.join(', ')}`));
console.log(`\nTextos em ${P.textos}/<linha>.txt; respostas em ${P.ia}/<linha>.json.`);
