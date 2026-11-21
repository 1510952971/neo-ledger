FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates sqlite3 tar \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/neo-ledger-backup
COPY backup-agent.mjs ./backup-agent.mjs
ENTRYPOINT ["node", "/opt/neo-ledger-backup/backup-agent.mjs"]
