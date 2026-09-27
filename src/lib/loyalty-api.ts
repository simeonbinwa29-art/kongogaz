import { supabase } from "@/integrations/supabase/client";

export type LoyaltyInfo = {
  code: string | null;
  credit: number;
  referredBy: string | null;
  firstOrderPlaced: boolean;
};

export const REFERRAL_BONUS = 5000;

export async function fetchLoyalty(userId: string): Promise<LoyaltyInfo> {
  const { data } = await supabase
    .from("profiles")
    .select("referral_code, loyalty_credit, referred_by, first_order_placed")
    .eq("id", userId)
    .maybeSingle();
  const profile = data as
    | {
        referral_code: string | null;
        loyalty_credit: number | null;
        referred_by: string | null;
        first_order_placed: boolean | null;
      }
    | null
    | undefined;
  return {
    code: profile?.referral_code ?? null,
    credit: Number(profile?.loyalty_credit ?? 0),
    referredBy: profile?.referred_by ?? null,
    firstOrderPlaced: Boolean(profile?.first_order_placed ?? false),
  };
}

export async function consumeCredit(amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const { data, error } = await supabase.rpc("consume_loyalty_credit", { _amount: amount });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function lookupReferrer(code: string): Promise<string | null> {
  if (!code.trim()) return null;
  const { data, error } = await supabase.rpc("find_referrer_by_code", { _code: code.trim() });
  if (error) return null;
  return typeof data === "string" ? data : null;
}

export function buildReferralShareText(code: string) {
  return `🔥 Rejoins-moi sur KONGO GAZ ! Utilise mon code parrainage ${code} à l'inscription et reçois 5 000 FC de remise sur ta première commande de gaz à Kinshasa.`;
}
