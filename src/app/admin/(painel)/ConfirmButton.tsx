// ============================================================================
// Botão "com confirmação": pergunta "tem certeza?" antes de enviar o formulário.
//
// Quem usa: a tela /admin/pedidos, no botão "Cancelar pedido" (cancelar devolve as peças ao estoque
// e não tem volta, então vale a pergunta). Precisa ser componente de navegador porque usa o
// window.confirm do navegador.
// ============================================================================

"use client";

// Botão de envio que pede confirmação antes de uma ação sem volta.
export function ConfirmButton({
  message,
  className,
  children,
}: {
  // Texto da pergunta ("Cancelar o pedido DW-00001? As peças voltam ao estoque.").
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        // Se o dono responder "Cancelar" na pergunta, impedimos o envio do formulário.
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
