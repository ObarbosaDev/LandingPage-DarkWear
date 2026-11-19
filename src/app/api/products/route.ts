import { NextResponse } from "next/server";
import { getProducts } from "@/server/catalog";

export async function GET() {
  return NextResponse.json({ products: await getProducts() });
}
