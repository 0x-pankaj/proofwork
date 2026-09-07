import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { api } from "@/lib/api";

/**
 * Sign-in with GitHub, which is also how someone proves the login their bounties and
 * claims are attached to. The database row is created here, once, and the API is told
 * about it; every later call carries that user's id rather than a GitHub token.
 */

interface GitHubProfile {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The app runs behind Cloudflare rather than Vercel, so Auth.js needs to be told the
  // forwarded host is the real one.
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      if (!profile) return token;

      const github = profile as unknown as GitHubProfile;
      const user = await api<{ id: string; login: string }>("/v1/users", {
        method: "POST",
        body: {
          githubId: String(github.id),
          login: github.login,
          name: github.name ?? null,
          avatarUrl: github.avatar_url ?? null,
        },
      });

      return { ...token, userId: user.id, login: user.login };
    },

    session({ session, token }) {
      // The JWT is a plain claims object; these two are the ones we put there above.
      const claims = token as { userId?: string; login?: string };
      if (claims.userId) session.user.id = claims.userId;
      if (claims.login) session.user.login = claims.login;
      return session;
    },
  },
});

/** The signed-in user, or null. Every page that needs an identity starts here. */
export async function currentUser(): Promise<{ id: string; login: string } | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.login) return null;
  return { id: session.user.id, login: session.user.login };
}
