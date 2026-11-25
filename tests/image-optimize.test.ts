// ============================================================================
// Testes da OTIMIZAÇÃO DE FOTOS (otimizarFoto em src/server/admin/images.ts): toda foto enviada pelo painel é
// reduzida, convertida para WebP e SEM os metadados (EXIF: localização do celular, modelo da câmera...).
// Imagens reais são geradas na hora; nada é lido do disco.
// ============================================================================

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LADO_MAXIMO_DA_FOTO, otimizarFoto } from "@/server/admin/images";

/** Uma imagem de verdade (cor lisa) no formato pedido. */
async function imagem(largura: number, altura: number, formato: "jpeg" | "png" | "webp", extra: { alpha?: boolean; exif?: boolean } = {}) {
  let s = sharp({ create: { width: largura, height: altura, channels: extra.alpha ? 4 : 3, background: extra.alpha ? { r: 255, g: 0, b: 0, alpha: 0.5 } : { r: 200, g: 30, b: 30 } } });
  if (extra.exif) s = s.withExif({ IFD0: { Copyright: "SEGREDO-DO-CELULAR" } });
  return new Uint8Array(await s.toFormat(formato).toBuffer());
}

describe("otimizarFoto", () => {
  it("foto grande é reduzida ao lado máximo, mantendo a proporção, e vira WebP", async () => {
    const r = await otimizarFoto(await imagem(4000, 3000, "jpeg"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.type).toBe("image/webp");
    const m = await sharp(r.bytes).metadata();
    expect(m.format).toBe("webp");
    expect(m.width).toBe(LADO_MAXIMO_DA_FOTO);
    expect(m.height).toBe(Math.round((LADO_MAXIMO_DA_FOTO * 3000) / 4000));
  });

  it("foto vertical também respeita o lado máximo", async () => {
    const r = await otimizarFoto(await imagem(1000, 5000, "png"));
    if (!r.ok) throw new Error(r.error);
    const m = await sharp(r.bytes).metadata();
    expect(m.height).toBe(LADO_MAXIMO_DA_FOTO);
    expect(m.width).toBe(Math.round((LADO_MAXIMO_DA_FOTO * 1000) / 5000));
  });

  it("foto pequena NÃO é ampliada", async () => {
    const r = await otimizarFoto(await imagem(300, 200, "jpeg"));
    if (!r.ok) throw new Error(r.error);
    const m = await sharp(r.bytes).metadata();
    expect([m.width, m.height]).toEqual([300, 200]);
  });

  it("a transparência de um PNG é mantida (peça escura em fundo transparente)", async () => {
    const r = await otimizarFoto(await imagem(200, 200, "png", { alpha: true }));
    if (!r.ok) throw new Error(r.error);
    const m = await sharp(r.bytes).metadata();
    expect(m.hasAlpha).toBe(true);
  });

  it("os metadados (EXIF) NÃO saem na foto final", async () => {
    const original = await imagem(400, 300, "jpeg", { exif: true });
    expect((await sharp(original).metadata()).exif).toBeDefined(); // a foto de entrada tinha EXIF
    const r = await otimizarFoto(original);
    if (!r.ok) throw new Error(r.error);
    expect((await sharp(r.bytes).metadata()).exif).toBeUndefined();
    expect(Buffer.from(r.bytes).includes(Buffer.from("SEGREDO-DO-CELULAR"))).toBe(false);
  });

  it("aceita os três formatos de entrada", async () => {
    for (const f of ["jpeg", "png", "webp"] as const) {
      const r = await otimizarFoto(await imagem(120, 120, f));
      expect(r.ok, f).toBe(true);
    }
  });

  it("arquivo com cabeçalho de imagem mas conteúdo quebrado é recusado, sem lançar", async () => {
    const quebrado = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3, 4, 5, 6]);
    const r = await otimizarFoto(quebrado);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/corrompid|não foi possível/i) });
  });

  it("foto com dimensões absurdas (bomba de descompressão) é recusada", async () => {
    // 8000 x 8000 = 64 milhões de pixels (um PNG liso quase não ocupa bytes), acima do limite de 40 milhões.
    const enorme = await imagem(8000, 8000, "png");
    const r = await otimizarFoto(enorme);
    expect(r.ok).toBe(false);
  }, 60_000);

  it("a foto final é bem menor que um JPEG grande de entrada", async () => {
    // Ruído aleatório é o pior caso para compressão, mas ainda assim reduzir o tamanho em pixels reduz os bytes.
    const ruido = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: "gaussian", mean: 128, sigma: 40 } } }).jpeg({ quality: 95 }).toBuffer();
    const r = await otimizarFoto(new Uint8Array(ruido));
    if (!r.ok) throw new Error(r.error);
    expect(r.bytes.length).toBeLessThan(ruido.length);
  }, 60_000);
});
