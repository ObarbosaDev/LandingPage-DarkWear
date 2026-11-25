// ============================================================================
// A imagem que aparece quando o link da loja é compartilhado (WhatsApp, Instagram, Facebook, Google...).
//
// O Next gera um PNG de 1200 x 630 a partir deste componente, uma vez, no build. Fundo preto, o nome da marca em
// letras gigantes e brancas e a frase da loja: a mesma linguagem do site (preto e branco, sem enfeite). As páginas de
// peça que têm foto usam a foto delas (ver generateMetadata em loja/[slug]/page.tsx); as outras usam esta.
// ============================================================================

import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "#000",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 210, fontWeight: 900, letterSpacing: -6, textTransform: "uppercase", lineHeight: 1 }}>{SITE.name}</div>
        <div style={{ marginTop: 28, fontSize: 52, textTransform: "uppercase", letterSpacing: 6 }}>{SITE.tagline}</div>
        <div style={{ marginTop: 40, width: 220, height: 10, background: "#fff" }} />
      </div>
    ),
    size,
  );
}
