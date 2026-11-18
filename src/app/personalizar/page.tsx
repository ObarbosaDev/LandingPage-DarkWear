"use client";

import { useEffect, useMemo, useState } from "react";
import { ShirtPlacer, type PlacementId } from "@/components/ShirtPlacer";
import { TeeCard } from "@/components/TeeCard";

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
  const field = "w-full border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-foreground";
  const chip = (active: boolean) =>
    `border px-4 py-2 text-sm uppercase tracking-widest ${
      active ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:text-foreground"
    }`;

  return (
    <>
    <section className="mx-auto max-w-6xl px-4 pt-12">
      <TeeCard placement={placement} />
    </section>

    <section className="mx-auto grid max-w-6xl gap-12 px-4 py-12 lg:grid-cols-2">
      <div>
        <p className="eyebrow">Encomenda</p>
        <h1 className="title-street mb-8 text-[clamp(3.5rem,8vw,6.5rem)]">Sua arte, sua blusa</h1>

        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="eyebrow">1. Arte</span>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border bg-surface p-8 text-center hover:border-foreground">
              <span className="font-bold uppercase">{file ? file.name : "Escolher arquivo"}</span>
              <span className="text-xs text-muted">PNG com fundo transparente, JPG, SVG ou PDF · até {MAX_MB} MB</span>
              <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileError && <p className="text-sm text-red-400">{fileError}</p>}
          </div>

          <div className="flex flex-col gap-3">
            <span className="eyebrow">2. Modelo</span>
            <div className="flex flex-wrap gap-2">
              {MODELS.map((m) => (
                <button key={m} type="button" onClick={() => setModel(m)} className={chip(model === m)}>{m}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="eyebrow">3. Cor</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={chip(color === c)}>{c}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="eyebrow">4. Tamanho</span>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button key={s} type="button" onClick={() => setSize(s)} className={`h-11 min-w-11 border px-3 text-sm font-bold ${size === s ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:text-foreground"}`}>{s}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="eyebrow">5. Onde a arte vai</span>
            <ShirtPlacer value={placement} onChange={setPlacement} />
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="name" className="eyebrow">6. Nome ou apelido (opcional)</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} />
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="notes" className="eyebrow">7. Detalhes (opcional)</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className={field} placeholder="Posição da estampa, tamanho da arte, observações" />
          </div>

          <label className="flex items-start gap-3 text-sm text-muted">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1 accent-white" />
            <span>Declaro que tenho direito de uso sobre a arte enviada.</span>
          </label>

          <button
            type="button"
            onClick={enviar}
            disabled={!canSend}
            className="bg-foreground py-4 text-sm font-bold uppercase tracking-widest text-background hover:opacity-85 disabled:opacity-30"
          >
            {status === "loading" ? "Abrindo WhatsApp…" : "Finalizar pelo WhatsApp"}
          </button>
          {!file && <p className="text-xs text-muted">Escolha a arte para continuar.</p>}
          {status === "error" && <p className="text-sm text-red-400">{error}</p>}
          {file && (
            <p className="text-xs text-muted">
              Depois de abrir o WhatsApp, anexe o arquivo <strong>{file.name}</strong> na conversa. O site não envia a arte automaticamente.
            </p>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow mb-3">Prévia</p>
        <div className="flex aspect-square items-center justify-center overflow-hidden border border-border bg-black">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Prévia da arte" className="max-h-full max-w-full object-contain p-6" />
          ) : (
            <span className="eyebrow">{file ? "PDF selecionado" : "sua arte aparece aqui"}</span>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">{model} · {color} · tamanho {size}</p>
      </aside>
    </section>
    </>
  );
}
