// ============================================================================
// Fotos de produto enviadas pelo painel: conferir o arquivo, guardar no banco, buscar e apagar.
//
// Quem usa: as ações de produto (src/app/admin/actions.ts) ao salvar o formulário, e a rota pública
// /api/images/[id], que entrega a foto ao navegador.
//
// Por que no banco: na Vercel o disco do servidor é somente leitura, então não dá para gravar
// arquivos. Guardar a foto na tabela product_images deixa o dono trocar a foto pelo painel, sem
// conta extra e sem novo deploy. Cada foto enviada é uma linha NOVA e nunca é alterada depois, então
// o endereço /api/images/<id> pode ficar em cache para sempre.
//
// SEGURANÇA: o tipo do arquivo NÃO é o que o navegador diz (isso é falsificável), e sim o que o
// conteúdo mostra (os primeiros bytes de todo JPEG, PNG e WebP). Qualquer outra coisa é recusada.
// ============================================================================

import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { productImages } from "@/server/db/schema";

/** Tamanho máximo de uma foto: 2 MB (o banco também confere). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Descobre o tipo da imagem pelos primeiros bytes do arquivo, ou devolve null se não for
 * JPEG, PNG nem WebP. É a única fonte de verdade sobre o tipo.
 */
export function detectImageType(b: Uint8Array): ImageType | null {
  // JPEG começa com FF D8 FF.
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG começa com 89 "PNG" 0D 0A 1A 0A.
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  // WebP é um contêiner RIFF: "RIFF" + 4 bytes de tamanho + "WEBP".
  if (b.length >= 12) {
    const txt = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
    if (txt(0, 4) === "RIFF" && txt(8, 12) === "WEBP") return "image/webp";
  }
  return null;
}

/**
 * Confere o arquivo enviado no formulário. Devolve os bytes e o tipo, ou o motivo da recusa.
 * Um campo de arquivo sem arquivo escolhido chega como File vazio: isso NÃO é erro, só significa
 * "o dono não trocou a foto" (quem chama trata o caso antes).
 */
export async function checkImageFile(file: File): Promise<{ ok: true; bytes: Uint8Array; type: ImageType } | { ok: false; error: string }> {
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "A foto é grande demais: o máximo é 2 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "A foto deve ser um arquivo JPG, PNG ou WebP." };
  return { ok: true, bytes, type };
}

/** Guarda uma foto nova e devolve o endereço para gravar no produto (ex.: /api/images/12). */
export async function saveImage(bytes: Uint8Array, type: ImageType): Promise<string> {
  const db = await getDb();
  const [row] = await db
    .insert(productImages)
    .values({ contentType: type, data: Buffer.from(bytes) })
    .returning({ id: productImages.id });
  return `/api/images/${row.id}`;
}

/** Busca uma foto pelo número, para a rota pública entregar ao navegador. */
export async function getImage(id: number): Promise<{ type: ImageType; data: Uint8Array } | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const db = await getDb();
  const [row] = await db.select().from(productImages).where(eq(productImages.id, id));
  return row ? { type: row.contentType, data: row.data } : null;
}

/**
 * Apaga a foto de um endereço /api/images/<id>, se for desse tipo (fotos do projeto, em
 * /products/, não são tocadas). Chamada quando o dono troca ou remove a foto, para não acumular
 * arquivos órfãos no banco.
 */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  const m = /^\/api\/images\/(\d{1,9})$/.exec(url ?? "");
  if (!m) return;
  const db = await getDb();
  await db.delete(productImages).where(eq(productImages.id, Number(m[1])));
}
