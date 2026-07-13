<!-- Thanks for contributing to The Deal Room accelerator. Keep PRs focused. -->

## What & why
<!-- What does this change and why? Link any issue. -->

## Component(s)
<!-- orchestrator (app/) · teams-app · infra · scripts · agents · docs -->

## How I validated
<!-- Commands you ran (mirror CI) -->
```
# node --check app/... · cd teams-app/tab && npx tsc --noEmit
# cd infra && az bicep build --file main.bicep --stdout > $null
# python -c "import ast; ast.parse(open('app/scripts/...').read())"
```

## Checklist
- [ ] Change is **focused** — no unrelated refactors, comments, or abstractions.
- [ ] **Validation passes** — `node --check` / `tsc --noEmit` / `az bicep build` (as applicable).
- [ ] **No secrets** committed (managed identity first; secrets are deploy-time / Container App secrets).
- [ ] **No tenant-specific identifiers** — tenant/subscription/app IDs, resource suffixes, endpoints or object IDs. Ran the leak scan:
  ```
  git grep -nE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\.azurecontainerapps\.io|datawarehouse\.fabric"
  ```
- [ ] **No generated files** tracked (compiled Bicep `infra/main*.json` except `main.parameters.json`, `*.env`, build output).
- [ ] User-facing features are reflected in the **README** (and demo runbook / checklist if relevant).
- [ ] This is **not** a security fix that should go through a private advisory (see [SECURITY.md](../blob/main/SECURITY.md)).
