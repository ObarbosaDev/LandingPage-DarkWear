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

export type CartItem = {
  id: string; // slug + tamanho + cor
  slug: string;
  name: string;
  price: number;
  size: string;
  color: string;
  qty: number;
  max: number; // estoque disponível no momento da adição
};

type State = { items: CartItem[]; ready: boolean };

type Action =
  | { type: "hydrate"; items: CartItem[] }
  | { type: "add"; item: Omit<CartItem, "qty"> & { qty?: number } }
  | { type: "setQty"; id: string; qty: number }
  | { type: "remove"; id: string }
  | { type: "clear" };

const STORAGE_KEY = "darkwear-cart";

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { items: action.items, ready: true };
    case "add": {
      const qty = action.item.qty ?? 1;
      const existing = state.items.find((i) => i.id === action.item.id);
      if (existing) {
        const next = Math.min(existing.qty + qty, existing.max);
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === existing.id ? { ...i, qty: next, max: action.item.max } : i,
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          { ...action.item, qty: Math.min(qty, action.item.max) },
        ],
      };
    }
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
    case "remove":
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case "clear":
      return { ...state, items: [] };
  }
}

type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  count: number;
  total: number;
  add: (item: Omit<CartItem, "qty"> & { qty?: number }) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [], ready: false });

  // Carrega o carrinho do navegador depois da montagem (evita diferença de HTML no servidor).
  useEffect(() => {
    let items: CartItem[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) items = JSON.parse(raw) as CartItem[];
    } catch {
      items = [];
    }
    dispatch({ type: "hydrate", items });
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // Navegador sem armazenamento: o carrinho continua valendo só nesta aba.
    }
  }, [state.items, state.ready]);

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

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      ready: state.ready,
      count: state.items.reduce((s, i) => s + i.qty, 0),
      total: state.items.reduce((s, i) => s + i.price * i.qty, 0),
      add,
      setQty,
      remove,
      clear,
    }),
    [state, add, setQty, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}
