# Example cases in the image

These four finished cases are copied into a fresh data volume the first time the image starts (`backend/src/timewraith/importer.py`, `import_seed_once`). A marker file (`.seeded`) records that this happened, so a case that is deleted stays deleted.

Contents: `timewraith.sqlite3` (the case records, replay events and audit rows), and `artifacts/` (the patch files of the fixes).

Cases:
- `86859ac4-bfa6-4eb7-b115-8faae45d6944`: node-cron, #1087, fixed version verified
- `b80d4d45-8805-48cc-9971-603120df5bce`: rrule, DST repeated hour, fixed version verified
- `1b20d89a-f785-48a2-805e-52fbadd775f3`: cron-parser, Lord Howe `addHour`, fixed version verified
- `7c3c16a4-f2a9-44b9-88d6-39a41ae4687b`: date-fns, inconclusive (the run says why)

The cloned repositories and the branch checkouts are not included; only the patch files are. The cases open and show their findings, gates and patches. Actions that need the cloned repository (re-running a check, making a branch) are not available for these cases.

Regenerate with the export command (from a machine with the data volume):

```
docker run --rm --entrypoint python -u 1000:0 -e TW_DATA_DIR=/out -v timewraith-data:/data:ro -v <folder>:/out <image> -m timewraith.importer /data --no-workspaces --case <id> ...
```
