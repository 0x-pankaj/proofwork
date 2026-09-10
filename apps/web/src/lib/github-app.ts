/**
 * The GitHub App's install link. The slug is configuration, not a constant, because the
 * development and production apps are different registrations with different names.
 */
export function installUrl(): string {
  const slug = process.env.GITHUB_APP_SLUG || "proofwork-arc";
  return `https://github.com/apps/${slug}/installations/new`;
}
