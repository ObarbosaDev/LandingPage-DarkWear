"use client";

import { useEffect, useMemo, useState } from "react";
import { ShirtPlacer } from "@/components/ShirtPlacer";
import { COLORS, MODELS, SIZES, type PlacementId } from "@/lib/custom-order-options";
import { formatCents } from "@/lib/money";

const ACCEPT = ".png,.jpg,.jpeg,.svg,.pdf";
const MAX_MB = 25;
const PRICE_FROM_CENTS = 7000; // preço de partida, exemplo: troque pelo valor real da encomenda

export default function PersonalizarPage() {
  const [name, setName] = useState("");
  const [model, setModel] = useState<string>(MODELS[0]);
  const [color, setColor] = useState<string>(COLORS[0]);
  const [size, setSize] = useState("M");
  const [placement, setPlacement] = useState<PlacementId>("frente");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [fileError, setFileError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [arrastando, setArrastando] = useState(false);

  // Prévia local da arte (não sobe para o servidor).
  const preview = useMemo(
    () => (file && file.type !== "application/pdf" ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

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

  async function enviar() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/custom-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const canSend = rights && !!file && status !== "loading";
  const label = "font-mono text-sm uppercase tracking-[0.15em]";
  const field =
    "w-full border-2 border-background bg-transparent px-4 py-3 text-lg font-medium text-background outline-none placeholder:text-neutral-600 focus:bg-background focus:text-foreground focus:placeholder:text-neutral-400";
  const chip = (active: boolean) =>
    `min-h-11 border-2 border-background px-4 py-2 text-base font-medium transition-colors ${
      active ? "bg-background text-foreground" : "text-background hover:bg-background hover:text-foreground"
    }`;

  return (
    <>
      {/* A abertura é a própria área de soltar o arquivo: arrasta a arte para qualquer lugar do bloco. */}
      <section className="bg-background text-foreground">
        <label
          onDragOver={(e) => {
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
            <span className="flex flex-wrap items-center justify-between gap-4 font-display text-3xl uppercase leading-none md:text-4xl">
              <span>{file ? `✓ ${file.name}` : "Ou toque para escolher o arquivo"}</span>
              <span aria-hidden="true">↓</span>
            </span>
          </span>
          <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {fileError && (
          <p role="alert" className="mx-auto max-w-7xl px-6 py-4 text-lg font-bold">{fileError}</p>
        )}
      </section>

      <section className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-10">
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

            <div className="flex flex-col gap-3">
              <span className={label}>4. Onde a arte vai</span>
              <ShirtPlacer value={placement} onChange={setPlacement} />
            </div>

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

            <label className="flex items-start gap-3 text-lg font-medium">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1.5 h-5 w-5 accent-black" />
              <span>Declaro que tenho direito de uso sobre a arte enviada.</span>
            </label>

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
              {file && (
                <p className="text-lg font-medium">
                  Depois de abrir o WhatsApp, anexe o arquivo <strong>{file.name}</strong> na conversa. O site não envia a arte automaticamente.
                </p>
              )}
            </div>
          </div>

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
