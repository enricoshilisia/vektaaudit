import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const FLASH_COOKIE = "va_flash";

/** The pending message, for the root layout to hand to the banner. */
export async function readFlash() {
  return (await cookies()).get(FLASH_COOKIE)?.value || null;
}

/**
 * Stops a server action with a message the person can act on: back to the page they were on, with the message
 * shown in a banner. (Production builds hide the text of thrown errors, so a plain throw would only say "error".)
 */
export async function fail(message: string): Promise<never> {
  return flashAndReturn(message);
}

/** Like fail, for good news: back to the page with a confirmation. */
export async function notice(message: string): Promise<never> {
  return flashAndReturn(`ok:${message}`);
}

async function flashAndReturn(message: string): Promise<never> {
  (await cookies()).set(FLASH_COOKIE, `${Date.now()}|${message}`, { path: "/", maxAge: 60, sameSite: "lax" });
  const ref = (await headers()).get("referer");
  let back = "/dashboard";
  try {
    if (ref) {
      const u = new URL(ref);
      back = u.pathname + u.search;
    }
  } catch {}
  redirect(back);
}
