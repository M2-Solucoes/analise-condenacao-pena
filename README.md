# analise-condenacao-pena

Skill do Claude para o robô diário de análise da condenação do Pena Carvalho, carteira Vivo (escopo v1.1).

Todo dia, o robô:
- pega no eLaw as PAs de sentença das células Vivo e Vivo ES em "Análise de Recurso" (etapa de dispensa recursal), pelo relatório "PA'S- Análise de Recurso";
- deixa de fora as que já saíram numa planilha de dia anterior: cada PA aparece uma vez só (controle de carga, em `_historico.json`);
- busca as linhas delas no relatório "Análise de Condenações";
- abre cada PA, lê a sugestão de dispensa recursal e o "Interpor Recurso ?" e baixa a decisão para uma pasta por número de processo;
- preenche as colunas que o relatório traz vazias:
  - litigância de má-fé (só condenação expressa);
  - expedição de ofício;
  - sentença justa/injusta;
  - advogado bloqueado/monitorado;
  - adv. da parte autora;
- gera uma planilha por célula, uma da Vivo e outra da Vivo ES.

Tudo roda no computador de quem executa, pelo Claude, sem servidor nem M2 Hub. O passo a passo para o Claude está em [SKILL.md](SKILL.md). Os prompts e o formato da resposta da IA estão em [references/prompts.md](references/prompts.md).

## Instalação

```bash
npm install
ln -s "$PWD" "<pasta de skills do Claude>/analise-condenacao-pena"
```

Também é preciso ter o Google Chrome, o `pdftotext` (poppler) e o Node 20 ou mais novo.

## Scripts

| Script | O que faz |
|---|---|
| `scripts/sessao.mjs` | Abre a janela do Chrome do robô (perfil em `~/.cache/analise-condenacao-chrome`), espera o login e fecha |
| `scripts/exportar.mjs` | Monta o lote do dia (`--diario`): PAs de sentença em Análise de Recurso, sem as que já saíram numa planilha anterior, e as linhas delas no Análise de Condenações |
| `scripts/coletar.mjs` | Processo, PA, Interpor Recurso, documentos, texto da decisão e advogado, linha a linha; retoma de onde parou |
| `scripts/ia_lotes.mjs` | Separa as linhas para os subagentes de IA |
| `scripts/gerar_planilha.mjs` | Monta uma planilha por célula, com colunas de apoio e aba Resumo, e registra as PAs entregues no controle de carga (`_historico.json`) |

## O que nunca vai para o repositório

Lotes, PDFs, planilhas, a lista de monitorados da Vivo e o perfil do Chrome. O `.gitignore` cobre `*.xlsx`, `*.pdf` e `lotes/`. Os lotes ficam em `~/Projetos Claude/Análise de Condenações/`.

## Origem

O escopo v1.0 é de 11/11/2026 e está no repositório de marca da M2, em `proposal-template/pena-robo-analise-condenacao/`. Telas e regras foram mapeadas no eLaw do Pena Carvalho no mesmo dia.
