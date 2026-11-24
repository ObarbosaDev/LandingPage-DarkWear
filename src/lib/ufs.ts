// ============================================================================
// As 27 unidades da federação (siglas). Fica num arquivo próprio, sem nada de servidor, porque é usado dos dois
// lados: o servidor confere a UF de um endereço (src/server/customers/address.ts) e o formulário de endereço, no
// navegador, oferece a lista para escolher.
// ============================================================================

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
