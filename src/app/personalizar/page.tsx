"use client";

import { useEffect, useMemo, useState } from "react";
import { ShirtPlacer, type PlacementId } from "@/components/ShirtPlacer";
import { TeeCard } from "@/components/TeeCard";
import { PageHero } from "@/components/PageHero";

const MODELS = ["Camiseta", "Moletom", "Oversized"];
const SIZES = ["P", "M", "G", "GG", "XG"];
const COLORS = ["Preta", "Off-white", "Cinza chumbo"];
const ACCEPT = ".png,.jpg,.jpeg,.svg,.pdf";
const MAX_MB = 25;

export default function PersonalizarPage() {
  const [name, setName] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState("M");
  const [placement, setPlacement] = useState<PlacementId>("frente");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [fileError, setFileError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

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
      <PageHero
        word="Estampa"
        title="Mande a sua arte"
        lead="Escolhe o modelo, a cor, o tamanho e onde a arte vai. Você fecha tudo no WhatsApp."
      />

      <section className="bg-background pb-16">
        <div className="mx-auto max-w-7xl px-6">
          <TeeCard placement={placement} />
        </div>
      </section>

      <section className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-3">
              <span className={label}>1. Arte</span>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-background p-10 text-center transition-colors hover:bg-background hover:text-foreground">
                <span className="font-[family-name:var(--font-display)] text-3xl uppercase">
                  {file ? file.name : "Escolher arquivo"}
                </span>
                <span className="text-base font-medium">PNG com fundo transparente, JPG, SVG ou PDF · até {MAX_MB} MB</span>
                <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {fileError && <p className="border-2 border-background p-3 text-lg font-bold">{fileError}</p>}
            </div>

            <div className="flex flex-col gap-3">
              <span className={label}>2. Modelo</span>
              <div className="flex flex-wrap gap-2">
                {MODELS.map((m) => (
                  <button key={m} type="button" onClick={() => setModel(m)} aria-pressed={model === m} className={chip(model === m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className={label}>3. Cor</span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} className={chip(color === c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className={label}>4. Tamanho</span>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s} className={`${chip(size === s)} min-w-14`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className={label}>5. Onde a arte vai</span>
              <div className="border-2 border-background bg-background p-6 text-foreground">
                <ShirtPlacer value={placement} onChange={setPlacement} />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label htmlFor="name" className={label}>6. Nome ou apelido (opcional)</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} />
            </div>

            <div className="flex flex-col gap-3">
              <label htmlFor="notes" className={label}>7. Detalhes (opcional)</label>
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
                className="border-2 border-background bg-background px-8 py-5 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-foreground transition-colors enabled:hover:bg-transparent enabled:hover:text-background disabled:cursor-not-allowed disabled:bg-transparent disabled:text-background"
              >
                {status === "loading" ? "Abrindo WhatsApp…" : "Finalizar pelo WhatsApp"}
              </button>
              {!file && <p className="text-lg font-medium">Escolha a arte para continuar.</p>}
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
                <span className="px-6 text-center font-[family-name:var(--font-display)] text-3xl uppercase">
                  {file ? "PDF selecionado" : "Sua arte aparece aqui"}
                </span>
              )}
            </div>
            <p className="mt-3 text-lg font-medium">
              {model} · {color} · tamanho {size}
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
