// ============================================================================
// Testes das FOTOS enviadas pelo painel (src/server/admin/images.ts e a rota /api/images/[id]).
// Por que testar: é um arquivo vindo de fora entrando no banco e sendo servido de volta. O tipo tem
// de ser decidido pelo conteúdo (não pelo nome), o tamanho tem limite e a foto precisa voltar
// idêntica byte a byte.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { productImages, products } from "@/server/db/schema";
import { MAX_IMAGE_BYTES, checkImageFile, deleteImageByUrl, detectImageType, getImage, saveImage } from "@/server/admin/images";
import { parseProductForm } from "@/server/admin/products";
import { GET } from "@/app/api/images/[id]/route";
import { resetDb } from "./helpers/db";

// Cabeçalhos mínimos de cada formato (o resto do arquivo não importa para a detecção).
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const WEBP = [...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WEBP"), 0];
const arquivo = (bytes: number[], nome = "foto.bin", tipo = "application/octet-stream") => new File([new Uint8Array(bytes)], nome, { type: tipo });

beforeEach(async () => {
  await resetDb();
  await (await getDb()).delete(productImages);
});

describe("detectImageType", () => {
  it("reconhece JPEG, PNG e WebP pelo conteúdo", () => {
    expect(detectImageType(new Uint8Array(JPEG))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array(PNG))).toBe("image/png");
    expect(detectImageType(new Uint8Array(WEBP))).toBe("image/webp");
  });

  it("recusa o que não é imagem aceita (SVG, GIF, HTML, PDF, vazio, truncado)", () => {
    const texto = (t: string) => new Uint8Array(Buffer.from(t));
    expect(detectImageType(texto("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(texto("GIF89a...."))).toBeNull();
    expect(detectImageType(texto("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageType(texto("%PDF-1.7"))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // "RIFF" sem "WEBP" (um WAV, por exemplo) não é WebP.
    expect(detectImageType(new Uint8Array([...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WAVE")]))).toBeNull();
  });
});

describe("checkImageFile", () => {
  it("aceita pelo conteúdo, ignorando o nome e o tipo declarado", async () => {
    // O navegador disse "text/plain" e a extensão é .txt, mas os bytes são de um PNG: vale o conteúdo.
    const r = await checkImageFile(arquivo(PNG, "foto.txt", "text/plain"));
    expect(r.ok && r.type).toBe("image/png");
  });

  it("recusa um arquivo que só se DIZ imagem", async () => {
    const falso = new File(["<script>alert(1)</script>"], "foto.png", { type: "image/png" });
    const r = await checkImageFile(falso);
    expect(r.ok).toBe(false);
  });

  it("recusa arquivo acima de 2 MB e aceita o de exatamente 2 MB", async () => {
    const grande = new Uint8Array(MAX_IMAGE_BYTES + 1);
    grande.set(JPEG);
    expect((await checkImageFile(new File([grande], "g.jpg"))).ok).toBe(false);
    const limite = new Uint8Array(MAX_IMAGE_BYTES);
    limite.set(JPEG);
    expect((await checkImageFile(new File([limite], "l.jpg"))).ok).toBe(true);
  });
});

describe("guardar, buscar e apagar", () => {
  it("a foto volta idêntica byte a byte", async () => {
    const bytes = new Uint8Array([...PNG, ...Array.from({ length: 300 }, (_, i) => i % 256)]);
    const url = await saveImage(bytes, "image/png");
    expect(url).toMatch(/^\/api\/images\/\d+$/);
    const img = await getImage(Number(url.split("/").pop()));
    expect(img?.type).toBe("image/png");
    expect(Array.from(img!.data)).toEqual(Array.from(bytes));
  });

  it("cada envio é uma linha nova, com número diferente", async () => {
    const a = await saveImage(new Uint8Array(JPEG), "image/jpeg");
    const b = await saveImage(new Uint8Array(JPEG), "image/jpeg");
    expect(a).not.toBe(b);
  });

  it("apagar remove só a foto enviada, e ignora caminhos do projeto e entradas estranhas", async () => {
    const url = await saveImage(new Uint8Array(JPEG), "image/jpeg");
    await deleteImageByUrl("/products/porsche-gt3.webp"); // arquivo do projeto: não é tocado
    await deleteImageByUrl(null);
    await deleteImageByUrl("/api/images/abc");
    await deleteImageByUrl("/api/images/1; DROP TABLE products");
    expect(await getImage(Number(url.split("/").pop()))).not.toBeNull();
    await deleteImageByUrl(url);
    expect(await getImage(Number(url.split("/").pop()))).toBeNull();
    expect((await (await getDb()).select().from(products)).length).toBeGreaterThan(0);
  });

  it("getImage recusa números inválidos", async () => {
    for (const n of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(await getImage(n), String(n)).toBeNull();
  });
});

describe("rota /api/images/[id]", () => {
  const chamar = (id: string) => GET(new Request("http://x/api/images/" + id), { params: Promise.resolve({ id }) });

  it("entrega a foto com o tipo certo, cache longo e nosniff", async () => {
    const url = await saveImage(new Uint8Array(PNG), "image/png");
    const res = await chamar(url.split("/").pop()!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(PNG);
  });

  it("devolve 404 para número que não existe ou formato inválido", async () => {
    for (const id of ["999999", "0", "abc", "1.5", "-1", "1e3", "12345678901"]) {
      expect((await chamar(id)).status, id).toBe(404);
    }
  });
});

describe("foto do produto no formulário e no banco", () => {
  const form = (image: string) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ slug: "camisa-x", name: "X", price: "10", category: "Coleção", sizes: "M", colors: "Preta", image })) f.set(k, v);
    return f;
  };

  it("o formulário aceita foto do projeto e foto enviada, e recusa o resto", () => {
    expect(parseProductForm(form("/products/a.webp"), "editar").ok).toBe(true);
    expect(parseProductForm(form("/api/images/12"), "editar").ok).toBe(true);
    expect(parseProductForm(form(""), "editar").ok).toBe(true);
    for (const ruim of ["https://outro.site/a.png", "/api/images/abc", "/api/images/1/../x", "/products/../x", "/api/images/1234567890"]) {
      expect(parseProductForm(form(ruim), "editar").ok, ruim).toBe(false);
    }
  });

  // A trava do banco (migração 0006) tem de aceitar a foto enviada e continuar barrando o resto.
  it("o banco aceita /api/images/<n> e recusa endereços de outros sites", async () => {
    const db = await getDb();
    const slug = "oversized-gt3-rs";
    await db.update(products).set({ image: "/api/images/7" }).where(eq(products.slug, slug));
    await expect(db.update(products).set({ image: "https://x.com/a.png" }).where(eq(products.slug, slug))).rejects.toThrow();
  });
});
