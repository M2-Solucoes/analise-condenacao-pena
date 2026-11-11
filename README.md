# analise-condenacao-pena

Skill do Claude para o robô de análise da condenação do Pena Carvalho, carteira Vivo.

O robô:
- exporta do eLaw o relatório "Análise de Condenações", com as células Vivo e Vivo ES e o período de preenchimento;
- abre a PA de cada linha e baixa a decisão para uma pasta por número de processo;
- preenche as colunas que o relatório traz vazias: litigância de má-fé, expedição de ofício, sentença justa/injusta, advogado bloqueado/monitorado e adv. da parte autora.

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
| `scripts/exportar.mjs` | Exporta o relatório com os filtros e cria o lote (`controle.json`) |
| `scripts/coletar.mjs` | Processo, PA, Interpor Recurso, documentos, texto da decisão e advogado, linha a linha; retoma de onde parou |
| `scripts/ia_lotes.mjs` | Separa as linhas para os subagentes de IA |
| `scripts/gerar_planilha.mjs` | Monta a planilha final, com colunas de apoio e aba Resumo |

## O que nunca vai para o repositório

Lotes, PDFs, planilhas, a lista de monitorados da Vivo e o perfil do Chrome. O `.gitignore` cobre `*.xlsx`, `*.pdf` e `lotes/`. Os lotes ficam em `~/Projetos Claude/Análise de Condenações/`.

## Origem

O escopo v1.0 é de 11/11/2026 e está no repositório de marca da M2, em `proposal-template/pena-robo-analise-condenacao/`. Telas e regras foram mapeadas no eLaw do Pena Carvalho no mesmo dia.
