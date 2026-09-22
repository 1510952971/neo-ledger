FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

# Vinext/workerd uses the operating system trust store for outbound HTTPS.
# node:bookworm-slim does not include the CA bundle by default, which makes
# Resend fail with "TLS peer's certificate is not trusted" in the container.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
VOLUME ["/app/.wrangler"]
HEALTHCHECK --interval=30s --timeout=8s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/app-update/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/run-container.mjs"]
