# Symphony Smoke Run

This note records the real-project Symphony smoke test for Mova.

Symphony dispatched Linear issue LRC-6 to Codex, cloned the real Gitea-backed
Mova repository, and made this documentation-only change in the runnable Mova
app tree. The smoke flow is intended to validate that Codex can run the
project checks from `Mova/`, open a Gitea pull request, and merge it after the
changed files are confirmed to be limited to this smoke documentation.

For this run, validation is expected to use:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

If that validation passes and time permits, the flow also runs:

```bash
pnpm build
```
