import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** The session every server component reads: our user id, plus the GitHub login. */
  interface Session {
    user: { id: string; login: string } & DefaultSession["user"];
  }
}
