/** Check for an HTTPS share origin. Actual device reachability depends on deployment. */
export function publicArUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/, "");
    if (
      url.protocol !== "https:" || url.username || url.password ||
      !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host.endsWith(".lan") || /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ) return null;
    return url;
  } catch {
    return null;
  }
}

export function sharedModelUrl(value: string, origin: string, token: string, format: "glb" | "usdz") {
  const url = publicArUrl(value);
  return url?.origin === origin &&
    url.pathname === `/api/v1/share/${encodeURIComponent(token)}/${format}` &&
    !url.search && !url.hash ? url.href : null;
}
