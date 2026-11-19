// ============================================================================
// API: GET /api/images/<id>  — entrega a foto de um produto enviada pelo painel.
//
// Quem usa: o navegador (e o componente Image do Next) ao mostrar a foto de uma peça cujo endereço
// é /api/images/<id>. Quem grava as fotos é src/server/admin/images.ts.
//
// Cache "para sempre" (immutable): uma foto nunca muda depois de enviada. Trocar a foto de um
// produto cria um número novo, então o endereço velho simplesmente deixa de ser usado.
// "nosniff" impede o navegador de tratar o arquivo como outro tipo que não o declarado.
// ============================================================================

import { getImage } from "@/server/admin/images";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Só dígitos: qualquer outra coisa nem chega ao banco.
  const img = /^\d{1,9}$/.test(id) ? await getImage(Number(id)) : null;
  if (!img) return new Response("Foto não encontrada", { status: 404 });

  return new Response(Buffer.from(img.data), {
    headers: {
      "Content-Type": img.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
