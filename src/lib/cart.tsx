// ============================================================================
// Carrinho de compras (a "sacola"): guarda as peças que o cliente escolheu enquanto ele navega.
//
// Quem usa:
//   - /loja/[slug] (ProductBuy): botão "Adicionar à sacola";
//   - /carrinho: lista, muda quantidades, remove e finaliza;
//   - cabeçalho: o numerinho no ícone da sacola.
//
// Onde fica guardado: no próprio navegador (localStorage). O cliente não precisa de conta e o
// carrinho sobrevive a fechar a aba. Nada vai ao servidor até ele clicar em "Finalizar".
//
// Importante: os preços aqui servem só para MOSTRAR na tela. Quando o pedido é finalizado, o
// servidor ignora estes valores e recalcula tudo a partir do banco (ver src/server/orders.ts).
// ============================================================================

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

/** Uma linha da sacola: uma peça, em um tamanho e uma cor, com a quantidade escolhida. */
export type CartItem = {
  id: string; // slug + tamanho + cor
  slug: string;
  name: string;
  priceCents: number;
  size: string;
  color: string;
  qty: number;
  max: number; // estoque disponível no momento da adição
};

// Estado do carrinho. "ready" fica false até lermos o localStorage; sem isso a tela piscaria
// "sacola vazia" por um instante mesmo quando há itens salvos.
type State = { items: CartItem[]; ready: boolean };

// Todas as mudanças possíveis no carrinho. O reducer abaixo decide o que cada uma faz.
type Action =
  | { type: "hydrate"; items: CartItem[] }
  | { type: "add"; item: Omit<CartItem, "qty"> & { qty?: number } }
  | { type: "setQty"; id: string; qty: number }
  | { type: "remove"; id: string }
  | { type: "clear" };

// Nome da chave no localStorage do navegador.
const STORAGE_KEY = "darkwear-cart";

// Carrinhos salvos antes da mudança para centavos têm "price" em reais: converte em vez de perder os itens.
/**
 * Lê o que estava salvo no navegador e devolve uma lista de itens segura.
 * O conteúdo do localStorage pode ser antigo (formato em reais), corrompido ou editado à mão, então
 * nada é aceito às cegas: itens inválidos são descartados e o resto é aproveitado.
 */
export function normalizeStored(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CartItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    // Pula valores que nem objeto são (null, texto, número).
    if (typeof r !== "object" || r === null) continue;
    // Formato novo: priceCents. Formato antigo: price em reais, convertido para centavos arredondando
    // (89.9 vira 8990 exato, sem o erro de ponto flutuante).
    const priceCents =
      typeof r.priceCents === "number" ? r.priceCents : typeof r.price === "number" ? Math.round(r.price * 100) : NaN;
    // Sem preço válido, sem id ou sem slug: o item não dá para usar.
    if (!Number.isFinite(priceCents) || typeof r.id !== "string" || typeof r.slug !== "string") continue;
    // Tira o campo antigo "price" do que vai ser guardado de novo.
    const { price: _antigo, ...resto } = r;
    void _antigo;
    items.push({ ...(resto as unknown as CartItem), priceCents });
  }
  return items;
}

/**
 * Regras de cada mudança do carrinho. É uma função pura: recebe o estado e a ação, devolve o novo
 * estado. Fica separada do componente para ser fácil de entender (e de testar).
 */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    // Carregou o que estava salvo: o carrinho passa a estar "pronto".
    case "hydrate":
      return { items: action.items, ready: true };
    // Adicionar uma peça.
    case "add": {
      const qty = action.item.qty ?? 1;
      // O id é "slug|tamanho|cor": a mesma peça no mesmo tamanho e cor é a MESMA linha.
      const existing = state.items.find((i) => i.id === action.item.id);
      if (existing) {
        // Já está na sacola: soma a quantidade, sem passar do estoque conhecido.
        const next = Math.min(existing.qty + qty, existing.max);
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === existing.id ? { ...i, qty: next, max: action.item.max } : i,
          ),
        };
      }
      // Peça nova na sacola.
      return {
        ...state,
        items: [
          ...state.items,
          { ...action.item, qty: Math.min(qty, action.item.max) },
        ],
      };
    }
    // Mudar a quantidade (botões − e + de /carrinho). Fica entre 0 e o estoque; chegar a 0 remove a linha.
    case "setQty":
      return {
        ...state,
        items: state.items
          .map((i) =>
            i.id === action.id
              ? { ...i, qty: Math.max(0, Math.min(action.qty, i.max)) }
              : i,
          )
          .filter((i) => i.qty > 0),
      };
    // Remover uma linha (botão "Remover").
    case "remove":
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    // Esvaziar tudo (depois de finalizar o pedido).
    case "clear":
      return { ...state, items: [] };
  }
}

// O que os componentes recebem ao chamar useCart().
type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  count: number; // total de peças (soma das quantidades): o numerinho do ícone
  totalCents: number; // total em centavos, só para exibir
  add: (item: Omit<CartItem, "qty"> & { qty?: number }) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

// O "Context" é o canal que leva o carrinho a qualquer componente do site sem passar por props.
const CartContext = createContext<CartContextValue | null>(null);

/**
 * Envolve o site (ver SiteFrame) e mantém o carrinho. Todo componente dentro dele pode usar useCart().
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [], ready: false });

  // Carrega o carrinho do navegador depois da montagem (evita diferença de HTML no servidor).
  // O servidor não tem localStorage, então ele sempre desenha a página com sacola vazia; se
  // lêssemos o localStorage já na primeira renderização, o HTML do cliente ficaria diferente do
  // do servidor e o React reclamaria (erro de hidratação).
  useEffect(() => {
    let items: CartItem[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) items = normalizeStored(JSON.parse(raw));
    } catch {
      items = [];
    }
    dispatch({ type: "hydrate", items });
  }, []);

  // Salva no navegador a cada mudança (depois de carregado, para não apagar o carrinho salvo
  // com a lista vazia da primeira renderização).
  useEffect(() => {
    if (!state.ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // Navegador sem armazenamento: o carrinho continua valendo só nesta aba.
    }
  }, [state.items, state.ready]);

  // Funções estáveis (useCallback) para os componentes que as recebem não serem redesenhados à toa.
  const add = useCallback(
    (item: Omit<CartItem, "qty"> & { qty?: number }) =>
      dispatch({ type: "add", item }),
    [],
  );
  const setQty = useCallback(
    (id: string, qty: number) => dispatch({ type: "setQty", id, qty }),
    [],
  );
  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  // O valor entregue aos componentes só é recalculado quando o estado muda.
  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      ready: state.ready,
      count: state.items.reduce((s, i) => s + i.qty, 0),
      totalCents: state.items.reduce((s, i) => s + i.priceCents * i.qty, 0),
      add,
      setQty,
      remove,
      clear,
    }),
    [state, add, setQty, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Acesso ao carrinho dentro de qualquer componente do site.
 * Lança erro claro se for usado fora do CartProvider (por exemplo, no painel /admin, que não tem sacola).
 */
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}
