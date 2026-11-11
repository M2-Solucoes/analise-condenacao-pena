---
name: analise-condenacao-pena
description: Robô diário de análise da condenação do Pena Carvalho (carteira Vivo). Todo dia, pega no eLaw as PAs de sentença das células Vivo e Vivo ES que estão em "Análise de Recurso" (etapa de dispensa recursal) e ainda não foram analisadas, baixa a decisão numa pasta por número de processo e preenche, na planilha Análise de Condenações, litigância de má-fé (só condenação expressa), expedição de ofício, sentença justa/injusta (sugestão de dispensa + Interpor Recurso) e advogado monitorado (lista da Vivo), com trecho e página. Use sempre que o Pablo ou a equipe do Pena Carvalho pedirem para rodar, testar ou retomar a análise de condenações, a planilha diária de dispensa recursal ou o robô de má-fé/ofício/sentença justa/advogado monitorado, mesmo sem citar a skill. NÃO use para acórdãos, outros clientes, outros relatórios do eLaw, para preencher ou alterar PAs no eLaw, nem para peticionar.
---

# Análise de condenações · Pena Carvalho (Vivo) — execução diária

O robô entrega, por dia, a planilha "Análise de Condenações" só com as **PAs de sentença na etapa de dispensa recursal (status "Análise de Recurso")** das células Vivo e Vivo ES ainda não analisadas. Ela segue para a empresa validar a dispensa ou o recurso.

Colunas que o relatório traz vazias e o robô preenche:
- **Condenação em litigância de má-fé**: "Sim" só com condenação expressa. Indícios, advertências e menções vão para o detalhe.
- **Expedição de ofício.**
- **Sentença justa/injusta**: "Justa" ou "Injusta", pela sugestão de dispensa do escritório e pelo "Interpor Recurso ?".
- **Advogado bloqueado/monitorado**: pela lista da Vivo.
- **Adv. da parte autora.**

Junto vão colunas de apoio (trecho, página, sugestão, recurso, fonte do advogado, situação), uma aba **Resumo** e uma pasta por processo com os documentos da PA.

O escopo é `~/Projetos Claude/m2-digital-brand/proposal-template/pena-robo-analise-condenacao/`. A v1.0 é de 11/11/2026; a v1.1 incorpora os ajustes pedidos pelo escritório no mesmo dia. Se o escritório mudar uma regra, ajuste aqui e nos scripts.

## Regras fixas

- **Login é da pessoa.** O robô abre uma janela própria do Chrome, e a pessoa entra no eLaw nela. Não peça, não digite e não grave senha, código ou cookie.
- **Só leitura no eLaw.** Exportar relatórios e baixar documentos são as únicas ações. Nunca preencha, conclua ou altere PA, prazo, processo ou documento. Nunca use "Alterar" ou "Excluir Documento", nem salve ou edite modelo de relatório.
- **Sessão única.** Durante a execução, ninguém deve entrar no eLaw com o mesmo usuário em outro navegador: a sessão do robô pode cair. Se cair, os scripts param e dizem; depois do login, o mesmo comando continua de onde parou.
- **Só sentença.** Acórdãos não entram nesta planilha (definido pelo escritório).
- **Toda resposta da IA tem prova.** Um "Sim" de má-fé ou ofício precisa de trecho literal e página. Sem isso, a linha vai para "conferir".
- **Sem invenção.** Campo sem fonte fica vazio, com o motivo em Observações.
- **Dados fora do vault.** Lotes, PDFs e planilhas ficam em `~/Projetos Claude/Análise de Condenações/<AAAA-MM-DD>/` (ou na pasta que o escritório indicar), nunca no Segundo Cérebro nem no repositório da skill. O histórico das PAs analisadas fica em `…/_historico.json`.
- **Primeira execução em produção: no máximo 20 linhas**, conferidas pela equipe (`coletar.mjs --limite 20`).

## Pré-requisitos

- Node 20 ou mais novo e `npm install` feito na pasta da skill (puppeteer-core e exceljs). Também `pdftotext` (poppler) e o Google Chrome.
- Acesso ao eLaw do Pena Carvalho (`penacarvalho.elawio.com.br`) com usuário que veja as células Vivo e Vivo ES e o módulo de relatórios.
- Lista de monitorados da Vivo no modelo **"RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL"** (aba "Lista Advs"). Use sempre esse modelo. A versão em uso fica em `~/Projetos Claude/Análise de Condenações/_lista-monitorados/`; quando a Vivo mandar outra, substitua o arquivo.

Scripts em `scripts/`, rodados da pasta da skill. Prompts e formato da resposta da IA em `references/prompts.md`.

## Fluxo diário

### 1. Abrir a janela e o login

```bash
node scripts/sessao.mjs abrir          # em segundo plano (run_in_background)
node scripts/sessao.mjs esperar-login  # avise a pessoa para entrar no eLaw na janela que abriu
```

### 2. Montar o lote do dia

```bash
node scripts/exportar.mjs --diario
```

O lote vai para `~/Projetos Claude/Análise de Condenações/<hoje>/`. O script:
1. Exporta **"PA'S- Análise de Recurso"** (pasta PA), com Célula = Vivo e Vivo ES. Ele lista as PAs em status "Análise de Recurso", com o ID da PA. O modelo padrão desse relatório falha no eLaw ("coluna configurada 'AdvogadoAdverso'"); o script passa sozinho para a cópia global ("Cópia - PA'S- Análise de Recurso"), que exporta.
2. Fica só com as de resultado **Sentença** e tira as que já estão no histórico. Use `--incluir-anteriores` para reprocessar.
3. Exporta o **"Análise de Condenações"** (Período de Preenchimento: do cadastro da PA mais antiga até hoje) e fica só com as linhas dessas PAs, pelo número do processo.

Sem PA nova, o lote fica vazio, e o dia termina aí. Se a exportação falhar, peça à pessoa que exporte à mão e rode com `--arquivo-recurso <xlsx> --arquivo-condenacoes <xlsx>`.

### 3. Coletar PA, documentos e advogado

```bash
node scripts/coletar.mjs --lote "<lote>"
```

Para cada linha, o script:
- vai direto ao detalhe da PA, pelo ID, e confere a data de publicação. Uma linha de outra sentença do mesmo processo vira `descartada` e não entra na planilha;
- lê o Status, o "Interpor Recurso ?" (nessa etapa, "Aguardando Análise") e a **sugestão de dispensa do escritório**. A sugestão só aparece no histórico da PA, como "Is Sugestao Dispensa Recursal M T A … para 'True'/'False'". Na tela do escritório, o nome é "Sugestão Dispensa Recursal Pena Carvalho?";
- baixa os quadros Documentos e Documentos Anexados para `Processos/<número do processo>/` e separa o inteiro teor;
- lê o advogado no campo Advogado Adverso e no quadro "Partes / Advogados" da decisão;
- grava o texto em `textos/<linha>.txt`.

Linhas com falha são tentadas de novo nas próximas execuções, até 3 vezes.

### 4. Ler as decisões (IA)

```bash
node scripts/ia_lotes.mjs --lote "<lote>" --tamanho 8
```

Para cada lote listado, abra um **subagente** (Agent, general-purpose), vários em paralelo (até 4), com este pedido:

> Leia `<pasta da skill>/references/prompts.md` e siga-o à risca. Lote `<lote>`. Linhas: `<n1, n2, …>`. Para cada linha, leia `<lote>/textos/<n>.txt` (ou o PDF indicado, se o texto disser PDF SEM TEXTO), aplique o Prompt 1 e o Prompt 2, liste os advogados da parte autora e grave `<lote>/ia/<n>.json` no formato do arquivo. Não grave nada além desses arquivos e não altere os textos. No fim, responda só com as linhas gravadas e as que tiveram problema, com o motivo.

Não leia as decisões na conversa principal. Rode `ia_lotes.mjs` de novo até zerar.

### 5. Montar a planilha

```bash
node scripts/gerar_planilha.mjs --lote "<lote>" --monitorados "~/Projetos Claude/Análise de Condenações/_lista-monitorados/RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL.xlsx"
```

A planilha sai em `Planilhas/Análise de Condenações - Vivo e Vivo ES - <lote>.xlsx`, só com as linhas do lote, e as PAs analisadas entram no histórico.

**Regras (escopo v1.1):**
- **Sentença justa/injusta**, considerando os dois campos da PA:

| Sugestão de dispensa (escritório) | Interpor Recurso ? | Coluna |
|---|---|---|
| Sim | diferente de Sim | **Justa** |
| diferente de Sim | Sim | **Injusta** |
| Não | diferente de Sim | **Injusta** (o escritório sugere recorrer) |
| Sim | Sim | em branco, conferir (conflito) |
| sem registro | diferente de Sim | em branco, conferir |

- **Má-fé:** "Sim" só com condenação expressa. Indícios, advertências, menções e pedidos rejeitados aparecem só em "Má-fé · detalhe".
- **Ofício:** "Sim" sem trecho, ou com justificativa "DÚVIDA:", vai para conferir.
- **Advogado monitorado:**
  - O robô junta os advogados do eLaw, do cabeçalho e da IA.
  - Compara primeiro a OAB e depois o nome completo. Nome de uma palavra só não é comparado.
  - Só ATIVO conta. Um advogado INATIVO na lista vira "Não", com observação.

### 6. Entregar

- Rode `node scripts/sessao.mjs fechar`.
- Relate em linguagem simples, pela aba Resumo:
  - PAs em Análise de Recurso, novas e já analisadas;
  - linhas concluídas, para conferir e com falha;
  - Justa e Injusta;
  - "Sim" de cada coluna;
  - ocorrências e o tratamento de cada uma.
- Entregue o arquivo `.xlsx` (nunca Artifact).

## Execução diária e agendamento

O escritório pediu execução **diária**, por causa dos prazos recursais. O robô depende do login de uma pessoa no eLaw, então o agendamento serve para lembrar e preparar, não para rodar sem ninguém. Uma tarefa agendada do Claude no horário combinado:
1. abre a janela;
2. pede o login;
3. segue os passos 2 a 6.

Combine o horário e quem faz o login com o escritório. O Pablo decide antes de criar a tarefa.

## Tempo e volume

- Em 11/11/2026 havia 11 PAs em Análise de Recurso: 10 de sentença e 1 sem resultado. As duas exportações levaram cerca de 1 minuto.
- A coleta leva cerca de 25 s por PA. A IA, cerca de 1 minuto por lote de 5 decisões, com uns 18 mil tokens por linha.
- O volume diário é pequeno: as PAs ficam nessa etapa só até a empresa validar.

## Limites conhecidos

- **Modelo padrão quebrado:** o "PA'S- Análise de Recurso" padrão não exporta (erro do eLaw na coluna "Advogado da Outra Parte"). O robô usa a cópia global. Se o escritório corrigir o padrão, o robô volta a usá-lo sozinho.
- **Sugestão de dispensa:** só no histórico da PA. Se o eLaw mudar o texto do log, a sugestão fica "sem registro", e a sentença justa, em branco para conferir.
- **"Tipo de análise":** campo dinâmico da PA (hoje sempre "Viabilidade Recursal" nessa etapa). Fica registrado nas colunas de apoio, mas não filtra.
- **PA sem linha no Análise de Condenações** (preenchimento fora do período ou relatório desatualizado): vai para as ocorrências do Resumo e fica fora da planilha.
- O "SENTENÇA INTEIRO TEOR" pode vir digitalizado. A PA costuma ter também a "DECISÃO INTEGRAL", e o robô fica com o documento que tem texto.
- O quadro "Partes / Advogados" pode ter corréus. Só vale o polo ativo. Decisões do eproc não trazem o quadro.
- Os campos de data do filtro são só leitura. As datas são escolhidas no calendário, e o resumo da tela é conferido antes de exportar.
- O modo antigo, por período e com todas as PAs, continua disponível para teste: `exportar.mjs --lote <pasta> --todas-do-periodo --de dd/mm/aaaa --ate dd/mm/aaaa`.
