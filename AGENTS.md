# Mandatory data safety rules

These rules apply to every change, build, deployment, migration, restore, and
troubleshooting action in this repository. Treat them as hard requirements.

1. User data is more important than availability or convenience. Never delete,
   replace, reinitialize, or point an instance at a different database unless
   the user explicitly requests that exact data operation.
2. Before changing application code or deployment configuration on a live
   instance, create and verify a restorable backup of its database and required
   configuration. A healthy response, a running container, or a source archive
   is not a database backup.
3. Keep the database path and persistent volume mapping stable across releases.
   Inspect the effective Compose configuration and actual container mount
   before rebuilding. Stop if the data mount cannot be positively identified.
4. After an update, verify health and that the expected account/data are still
   present before declaring success. If a previously populated instance comes
   up empty, stop writes and preserve both the old backup and the new state;
   never register a replacement account as a workaround.
5. Never claim that devices share data merely because they can log in. Verify
   that they use the same backend and that a test write on one device is read
   back on the other. Separate NAS and OCI databases are separate products
   until an explicit, tested replication flow exists.
6. Do not place financial databases, exports, credentials, or private keys in
   Git, source packages, or logs. Minimize access and redact diagnostics.
7. Native session cookies must be bound to the exact HTTPS origin that issued
   them; never forward credentials across redirects or endpoint changes.
8. Keep offline queues and cached account data isolated by server and account.
   Legacy unscoped mobile data must remain recoverable and must never be
   silently uploaded to a newly selected server or account.
9. Offline sync deduplication must be scoped to the authorized ledger. Never
   acknowledge or discard a queued item because an identifier exists in a
   different user's ledger.
10. The user's selected topology is NAS-primary and OCI-backup: the NAS is the
    only business-write database; OCI stores only encrypted, versioned NAS
    snapshots. Never implement dual-write, automatic account migration, or
    automatic OCI-to-NAS replacement. A recovery drill must use an isolated
    candidate first and preserve the current NAS database for rollback.
11. Any change that can alter a live data path, database, account identity,
    synchronization target, or restore behavior must be planned and reviewed
    against data preservation first. If the original source or a verified
    recovery point cannot be positively identified, stop before changing it.

When a request conflicts with these rules, preserve the data and explain the
specific blocker before making the risky change.
