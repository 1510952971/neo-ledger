# Security policy

Neo Ledger stores financial records. Please do not publish a suspected vulnerability, credential, backup, or customer data in an issue.

## Reporting

Send a private report to the security contact configured by the deployment operator. A hosted deployment must publish a dedicated address such as `security@your-domain.example`; a self-hosted operator should keep the report address in its support documentation. Include:

- affected version, deployment mode and URL shape (never include secrets);
- a minimal reproduction and impact;
- whether data was read, changed or deleted;
- a safe contact method for follow-up.

Target response times are acknowledgement within 2 business days, triage within 5 business days, and a mitigation plan for confirmed P0/P1 issues within 7 days. Active exploitation or exposed credentials are handled immediately.

Do not open a public issue, attach a database export, or disclose a working exploit before the maintainer has confirmed a fix or coordinated disclosure date. If the deployment's private security channel is unavailable, contact the repository maintainers through a private channel and mark the message **security-sensitive**.

## Supported versions

The latest released minor version of the current major line receives security fixes. The previous minor line is supported for 90 days after a release so that self-hosted operators have a migration window. Preview and development builds are not security-supported; report issues against the exact commit or package version used.

## Release requirements

- `npm audit --omit=dev --audit-level=high` must report no high/critical production vulnerabilities;
- the full test, typecheck, lint and production build must pass;
- `npm run password:check` must pass so a password denylist update cannot silently shrink or violate the server policy;
- release artifacts must have a checksum, SBOM and immutable image digest;
- a restore drill and rollback plan must be recorded for every hosted release.

## Deployment identity boundary

`oai-authenticated-user-*` headers are ignored by default. Enabling `NEO_TRUSTED_AUTH_HEADERS` requires `NEO_TRUSTED_AUTH_SECRET`, `NEO_TRUSTED_AUTH_AUDIENCE` and an allowlisted `NEO_TRUSTED_PROXY_IPS`. The gateway signs `email\naudience\ntimestamp\nnonce` with HMAC-SHA-256. Proofs expire after five minutes and a nonce cannot be reused.

## User report handling

Audit records intentionally exclude passwords, session tokens, backup contents and raw bill files. Users can export or delete their account data; operators must not request a full backup as a debugging attachment.

Account deletion removes the user's ledger, accounts, transactions, snapshots, import batches, sync packages, integration tokens, MFA/Passkey credentials and active sessions in one database batch. A minimal `auth.delete_account` audit event may be retained for security and abuse investigation; it contains no financial record, credential or backup payload. Hosted deployments must document the retention period and restrict audit-table access to authorized operators.
