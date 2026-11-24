// ============================================================================
// Testes dos AJUDANTES do painel novo: tempo relativo ("há 2 h"), agrupamento por inicial (a "caderneta" de
// clientes) e o medidor de estoque (a "pilha de camisetas" das prateleiras).
// Por que testar: são pequenas regras que aparecem em toda tela. Um "há -3 min", uma inicial "Á" separada do
// "A", ou uma pilha que mostra mais peças do que existem, deixariam o painel parecendo quebrado.
// ============================================================================

import { describe, expect, it } from "vitest";
import { agruparPorInicial } from "@/lib/grouping";
import { saudacao } from "@/lib/greeting";
import { itensDaFaixa } from "@/lib/ticker";
import { medidorDeEstoque } from "@/lib/stock-meter";
import { tempoRelativo } from "@/lib/relative-time";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const agora = new Date("2026-11-23T15:00:00Z").getTime();
const atras = (ms: number) => new Date(agora - ms);

describe("tempoRelativo", () => {
  it.each([
    [0, "agora"],
    [30_000, "agora"],
    [59_000, "agora"],
    [1 * MIN, "há 1 min"],
    [5 * MIN, "há 5 min"],
    [59 * MIN, "há 59 min"],
    [1 * H, "há 1 h"],
    [23 * H, "há 23 h"],
    [24 * H, "há 1 dia"],
    [47 * H, "há 1 dia"],
    [2 * D, "há 2 dias"],
    [6 * D, "há 6 dias"],
    [7 * D, "há 1 semana"],
    [20 * D, "há 2 semanas"],
    [30 * D, "há 4 semanas"],
    [45 * D, "há 1 mês"],
    [90 * D, "há 3 meses"],
    [400 * D, "há 1 ano"],
    [800 * D, "há 2 anos"],
  ])("%d ms atrás → %s", (ms, texto) => {
    expect(tempoRelativo(atras(ms), agora)).toBe(texto);
  });

  it("data no futuro (relógios diferentes) vira 'agora', nunca um número negativo", () => {
    expect(tempoRelativo(new Date(agora + 5 * MIN), agora)).toBe("agora");
    expect(tempoRelativo(new Date(agora + 400 * D), agora)).toBe("agora");
  });

  it("data inválida ou tipo errado não quebra a tela", () => {
    for (const v of [new Date("lixo"), null, undefined, "ontem", NaN] as unknown[]) expect(tempoRelativo(v as Date, agora), String(v)).toBe("—");
  });
});

describe("agruparPorInicial", () => {
  const nomes = (g: { letra: string; itens: { name: string }[] }[]) => g.map((x) => [x.letra, x.itens.map((i) => i.name)]);

  it("agrupa pela primeira letra, em ordem alfabética, e ordena os nomes dentro de cada letra", () => {
    const r = agruparPorInicial([{ name: "Bia" }, { name: "Ana" }, { name: "Carlos" }, { name: "Abel" }]);
    expect(nomes(r)).toEqual([
      ["A", ["Abel", "Ana"]],
      ["B", ["Bia"]],
      ["C", ["Carlos"]],
    ]);
  });

  it("acento e maiúscula não separam a mesma letra: 'Álvaro', 'alice' e 'Ana' ficam juntos", () => {
    const r = agruparPorInicial([{ name: "Álvaro" }, { name: "alice" }, { name: "Ana" }, { name: "Érica" }, { name: "eduardo" }]);
    expect(nomes(r)).toEqual([
      ["A", ["alice", "Álvaro", "Ana"]],
      ["E", ["eduardo", "Érica"]],
    ]);
  });

  it("nomes que não começam com letra (número, símbolo, vazio) vão para '#', no fim", () => {
    const r = agruparPorInicial([{ name: "9Mil" }, { name: "Zeca" }, { name: "  " }, { name: "@loja" }, { name: "Ana" }]);
    expect(r.map((g) => g.letra)).toEqual(["A", "Z", "#"]);
    expect(r.at(-1)!.itens).toHaveLength(3);
  });

  it("espaços no começo são ignorados", () => {
    expect(agruparPorInicial([{ name: "  Marta" }])[0].letra).toBe("M");
  });

  it("lista vazia devolve lista vazia; nenhum item se perde nem se repete", () => {
    expect(agruparPorInicial([])).toEqual([]);
    const entrada = Array.from({ length: 50 }, (_, i) => ({ name: `${String.fromCharCode(65 + (i % 26))}nome${i}` }));
    expect(agruparPorInicial(entrada).flatMap((g) => g.itens)).toHaveLength(50);
  });

  it("preserva os outros campos de cada item", () => {
    const r = agruparPorInicial([{ name: "Ana", id: 7, extra: "x" }]);
    expect(r[0].itens[0]).toEqual({ name: "Ana", id: 7, extra: "x" });
  });
});

describe("medidorDeEstoque (a pilha de camisetas)", () => {
  it.each([
    [0, 0, "vazio"],
    [1, 1, "baixo"],
    [3, 3, "baixo"],
    [4, 4, "ok"],
    [8, 8, "ok"],
    [12, 10, "ok"],
    [500, 10, "ok"],
  ])("%d peças → %d blocos cheios (%s)", (estoque, cheios, nivel) => {
    const m = medidorDeEstoque(estoque);
    expect(m.cheios).toBe(cheios);
    expect(m.nivel).toBe(nivel);
    expect(m.total).toBe(10);
  });

  it("estoque inválido (negativo, decimal, texto, NaN) vira vazio, sem quebrar", () => {
    for (const v of [-5, 1.5, NaN, undefined, null, "3"] as unknown[]) {
      const m = medidorDeEstoque(v as number);
      expect(m.cheios, String(v)).toBe(0);
      expect(m.nivel, String(v)).toBe("vazio");
    }
  });

  it("nunca mostra mais blocos cheios do que o total", () => {
    for (const n of [0, 5, 10, 11, 1000, Number.MAX_SAFE_INTEGER]) {
      const m = medidorDeEstoque(n);
      expect(m.cheios).toBeLessThanOrEqual(m.total);
    }
  });
});

describe("saudacao (pelo horário de São Paulo, não do servidor)", () => {
  // 15:00 UTC = 12:00 em São Paulo (UTC-3).
  const em = (iso: string) => new Date(iso);
  it.each([
    ["2026-11-23T08:00:00Z", "Bom dia"], // 05:00 em SP
    ["2026-11-23T14:59:00Z", "Bom dia"], // 11:59
    ["2026-11-23T15:00:00Z", "Boa tarde"], // 12:00
    ["2026-11-23T20:59:00Z", "Boa tarde"], // 17:59
    ["2026-11-23T21:00:00Z", "Boa noite"], // 18:00
    ["2026-11-24T01:00:00Z", "Boa noite"], // 22:00 do dia 23
    ["2026-11-24T03:00:00Z", "Boa madrugada"], // 00:00
    ["2026-11-24T07:59:00Z", "Boa madrugada"], // 04:59
  ])("%s → %s", (iso, texto) => {
    expect(saudacao(em(iso))).toBe(texto);
  });

  it("data inválida não quebra: cai num cumprimento neutro", () => {
    expect(saudacao(new Date("lixo"))).toBe("Olá");
  });
});

describe("itensDaFaixa (o texto que corre no topo do painel)", () => {
  const zero = { pedidosPendentes: 0, encomendasNovas: 0, pedidosHoje: 0, pagamentosParaConferir: 0 };

  it("sem nada esperando, diz que está tudo em dia", () => {
    expect(itensDaFaixa(zero)).toEqual(["Tudo em dia: nada esperando por você"]);
  });

  it("mostra só o que tem número, no singular e no plural certos", () => {
    expect(itensDaFaixa({ ...zero, pedidosPendentes: 1 })).toEqual(["1 pedido esperando pagamento"]);
    expect(itensDaFaixa({ ...zero, pedidosPendentes: 3, encomendasNovas: 1 })).toEqual(["3 pedidos esperando pagamento", "1 encomenda nova"]);
    expect(itensDaFaixa({ ...zero, encomendasNovas: 2 })).toEqual(["2 encomendas novas"]);
    expect(itensDaFaixa({ ...zero, pedidosHoje: 1 })).toEqual(["1 pedido hoje"]);
    expect(itensDaFaixa({ ...zero, pedidosHoje: 4 })).toEqual(["4 pedidos hoje"]);
  });

  it("pagamento a conferir vem primeiro (é o mais urgente) e com a palavra de alerta", () => {
    const r = itensDaFaixa({ pedidosPendentes: 2, encomendasNovas: 1, pedidosHoje: 5, pagamentosParaConferir: 1 });
    expect(r[0]).toBe("Atenção: 1 pagamento para conferir");
    expect(r).toHaveLength(4);
    expect(itensDaFaixa({ ...zero, pagamentosParaConferir: 3 })[0]).toBe("Atenção: 3 pagamentos para conferir");
  });

  it("número inválido (negativo, NaN, decimal) é tratado como zero, sem texto estranho", () => {
    expect(itensDaFaixa({ pedidosPendentes: -2, encomendasNovas: NaN, pedidosHoje: 1.5, pagamentosParaConferir: undefined as unknown as number })).toEqual([
      "Tudo em dia: nada esperando por você",
    ]);
  });
});

