// ============================================================================
// Consulta de CEP no ViaCEP (https://viacep.com.br), para preencher rua, bairro, cidade e UF sozinhos.
//
// Quem usa: a rota GET /api/cep/[cep], chamada pelo formulário de endereço da conta (/conta).
// É uma COMODIDADE, nunca uma exigência: se o serviço estiver fora do ar, o cliente digita o endereço à mão.
//
// Cuidados:
//   - a consulta é feita pelo SERVIDOR, não pelo navegador: o navegador do cliente nunca fala com terceiros;
//   - só 8 dígitos ASCII chegam ao serviço externo (qualquer outra coisa é recusada ANTES de sair): é o que
//     impede um valor estranho de virar um caminho ou uma consulta ("../", "?", "%") no endereço externo;
//   - a resposta do serviço é tratada como NÃO confiável: só pegamos quatro campos, só como texto, com tamanho
//     limitado e sem caractere de controle, e a UF precisa ser uma das 27;
//   - tem prazo de 5 segundos e a mensagem de erro não vaza detalhes da falha.
// ============================================================================

import "server-only";
import { UFS } from "@/server/customers/address";

/** Erro ao consultar o serviço de CEP. A mensagem é segura para mostrar ao cliente. */
export class CepError extends Error {}

/** O que usamos da resposta do ViaCEP. Rua e bairro podem vir vazios (CEP geral de cidade pequena). */
export type CepResult = { street: string; district: string; city: string; state: string };

// Um campo de texto da resposta: só se for texto; caractere de controle vira espaço; tamanho limitado.
function campo(valor: unknown, max: number): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Procura um CEP (8 dígitos, sem máscara).
 * @returns o endereço encontrado, ou null se o CEP não existe
 * @throws CepError se o CEP é inválido, o serviço falhou ou respondeu algo que não confiamos
 */
export async function lookupCep(cep: string): Promise<CepResult | null> {
  // Antes de qualquer coisa sair para fora: só 8 dígitos ASCII.
  if (typeof cep !== "string" || !/^[0-9]{8}$/.test(cep)) throw new CepError("CEP inválido.");

  let corpo: unknown;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("status");
    corpo = await res.json();
  } catch {
    // Sem detalhes (nem o erro de rede, nem o status): o cliente só precisa saber que pode digitar à mão.
    throw new CepError("Não foi possível consultar o CEP agora.");
  }

  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) throw new CepError("Resposta inesperada do serviço de CEP.");
  const r = corpo as Record<string, unknown>;
  // O ViaCEP responde { "erro": true } (às vezes "true") para CEP que não existe.
  if (r.erro === true || r.erro === "true") return null;

  const state = typeof r.uf === "string" ? r.uf.trim().toUpperCase() : "";
  if (!(UFS as readonly string[]).includes(state)) throw new CepError("Resposta inesperada do serviço de CEP.");

  return { street: campo(r.logradouro, 120), district: campo(r.bairro, 80), city: campo(r.localidade, 80), state };
}
