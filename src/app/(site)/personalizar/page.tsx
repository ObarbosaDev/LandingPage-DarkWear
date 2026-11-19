// ============================================================================
// Página PERSONALIZAR: /personalizar. O cliente manda a PRÓPRIA arte para estampar numa camiseta.
//
// Estrutura:
//   1. Abertura: um bloco gigante que é a "área de soltar o arquivo" (arrastar a arte ou tocar para
//      escolher). A prévia aparece mais abaixo.
//   2. Formulário: modelo, cor, tamanho, onde a arte vai, nome e detalhes (opcionais), declaração
//      de direito de uso e o botão "Finalizar pelo WhatsApp".
//   3. Prévia (coluna da direita): a arte escolhida, o resumo das opções e o preço de partida.
//
// Fluxo: ao finalizar, os DADOS (não o arquivo) vão para POST /api/custom-orders; o servidor
// registra a encomenda e devolve o link do WhatsApp. O cliente anexa o arquivo na própria conversa
// (o site não recebe o arquivo, de propósito: simplifica e evita armazenar artes de terceiros).
//
// É componente de navegador ("use client") porque é todo interativo (arrastar, escolher, prévia).
// ============================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { ShirtPlacer } from "@/components/ShirtPlacer";
import { COLORS, MODELS, SIZES, type PlacementId } from "@/lib/custom-order-options";
import { formatCents } from "@/lib/money";

// Formatos aceitos pelo seletor de arquivo e o tamanho máximo (a conferência do tamanho é feita em onFile).
const ACCEPT = ".png,.jpg,.jpeg,.svg,.pdf";
const MAX_MB = 25;
const PRICE_FROM_CENTS = 7000; // preço de partida, exemplo: troque pelo valor real da encomenda

export default function PersonalizarPage() {
  // Escolhas do cliente. Cada uma começa num valor padrão sensato (primeira opção da lista).
  const [name, setName] = useState("");
  const [model, setModel] = useState<string>(MODELS[0]);
  const [color, setColor] = useState<string>(COLORS[0]);
  const [size, setSize] = useState("M");
  const [placement, setPlacement] = useState<PlacementId>("frente");
  const [notes, setNotes] = useState("");
  // A arte escolhida (arquivo do próprio computador do cliente; nunca enviada ao servidor).
  const [file, setFile] = useState<File | null>(null);
  // Declaração obrigatória de que o cliente tem direito de usar aquela arte.
  const [rights, setRights] = useState(false);
  const [fileError, setFileError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  // true enquanto um arquivo está sendo arrastado sobre a área de soltar (muda a cor do bloco).
  const [arrastando, setArrastando] = useState(false);

  // Prévia local da arte (não sobe para o servidor).
  // createObjectURL cria um endereço temporário que aponta para o arquivo na memória do navegador,
  // para mostrá-lo numa <img> sem enviá-lo a lugar nenhum. PDF não tem prévia de imagem.
  const preview = useMemo(
    () => (file && file.type !== "application/pdf" ? URL.createObjectURL(file) : null),
    [file],
  );
  // Libera da memória o endereço temporário quando a arte muda ou a página fecha.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  /**
   * Recebe o arquivo (do seletor ou de arrastar e soltar) e o confere antes de aceitar.
   * Arrastar e soltar não passa pelo filtro do seletor, então formato e tamanho são conferidos aqui.
   */
  function onFile(f: File | undefined) {
    setFileError("");
    if (!f) return setFile(null);
    if (!/\.(png|jpe?g|svg|pdf)$/i.test(f.name)) {
      setFileError("Formato não aceito. Envie PNG, JPG, SVG ou PDF.");
      return setFile(null);
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setFileError(`Arquivo acima de ${MAX_MB} MB.`);
      return setFile(null);
    }
    setFile(f);
  }

  /** Envia os dados da encomenda ao servidor e leva o cliente ao WhatsApp. */
  async function enviar() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/custom-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Vai só o NOME do arquivo (para o dono saber o que esperar), nunca o conteúdo dele.
        body: JSON.stringify({ name, model, color, size, placement, notes, fileName: file?.name }),
      });
      const data = (await res.json()) as { whatsappUrl?: string; error?: string };
      if (!res.ok || !data.whatsappUrl) throw new Error(data.error ?? "Não foi possível enviar.");
      window.location.href = data.whatsappUrl;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    }
  }

  // O botão final só libera com arte escolhida E a declaração de direito de uso marcada.
  const canSend = rights && !!file && status !== "loading";
  // Estilos repetidos: rótulo pequeno, campo de texto e botão de escolha (cada um tem a versão "ativa").
  const label = "font-mono text-sm uppercase tracking-[0.15em]";
  const field =
    "w-full border-2 border-background bg-transparent px-4 py-3 text-lg font-medium text-background outline-none placeholder:text-neutral-600 focus:bg-background focus:text-foreground focus:placeholder:text-neutral-400";
  const chip = (active: boolean) =>
    `min-h-11 border-2 border-background px-4 py-2 text-base font-medium transition-colors ${
      active ? "bg-background text-foreground" : "text-background hover:bg-background hover:text-foreground"
    }`;

  return (
    <>
      {/* ===== ABERTURA: a área de soltar o arquivo ===== */}
      {/* A abertura é a própria área de soltar o arquivo: arrasta a arte para qualquer lugar do bloco. */}
      <section className="bg-background text-foreground">
        {/* Um <label> envolve tudo, então clicar em qualquer ponto do bloco abre o seletor de arquivo
            (o <input type="file"> escondido lá embaixo). Os eventos de arrastar tratam o "soltar". */}
        <label
          onDragOver={(e) => {
            // preventDefault é obrigatório: sem ele o navegador não permite soltar o arquivo aqui.
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
          className={`block cursor-pointer border-y-2 border-dashed border-foreground transition-colors ${
            arrastando ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"
          }`}
        >
          <span className="mx-auto flex min-h-[60vh] max-w-7xl flex-col justify-between gap-10 px-6 py-12 md:py-16">
            <span className="font-mono text-sm uppercase tracking-[0.15em]">
              PNG, JPG, SVG ou PDF · até {MAX_MB} MB
            </span>
            <h1 className="font-display text-[clamp(4rem,13vw,12.5rem)] uppercase leading-[0.86]">
              Solte a<br />sua arte aqui
            </h1>
            {/* Mostra o nome do arquivo escolhido (com ✓) ou a instrução de como escolher. */}
            <span className="flex flex-wrap items-center justify-between gap-4 font-display text-3xl uppercase leading-none md:text-4xl">
              <span>{file ? `✓ ${file.name}` : "Ou toque para escolher o arquivo"}</span>
              <span aria-hidden="true">↓</span>
            </span>
          </span>
          {/* sr-only: escondido visualmente, mas continua acessível (leitores de tela e teclado). */}
          <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {/* Erro do arquivo (formato ou tamanho). role="alert" faz o leitor de tela anunciá-lo. */}
        {fileError && (
          <p role="alert" className="mx-auto max-w-7xl px-6 py-4 text-lg font-bold">{fileError}</p>
        )}
      </section>

      {/* ===== FORMULÁRIO (bloco branco) + PRÉVIA ===== */}
      <section className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-10">
            {/* Passo 1: modelo. As opções vêm de custom-order-options.ts (as mesmas que o servidor aceita). */}
            <div className="flex flex-col gap-3">
              <span className={label}>1. Modelo</span>
              <div className="flex flex-wrap gap-2">
                {MODELS.map((m) => (
                  <button key={m} type="button" onClick={() => setModel(m)} aria-pressed={model === m} className={chip(model === m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Passo 2: cor da peça. */}
            <div className="flex flex-col gap-3">
              <span className={label}>2. Cor</span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} className={chip(color === c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Passo 3: tamanho. */}
            <div className="flex flex-col gap-3">
              <span className={label}>3. Tamanho</span>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s} className={`${chip(size === s)} min-w-14`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Passo 4: onde a arte vai (peito, frente, costas ou manga), em quatro botões grandes. */}
            <div className="flex flex-col gap-3">
              <span className={label}>4. Onde a arte vai</span>
              <ShirtPlacer value={placement} onChange={setPlacement} />
            </div>

            {/* Passos 5 e 6: opcionais (o servidor aceita vazios). */}
            <div className="flex flex-col gap-3">
              <label htmlFor="name" className={label}>5. Nome ou apelido (opcional)</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} />
            </div>

            <div className="flex flex-col gap-3">
              <label htmlFor="notes" className={label}>6. Detalhes (opcional)</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={3}
                className={field}
                placeholder="Posição da estampa, tamanho da arte, observações"
              />
            </div>

            {/* Declaração de direito de uso: o cliente se responsabiliza pela arte (evita pedir
                estampa de arte alheia sem permissão). Sem marcar, o botão final não libera. */}
            <label className="flex items-start gap-3 text-lg font-medium">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1.5 h-5 w-5 accent-black" />
              <span>Declaro que tenho direito de uso sobre a arte enviada.</span>
            </label>

            {/* Botão final e as mensagens que explicam POR QUE ele ainda não está liberado. */}
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={enviar}
                disabled={!canSend}
                className="border-2 border-background bg-background px-8 py-5 font-display text-2xl uppercase tracking-wide text-foreground transition-colors enabled:hover:bg-transparent enabled:hover:text-background disabled:cursor-not-allowed disabled:bg-transparent disabled:text-background"
              >
                {status === "loading" ? "Abrindo WhatsApp…" : "Finalizar pelo WhatsApp"}
              </button>
              {!file && <p className="text-lg font-medium">Solte a arte no bloco do topo para continuar.</p>}
              {file && !rights && <p className="text-lg font-medium">Confirme o direito de uso da arte para continuar.</p>}
              {status === "error" && <p className="border-2 border-background p-3 text-lg font-bold">{error}</p>}
              {/* Lembrete importante: o arquivo NÃO é enviado pelo site; o cliente o anexa no WhatsApp. */}
              {file && (
                <p className="text-lg font-medium">
                  Depois de abrir o WhatsApp, anexe o arquivo <strong>{file.name}</strong> na conversa. O site não envia a arte automaticamente.
                </p>
              )}
            </div>
          </div>

          {/* Coluna da direita (fixa ao rolar em telas largas): prévia da arte e resumo do que foi escolhido. */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className={`${label} mb-3`}>Prévia</p>
            <div className="flex aspect-square items-center justify-center overflow-hidden border-2 border-background bg-background text-foreground">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Prévia da arte" className="max-h-full max-w-full object-contain p-6" />
              ) : (
                <span className="px-6 text-center font-display text-3xl uppercase">
                  {file ? "PDF selecionado" : "Sua arte aparece aqui"}
                </span>
              )}
            </div>
            <p className="mt-3 text-lg font-medium">
              {model} · {color} · tamanho {size}
            </p>
            <p className="mt-2 text-lg font-medium">
              A partir de <span className="font-display text-3xl">{formatCents(PRICE_FROM_CENTS)}</span>
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
