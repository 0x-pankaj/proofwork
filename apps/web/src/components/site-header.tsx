import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { buttonStyles } from "@/components/ui";

const NAV = [
  { href: "/", label: "Board" },
  { href: "/board/arc", label: "Arc board" },
  { href: "/new", label: "Fund an issue" },
  { href: "/me", label: "You" },
];

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-4 sm:px-8">
        <Link href="/" className="font-semibold tracking-tight">
          Proofwork
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-ink-soft sm:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {session?.user ? (
            <>
              <span className="hidden text-sm text-ink-soft sm:inline">@{session.user.login}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className={buttonStyles.quiet}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/me" });
              }}
            >
              <button type="submit" className={buttonStyles.secondary}>
                Sign in with GitHub
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
