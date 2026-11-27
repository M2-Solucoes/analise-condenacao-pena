# Prompts da análise (escopo v1.2, validado pelo escritório em 26/11/2026) e formato da resposta

Cada subagente recebe uma lista de linhas. Para cada linha `<n>`:

1. Leia `<lote>/textos/<n>.txt` inteiro. As páginas vêm marcadas com `=== PÁGINA k ===`.
   - Se o arquivo disser `PDF SEM TEXTO`, leia o PDF indicado com a ferramenta Read. Para mais de 10 páginas, leia em partes, com `pages`.
   - Se a fonte for `só o dispositivo`, responda com base no que houver e comece as justificativas com `DÚVIDA:`, porque a decisão inteira não foi lida.
2. Aplique o **Prompt 1** e o **Prompt 2** abaixo. Os dois são independentes.
3. Liste os **advogados da parte autora**, como aparecem no documento. Use o quadro "Partes / Advogados" do cabeçalho ou as menções a "advogado(a) da parte autora". Traga a OAB quando houver. Nunca liste advogados da Telefônica/Vivo.
4. Grave `<lote>/ia/<n>.json` no formato do fim deste arquivo. Não grave nenhum outro arquivo.

Use só o que está escrito no documento. Não pesquise fora dele nem complete com conhecimento próprio.

---

## Prompt 1 — Litigância de má-fé (ajustado em 11/11/2026, pedido do escritório)

Você vai ler uma sentença de um processo em que a Vivo (Telefônica Brasil S.A.) é parte. Diga se a sentença traz **condenação expressa por litigância de má-fé**, de qualquer das partes. Leia o documento inteiro: relatório, fundamentação e dispositivo.

**Responda SIM somente quando** a sentença condena expressamente alguma parte por litigância de má-fé (arts. 80 e 81 do CPC; no Juizado, art. 55 da Lei 9.099/95), com ou sem multa. Exemplos: "condeno a parte autora por litigância de má-fé", "aplico multa por litigância de má-fé de X%", "condeno nas penas do art. 81 do CPC".

**Responda NÃO em todos os outros casos**, inclusive quando a sentença:
- aponta indício de má-fé processual (alterar a verdade dos fatos, lide temerária, recurso protelatório…) sem condenar;
- aponta indício de advocacia predatória ou abusiva (ações em massa, petições padronizadas, procuração genérica, parte que desconhece a ação…) sem condenar;
- adverte a parte ou o advogado, ou manda apurar a conduta;
- examina o pedido de condenação por má-fé e o rejeita;
- só transcreve o que uma parte alegou.

**Indícios:** quando a resposta for NÃO, mas a sentença trouxer indício, advertência, menção, pedido rejeitado ou ordem de apuração ligados à má-fé ou à advocacia predatória, registre cada um em `indicios`. Eles aparecem só no detalhe da planilha e **não** geram "Sim" na coluna.

**Regras:** use apenas o que está escrito no documento; perder a ação não é má-fé. Copie o trecho exatamente como está, sem resumir. Na dúvida se há condenação expressa, responda NÃO e comece a justificativa com "DÚVIDA:".

## Prompt 2 — Expedição de ofício

Você vai ler uma sentença de um processo em que a Vivo (Telefônica Brasil S.A.) é parte. Diga se a sentença traz algum **indício de expedição de ofício**, isto é, se determina comunicação oficial a órgão ou entidade de fora do processo. Leia o documento inteiro, inclusive o dispositivo.

**Responda SIM quando a decisão:**
1. determina expedir ofício a qualquer destinatário: OAB, Ministério Público, Polícia ou Delegacia, Corregedoria, núcleo de monitoramento de demandas ou centro de inteligência do tribunal (como o NUMOPEDE do TJMG), Defensoria, Procon, Anatel, Receita Federal, cartório, banco, empregador, a própria Vivo ou outra empresa;
2. usa expressão equivalente dirigida a órgão ou entidade de fora do processo: "oficie-se", "expeça-se ofício", "comunique-se", "encaminhe-se cópia", "remetam-se cópias", "dê-se ciência".

**Responda NÃO quando:**
- não há ordem de ofício;
- o pedido de expedição de ofício foi indeferido;
- o ofício é citado só como fato passado (por exemplo, "o ofício juntado aos autos"), sem nova ordem;
- a comunicação é interna do processo: intimação ou citação das partes, remessa à contadoria, à secretaria ou à instância superior;
- a comunicação é **cobrança de custas ou despesas processuais**: comunicar custas em aberto à Procuradoria (Procuradoria-Geral do Estado, Advocacia-Geral do Estado, Fazenda Pública), inscrever em dívida ativa ou no Cadin. O escritório definiu, em 26/11/2026, que isso **não conta como ofício**. Registre o trecho em `desconsiderados`.

Se a decisão tiver uma comunicação de custas e também uma ordem de ofício de verdade, responda SIM com base na ordem de ofício e registre a de custas em `desconsiderados`.

**Regras:** use apenas o que está escrito no documento. Copie o trecho exatamente como está, sem resumir. Na dúvida entre SIM e NÃO, responda SIM e comece a justificativa com "DÚVIDA:". A comunicação de custas à Procuradoria não é dúvida: é NÃO.

---

## Formato de `ia/<n>.json`

```json
{
  "linha": 12,
  "ma_fe": {
    "resposta": "SIM (só com condenação expressa) ou NÃO",
    "quem": "parte condenada: parte autora | advogado da parte autora | Vivo | outra parte | não se aplica",
    "trecho": "cópia literal da condenação, até 400 caracteres, ou não se aplica",
    "pagina": "3",
    "justificativa": "uma frase",
    "indicios": [
      { "tipo": "indício | advertência | menção | pedido rejeitado | apuração", "quem": "parte autora | advogado da parte autora | Vivo | outra parte", "trecho": "cópia literal, até 300 caracteres", "pagina": "2" }
    ]
  },
  "oficio": {
    "resposta": "NÃO",
    "destinatario": "órgão ou entidade; se mais de um, separe por ;  — ou não se aplica",
    "finalidade": "em poucas palavras, ou não se aplica",
    "trecho": "não se aplica",
    "pagina": "não se aplica",
    "justificativa": "uma frase",
    "desconsiderados": [
      { "tipo": "custas à Procuradoria (Cadin)", "trecho": "cópia literal, até 300 caracteres", "pagina": "3" }
    ]
  },
  "advogados_parte_autora": [
    { "nome": "NOME COMO APARECE NO DOCUMENTO", "oab": "OAB/MG 123.456 ou vazio" }
  ]
}
```

- `resposta`: exatamente `SIM` ou `NÃO`. Em `ma_fe`, `SIM` só com condenação expressa.
- `ma_fe.indicios`: use `[]` quando não houver nada a registrar. Nunca ponha a condenação expressa aqui; ela vai em `trecho`.
- `oficio.desconsiderados`: comunicações que o escritório decidiu não contar como ofício (hoje, só custas em aberto à Procuradoria, dívida ativa ou Cadin). Use `[]` quando não houver.
- `pagina`: o número que vem depois de `=== PÁGINA` no texto.
- `advogados_parte_autora`: use `[]` quando o documento não disser quem é o advogado.
