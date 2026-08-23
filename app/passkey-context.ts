export function passkeyRequestContext(request: Request) {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local)
    throw new Error("Passkey 仅可在 HTTPS 或本机环境使用");
  return { rpID: url.hostname, origin: url.origin };
}
