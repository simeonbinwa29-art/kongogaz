import { supabase } from "@/integrations/supabase/client";

export type Promotion = {
  id: string;
  title: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
};

export async function listActivePromotions(): Promise<Promotion[]> {
  const { data } = await supabase
    .from("promotions")
    .select("id,title,description,discount_type,discount_value,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return (data ?? []) as Promotion[];
}

export async function listAllPromotions(): Promise<Promotion[]> {
  const { data } = await supabase
    .from("promotions")
    .select("id,title,description,discount_type,discount_value,is_active")
    .order("created_at", { ascending: false });
  return (data ?? []) as Promotion[];
}

export async function createPromotion(input: Omit<Promotion, "id">) {
  const { error } = await supabase.from("promotions").insert(input);
  if (error) throw error;
}

export async function updatePromotion(id: string, patch: Partial<Omit<Promotion, "id">>) {
  const { error } = await supabase.from("promotions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePromotion(id: string) {
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) throw error;
}

export function subscribePromotions(cb: () => void) {
  const ch = supabase
    .channel("promotions-live-" + Math.random().toString(36).slice(2))
    .on("postgres_changes", { event: "*", schema: "public", table: "promotions" }, cb)
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}
