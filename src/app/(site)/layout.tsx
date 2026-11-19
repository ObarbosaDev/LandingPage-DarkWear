import { SiteFrame } from "@/components/SiteFrame";

// O painel do dono (/admin) não usa esta moldura.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
