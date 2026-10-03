"use server";

import { signOut } from "@/auth";
import { clearActingSeller } from "@/modules/sales/application/acting-seller";

export async function logoutAction() {
  // The seller switched by PIN must not carry over to the next login on this device.
  await clearActingSeller();
  await signOut({ redirectTo: "/login" });
}
