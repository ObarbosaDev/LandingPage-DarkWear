// ============================================================================
// Página POLÍTICA DE PRIVACIDADE: /privacidade
//
// O que diz, em linguagem simples (LGPD): quais dados a conta guarda, para quê, por quanto tempo e como
// o cliente exclui. Linkada no cadastro (a pessoa aceita antes de criar a conta).
// IMPORTANTE para o dono: este texto descreve o que o SISTEMA faz hoje. Se algo mudar (por exemplo, um
// serviço de e-mail ou de frete passar a receber dados), o texto precisa mudar junto. Revise com quem
// cuida do jurídico da loja antes de publicar.
// ============================================================================

import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacidade" };

// Cada bloco: um título curto e um texto direto.
const BLOCOS = [
  {
    titulo: "Que dados guardamos",
    texto:
      "Quando você cria uma conta: nome, e-mail, celular e a sua senha (a senha é guardada apenas de forma embaralhada, nunca em texto: nem nós conseguimos lê-la). Quando você compra: as peças do pedido, os valores, as datas e a situação do pagamento. Não pedimos CPF.",
  },
  {
    titulo: "Para que usamos",
    texto:
      "Para identificar você nos pedidos, mostrar o seu histórico, falar com você sobre a entrega pelo WhatsApp e cumprir obrigações da loja. Não vendemos nem compartilhamos os seus dados para propaganda.",
  },
  {
    titulo: "O pagamento",
    texto:
      "Os dados do cartão são digitados na página do Mercado Pago, nunca aqui. A gente só fica sabendo se o pagamento foi aprovado e qual foi a forma (cartão ou Pix).",
  },
  {
    titulo: "Por quanto tempo",
    texto:
      "Os dados da conta ficam enquanto a conta existir. Os pedidos precisam ser guardados pela loja por exigência legal e fiscal, mas depois que você exclui a conta eles deixam de estar ligados ao seu nome, e-mail e celular.",
  },
  {
    titulo: "Seus direitos",
    texto:
      "Você pode ver os seus dados na página Sua conta, trocar a senha, sair de todos os aparelhos e excluir a conta a qualquer momento, sem precisar pedir a ninguém. Para qualquer outra dúvida sobre os seus dados, fale com a gente pelo WhatsApp.",
  },
];

export default function PrivacidadePage() {
  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-14 md:pt-20">
        <h1 className="font-display text-[clamp(3rem,10vw,8rem)] uppercase leading-[0.9]">Privacidade</h1>
        <p className="mt-6 text-xl font-medium">
          A {SITE.name} guarda o mínimo necessário para entregar o seu pedido. Aqui está tudo, sem letra miúda.
        </p>
        <div className="mt-12 flex flex-col gap-10">
          {BLOCOS.map((b, i) => (
            <div key={b.titulo} className="border-t-2 border-foreground pt-5">
              <p className="font-mono text-sm font-bold">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="mt-1 font-display text-4xl uppercase leading-none">{b.titulo}</h2>
              <p className="mt-3 text-lg font-medium">{b.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
