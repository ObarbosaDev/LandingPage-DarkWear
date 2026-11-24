// ============================================================================
// Formulário de ENDEREÇO DE ENTREGA da página /conta (etiqueta "Entrega").
//
// Como funciona: o cliente digita o CEP e o formulário busca rua, bairro, cidade e estado sozinho (consulta feita
// pelo SERVIDOR, em /api/cep/<cep>: o navegador nunca fala com serviços de terceiros). É só uma comodidade: se a
// busca falhar, o CEP não existir ou o serviço estiver fora do ar, a pessoa digita tudo à mão e o formulário
// funciona do mesmo jeito. O número e o complemento ela sempre digita.
//
// Quem decide é o servidor (saveAddressAction confere cada campo de novo). Aqui os campos são controlados só para
// a busca poder preenchê-los; o que a busca devolve nunca sobrescreve o que a pessoa já digitou em campo não vazio
// de rua/bairro/cidade quando o serviço devolve vazio.
// ============================================================================

"use client";

import { useActionState, useState } from "react";
import { saveAddressAction, type ClienteFormState } from "@/app/actions-cliente";
import { UFS } from "@/lib/ufs";

const rotulo = "font-mono text-xs font-bold uppercase tracking-[0.18em]";
const campo =
  "w-full border-0 border-b-2 border-background bg-transparent py-2 font-mono text-lg text-background outline-none transition-colors focus:bg-background focus:px-2 focus:text-foreground";
const botao =
  "border-2 border-background bg-background px-5 py-3 font-display text-xl uppercase tracking-wide text-foreground transition-colors hover:bg-transparent hover:text-background disabled:cursor-wait";

/** O endereço como o formulário o recebe da página (CEP só com dígitos, como no banco). */
export type EnderecoInicial = { zip: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };

export function EnderecoForm({ inicial }: { inicial: EnderecoInicial | null }) {
  const [estado, acao, pending] = useActionState<ClienteFormState, FormData>(saveAddressAction, {});
  // Depois de um erro do servidor, o que foi digitado volta; sem erro, vale o endereço salvo.
  const v = (k: string, padrao: string) => estado.values?.[k] ?? padrao;

  const [cep, setCep] = useState(v("cep", inicial?.zip ?? ""));
  const [street, setStreet] = useState(v("street", inicial?.street ?? ""));
  const [district, setDistrict] = useState(v("district", inicial?.district ?? ""));
  const [city, setCity] = useState(v("city", inicial?.city ?? ""));
  const [uf, setUf] = useState(v("state", inicial?.state ?? ""));
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);

  /** Busca o CEP no servidor e preenche rua, bairro, cidade e estado. Falhar nunca impede de digitar à mão. */
  async function buscar(digitos: string) {
    setBuscando(true);
    setAviso("");
    try {
      const res = await fetch(`/api/cep/${digitos}`, { cache: "no-store" });
      if (res.status === 404) return setAviso("CEP não encontrado. Preencha o endereço à mão.");
      if (res.status === 401) return setAviso("Sua sessão expirou. Entre de novo.");
      if (!res.ok) return setAviso("Não deu para consultar o CEP agora. Preencha o endereço à mão.");
      const d = (await res.json()) as { street?: string; district?: string; city?: string; state?: string };
      // Só preenche o que veio com valor: um CEP geral (sem rua) não apaga o que a pessoa já digitou.
      if (d.street) setStreet(d.street);
      if (d.district) setDistrict(d.district);
      if (d.city) setCity(d.city);
      if (d.state) setUf(d.state);
      setAviso("Endereço preenchido. Confira e complete o número.");
    } catch {
      setAviso("Não deu para consultar o CEP agora. Preencha o endereço à mão.");
    } finally {
      setBuscando(false);
    }
  }

  const aoMudarCep = (valor: string) => {
    setCep(valor);
    const digitos = valor.replace(/\D/g, "");
    // Quando o 8º dígito é digitado, busca sozinho.
    if (/^[0-9]{8}$/.test(digitos) && /^[0-9 .-]+$/.test(valor)) void buscar(digitos);
  };
  const buscarAgora = () => {
    const digitos = cep.replace(/\D/g, "");
    if (!/^[0-9]{8}$/.test(digitos)) return setAviso("Digite os 8 números do CEP.");
    void buscar(digitos);
  };

  return (
    <form action={acao} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="cep" className={rotulo}>CEP</label>
        <div className="flex items-end gap-3">
          <input id="cep" name="cep" required inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="01310-100" value={cep} onChange={(e) => aoMudarCep(e.target.value)} className={campo} />
          <button type="button" onClick={buscarAgora} disabled={buscando} className="shrink-0 border-2 border-background px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors hover:bg-background hover:text-foreground disabled:cursor-wait">
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>
        {aviso ? <p role="status" className="text-sm font-bold">{aviso}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="street" className={rotulo}>Rua</label>
        <input id="street" name="street" required autoComplete="address-line1" maxLength={120} value={street} onChange={(e) => setStreet(e.target.value)} className={campo} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="number" className={rotulo}>Número</label>
          <input id="number" name="number" required maxLength={10} placeholder="ou S/N" defaultValue={v("number", inicial?.number ?? "")} className={campo} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="complement" className={rotulo}>Complemento</label>
          <input id="complement" name="complement" maxLength={60} placeholder="opcional" defaultValue={v("complement", inicial?.complement ?? "")} className={campo} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="district" className={rotulo}>Bairro</label>
        <input id="district" name="district" required maxLength={80} value={district} onChange={(e) => setDistrict(e.target.value)} className={campo} />
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="city" className={rotulo}>Cidade</label>
          <input id="city" name="city" required autoComplete="address-level2" maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} className={campo} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="state" className={rotulo}>Estado</label>
          <select id="state" name="state" required value={uf} onChange={(e) => setUf(e.target.value)} className={`${campo} bg-foreground`}>
            <option value="">UF</option>
            {UFS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {estado.error ? (
        <p role="alert" className="border-2 border-background p-3 text-base font-bold">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? (
        <p role="status" className="border-2 border-background p-3 text-base font-bold">
          {estado.ok}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={botao}>
        {pending ? "Salvando…" : "Salvar endereço"}
      </button>
    </form>
  );
}
