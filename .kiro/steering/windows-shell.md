---
inclusion: always
---

# Working on this machine (Windows, PowerShell)

- Command output is often lost. Redirect to a file (`*> $env:TEMP\out.txt`), wait, then read it.
- A PowerShell double-quoted string keeps `\n` literal. Use a here-string or `` `n``.
- The edit tool fails on CRLF files. Replace text with .NET `ReadAllText` / `WriteAllText` and keep the file's line ending.
- `docker exec` into a case workspace runs as `-u 1000`, never root. To use the app's settings from `docker exec`, pass
  `-e TW_DATA_VOLUME=timewraith-data -e TW_PROJECT=timewraith`.
- Do not rebuild or recreate the app container while a case is running.
- The shipped image comes from the GitHub workflow `Build and publish`, run by hand on `main`. `:latest` is that build.