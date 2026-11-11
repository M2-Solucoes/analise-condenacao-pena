# Prompts da análise (escopo v1.0, 11/11/2026) e formato da resposta

Cada subagente recebe uma lista de linhas. Para cada linha `<n>`:

1. Leia `<lote>/textos/<n>.txt` inteiro. As páginas vêm marcadas com `=== PÁGINA k ===`.
   - Se o arquivo disser `PDF SEM TEXTO`, leia o PDF indicado com a ferramenta Read. Para mais de 10 páginas, leia em partes, com `pages`.
   - Se a fonte for `só o dispositivo`, responda com base no que houver e comece as justificativas com `DÚVIDA:`, porque a decisão inteira não foi lida.
2. Aplique o **Prompt 1** e o **Prompt 2** abaixo. Os dois são independentes.
3. Liste os **advogados da parte autora**, como aparecem no documento. Use o quadro "Partes / Advogados" do cabeçalho ou as menções a "advogado(a) da parte autora". Traga a OAB quando houver. Nunca liste advogados da Telefônica/Vivo.
4. Grave `<lote>/ia/<n>.json` no formato do fim deste arquivo. Não grave nenhum outro arquivo.

Use só o que está escrito no documento. Não pesquise fora dele nem complete com conhecimento próprio.

---

## Prompt 1 — Litigância de má-fé

Você vai ler uma decisão judicial (sentença ou acórdão) de um processo em que a Vivo (Telefônica Brasil S.A.) é parte. Diga se a decisão traz algum **indício de litigância de má-fé**, de qualquer das partes ou do advogado. Leia o documento inteiro: relatório, fundamentação e dispositivo; no acórdão, também a ementa e os votos.

**Responda SIM quando a decisão:**
1. condena alguma parte por litigância de má-fé (arts. 80 e 81 do CPC; no Juizado, art. 55 da Lei 9.099/95), com ou sem multa;
2. aponta, mesmo sem condenar, conduta de má-fé processual: alterar a verdade dos fatos, pedir contra fato incontroverso, usar o processo para objetivo ilegal, lide temerária ou recurso protelatório;
3. aponta indício de advocacia predatória ou abusiva: ações em massa ou repetidas, petições padronizadas, pedidos fracionados em várias ações, procuração genérica ou antiga, parte que desconhece a ação, documento ou comprovante suspeito;
4. adverte a parte ou o advogado sobre essas condutas, ou manda apurá-las.

**Responda NÃO quando:**
- o tema não aparece na decisão;
- a decisão examina o pedido de condenação por má-fé e o rejeita, sem apontar indício;
- a menção é só a transcrição do que uma parte alegou, sem que o juiz ou o tribunal adote o argumento.

**Regras:** use apenas o que está escrito no documento; perder a ação não é má-fé. Copie o trecho exatamente como está, sem resumir. Na dúvida entre SIM e NÃO, responda SIM e comece a justificativa com "DÚVIDA:".

## Prompt 2 — Expedição de ofício

Você vai ler uma decisão judicial (sentença ou acórdão) de um processo em que a Vivo (Telefônica Brasil S.A.) é parte. Diga se a decisão traz algum **indício de expedição de ofício**, isto é, se determina comunicação oficial a órgão ou entidade de fora do processo. Leia o documento inteiro, inclusive o dispositivo.

**Responda SIM quando a decisão:**
1. determina expedir ofício a qualquer destinatário: OAB, Ministério Público, Polícia ou Delegacia, Corregedoria, núcleo de monitoramento de demandas ou centro de inteligência do tribunal (como o NUMOPEDE do TJMG), Defensoria, Procon, Anatel, Receita Federal, cartório, banco, empregador, a própria Vivo ou outra empresa;
2. usa expressão equivalente dirigida a órgão ou entidade de fora do processo: "oficie-se", "expeça-se ofício", "comunique-se", "encaminhe-se cópia", "remetam-se cópias", "dê-se ciência";
3. no acórdão, mantém a ordem de ofício dada na sentença.

**Responda NÃO quando:**
- não há ordem de ofício;
- o pedido de expedição de ofício foi indeferido;
- o ofício é citado só como fato passado (por exemplo, "o ofício juntado aos autos"), sem nova ordem;
- a comunicação é interna do processo: intimação ou citação das partes, remessa à contadoria, à secretaria ou à instância superior.

**Regras:** use apenas o que está escrito no documento. Copie o trecho exatamente como está, sem resumir. Na dúvida entre SIM e NÃO, responda SIM e comece a justificativa com "DÚVIDA:".

---

## Formato de `ia/<n>.json`

```json
{
  "linha": 12,
  "ma_fe": {
    "resposta": "SIM",
    "quem": "parte autora | advogado da parte autora | Vivo | outra parte | não se aplica",
    "tipo": "condenação | indício | advertência | não se aplica",
    "trecho": "cópia literal, até 400 caracteres, ou não se aplica",
    "pagina": "3",
    "justificativa": "uma frase"
  },
  "oficio": {
    "resposta": "NÃO",
    "destinatario": "órgão ou entidade; se mais de um, separe por ;  — ou não se aplica",
    "finalidade": "em poucas palavras, ou não se aplica",
    "trecho": "não se aplica",
    "pagina": "não se aplica",
    "justificativa": "uma frase"
  },
  "advogados_parte_autora": [
    { "nome": "NOME COMO APARECE NO DOCUMENTO", "oab": "OAB/MG 123.456 ou vazio" }
  ]
}
```

- `resposta`: exatamente `SIM` ou `NÃO`.
- `pagina`: o número que vem depois de `=== PÁGINA` no texto.
- `advogados_parte_autora`: use `[]` quando o documento não disser quem é o advogado.
