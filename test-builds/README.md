## Test builds

This folder contains two production-build snapshots for side-by-side testing:

- `current/` — build output from the current branch (`dist/`)
- `stable-v0.0.3/` — build output from release tag `v0.0.3`

### Refresh these folders

From the repository root:

```bash
npm run build
rm -rf test-builds/current
mkdir -p test-builds/current
cp -R dist/. test-builds/current/
```

To refresh the stable snapshot, rebuild from tag `v0.0.3` in a temporary worktree and copy that `dist/` into `test-builds/stable-v0.0.3/`.
