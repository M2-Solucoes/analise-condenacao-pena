---
name: analise-condenacao-pena
description: Robô de análise da condenação do Pena Carvalho (carteira Vivo). Exporta do eLaw o relatório "Análise de Condenações" das células Vivo e Vivo ES, abre a PA de sentença ou acórdão de cada linha, baixa a decisão numa pasta por número de processo e preenche litigância de má-fé, expedição de ofício, sentença justa e advogado monitorado (lista da Vivo), com trecho e página. Use sempre que o Pablo ou a equipe do Pena Carvalho pedirem para rodar, testar ou retomar a análise de condenações, o robô de má-fé/ofício/sentença justa/advogado monitorado ou o preenchimento do relatório Análise de Condenações, mesmo sem citar a skill. NÃO use para outros clientes, outros relatórios do eLaw, para preencher ou alterar PAs no eLaw, nem para peticionar.
---

# Análise de condenações · Pena Carvalho (Vivo)

Entrega uma planilha com o relatório "Análise de Condenações" do eLaw e as colunas que hoje chegam vazias, já preenchidas:
- **Condenação em litigância de má-fé**: pelo Prompt 1.
- **Expedição de ofício**: pelo Prompt 2.
- **Sentença justa/injusta**: pelo campo "Interpor Recurso ?" da PA.
- **Advogado bloqueado/monitorado**: pela lista da Vivo.
- **Adv. da parte autora.**

Junto vão colunas de apoio (trecho, página, fonte, situação), uma aba **Resumo** e uma pasta por processo com os documentos da PA.

O escopo aprovado é `~/Projetos Claude/m2-digital-brand/proposal-template/pena-robo-analise-condenacao/` (v1.0, 11/11/2026). As regras abaixo vêm dele. Se o escritório mudar uma resposta dos 12 pontos de validação, ajuste aqui e nos scripts.

## Regras fixas

- **Login é da pessoa.** O robô abre uma janela própria do Chrome, e a pessoa entra no eLaw nela. Não peça, não digite e não grave senha, código ou cookie.
- **Só leitura no eLaw.** Exportar o relatório e baixar documentos são as únicas ações. Nunca preencha, conclua ou altere PA, prazo, processo ou documento. Nunca use "Alterar" ou "Excluir Documento", nem salve ou edite modelo de relatório.
- **Sessão única.** Durante a execução, ninguém deve entrar no eLaw com o mesmo usuário em outro navegador: a sessão do robô pode cair. Se cair, os scripts param e dizem; depois do login, o mesmo comando continua de onde parou.
- **Toda resposta da IA tem prova.** Um "Sim" de má-fé ou ofício precisa de trecho literal e página. Sem isso, a linha vai para "conferir".
- **Sem invenção.** Campo sem fonte fica vazio, com o motivo em Observações. A sentença justa nunca é deduzida quando o recurso está em branco.
- **Dados fora do vault.** Lotes, PDFs e planilhas ficam em `~/Projetos Claude/Análise de Condenações/` (ou na pasta que o escritório indicar), nunca no Segundo Cérebro nem no repositório da skill.
- **Primeira execução de um período novo: no máximo 20 linhas**, conferidas pela equipe antes de rodar o resto (ponto 12 do escopo).

## Pré-requisitos

- Node 20 ou mais novo e `npm install` feito na pasta da skill (puppeteer-core e exceljs). Também `pdftotext` (poppler) e o Google Chrome.
- Acesso ao eLaw do Pena Carvalho (`penacarvalho.elawio.com.br`) com usuário que veja as células Vivo e Vivo ES e o módulo de relatórios.
- Lista de monitorados da Vivo no modelo **"RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL"** (aba "Lista Advs"). O Pablo pediu: "usar sempre esse modelo". A versão em uso fica em `~/Projetos Claude/Análise de Condenações/_lista-monitorados/`; quando a Vivo mandar outra, substitua o arquivo. Se as colunas mudarem, o script avisa e para.

Scripts em `scripts/`, rodados da pasta da skill: `cd "<pasta da skill>"`. Prompts e formato da resposta da IA em `references/prompts.md`.

## Fluxo

### 1. Abrir a janela e o login

```bash
node scripts/sessao.mjs abrir          # em segundo plano (run_in_background); deixa a janela aberta
node scripts/sessao.mjs esperar-login  # avise a pessoa para entrar no eLaw na janela que abriu
```

### 2. Exportar o relatório e criar o lote

Combine o período de preenchimento com a pessoa. O recomendado é uma semana por vez.

```bash
node scripts/exportar.mjs --lote "~/Projetos Claude/Análise de Condenações/<AAAA-MM-DD a AAAA-MM-DD>" --de dd/mm/aaaa --ate dd/mm/aaaa
```

O script aplica Célula = Vivo, Vivo ES e Período de Preenchimento = Intervalo, confere os filtros no resumo da tela e exporta para Excel. O Preview não serve: ele para em 2.000 linhas. Se a exportação automática falhar, peça à pessoa que exporte à mão, com os mesmos filtros, e rode com `--arquivo <xlsx>`.

### 3. Coletar PA, documentos e advogado

```bash
node scripts/coletar.mjs --lote "<lote>" --limite 20
```

Para cada linha, o script:
- acha o processo pela coluna **Pastas** e confere o número;
- escolhe a PA de resultado Sentença ou Acordão com a mesma data de publicação;
- lê "Interpor Recurso ?" e baixa os quadros Documentos e Documentos Anexados da PA para `Processos/<número do processo>/`;
- separa a **decisão de inteiro teor**. Se a PA só tiver a publicação, procura "Decisão integral", inteiro teor ou acórdão na aba Documentos do processo. Sem nenhum, usa o Dispositivo do relatório e marca a linha;
- lê o advogado no campo **Advogado Adverso** do processo e no quadro "Partes / Advogados" do cabeçalho da decisão;
- grava o texto da decisão em `textos/<linha>.txt`.

Saídas possíveis por linha: `coletada`, `conferir` (sem PA com a data da linha; o robô não escolhe outra) ou `falha` (tenta de novo nas próximas execuções, até 3 vezes). Rodar de novo continua das pendentes.

### 4. Ler as decisões (IA)

```bash
node scripts/ia_lotes.mjs --lote "<lote>" --tamanho 8
```

Para cada lote listado, abra um **subagente** (Agent, general-purpose), vários em paralelo (até 4), com este pedido:

> Leia `<pasta da skill>/references/prompts.md` e siga-o à risca. Lote `<lote>`. Linhas: `<n1, n2, …>`. Para cada linha, leia `<lote>/textos/<n>.txt` (ou o PDF indicado, se o texto disser PDF SEM TEXTO), aplique o Prompt 1 e o Prompt 2, liste os advogados da parte autora e grave `<lote>/ia/<n>.json` no formato do arquivo. Não grave nada além desses arquivos e não altere os textos. No fim, responda só com as linhas gravadas e as que tiveram problema, com o motivo.

Não leia as decisões na conversa principal; elas são longas e muitas. Depois dos subagentes, rode `ia_lotes.mjs` de novo. Ele lista só o que faltou ou veio fora do formato. Repita até zerar.

### 5. Montar a planilha

```bash
node scripts/gerar_planilha.mjs --lote "<lote>" --monitorados "~/Projetos Claude/Análise de Condenações/_lista-monitorados/RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL.xlsx"
```

Regras aplicadas:
- **Sentença justa:** Interpor Recurso "Não" = **Sim** (justa); "Sim" = **Não** (injusta); em branco fica em branco, com observação.
- **Advogado monitorado:**
  - O robô junta os advogados do eLaw, do cabeçalho e da leitura da IA.
  - Compara primeiro a OAB, principal ou suplementar, e depois o nome completo. Nome de uma palavra só não é comparado.
  - Só **ATIVO** conta. Advogado encontrado como INATIVO vira "Não", com observação. Advogado encontrado só pelo nome vai para "conferir".
- **Má-fé e ofício:** "Sim" sem trecho, ou com justificativa "DÚVIDA:", vai para "conferir".

### 6. Entregar

- Rode `node scripts/sessao.mjs fechar`.
- Relate em linguagem simples, pela aba Resumo:
  - período e linhas do relatório;
  - linhas concluídas, para conferir, com falha e pendentes;
  - documentos baixados;
  - "Sim" de cada coluna;
  - recursos em branco;
  - ocorrências e o tratamento de cada uma.
- Lembre que as linhas "conferir" e os "Sim" pedem a conferência da equipe, pelo trecho e pela página.
- Entregue o arquivo `.xlsx` (nunca Artifact) e a pasta `Processos/`.

## Tempo e volume (teste de 11/11/2026)

- Exportar o relatório de um dia levou menos de 1 minuto: 41 linhas preenchidas em 10/11/2026.
- Coletar levou cerca de **26 segundos por linha**: processo, PAs, detalhe, downloads e advogado. Uma semana, com umas 200 linhas, leva perto de 1h30.
- Antes de rodar o lote inteiro, avise a pessoa da duração.

## Limites conhecidos

- **O relatório só traz sentenças.** No histórico inteiro (15.782 linhas), todos os "Tipo de sentença" são resultados de sentença: Extinção, Improcedente, Procedente, Homologatória. Isso responde ao ponto 2 do escopo: os acórdãos ficam de fora até o escritório decidir usar também o relatório "Acordão", da mesma pasta PA.
- O relatório não traz o tipo nem o id da PA. A PA é achada pela data de publicação. Linhas sem data, ou sem PA nessa data, vão para "conferir".
- O "SENTENÇA INTEIRO TEOR" pode vir digitalizado, sem texto. A PA costuma ter também a "DECISÃO INTEGRAL", e o robô fica com o documento que tem mais texto.
- O quadro "Partes / Advogados" pode ter **corréus com advogados próprios**. O leitor só aceita advogados de parte do polo ativo (autor, requerente, exequente, reclamante, impetrante) e trata o papel que vem na linha seguinte ao nome.
- O campo Advogado Adverso às vezes traz um nome curto. A OAB do cadastro não aparece na tela.
- **Período:** os campos "Início" e "Fim" são só leitura. As datas são escolhidas no calendário (rótulos "dd de mês de aaaa"), e o script confere o resumo da tela ("2026-11-10 → 2026-11-10") antes de exportar.
- Os seletores do módulo de relatórios (`mat-select`, pela ordem) foram mapeados em 11/11/2026. Se o eLaw mudar a tela, a exportação para com o motivo, e a saída é exportar à mão com `--arquivo`.
