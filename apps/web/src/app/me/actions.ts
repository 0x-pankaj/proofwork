"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/auth";
import { api } from "@/lib/api";

/** Records where someone gets paid, once they have signed to prove the address is theirs. */
export async function savePayoutAddress(input: {
  address: string;
  nonce: string;
  signature: string;
}): Promise<{ payoutAddress: string }> {
  const user = await currentUser();
  if (!user) throw new Error("Sign in with GitHub first.");

  const result = await api<{ payoutAddress: string }>("/v1/users/me/payout", {
    method: "POST",
    body: input,
    actingUserId: user.id,
  });

  revalidatePath("/me");
  return result;
}
