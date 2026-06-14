# WGI POS Demo Sanitization Report

Generated: 2026-06-14  
Scope: Public demo repository (`WGI-POS-Demo`) vs private production (`WGI-POS`)

## Summary

| Action | Count |
| --- | ---: |
| Files removed from public demo | 18+ |
| Files replaced with demo-specific versions | 4 |
| Files modified / redacted | 12 |
| Directories excluded entirely | 6 |

## Removed (Not Published in Demo)

| Path | Reason |
| --- | --- |
| `local-api.cjs` | Full proprietary production API (pricing, BIR, cloud sync, exports) |
| `local-data/` | Real shop runtime database and logs |
| `desktop/signing.cjs` | Code signing credentials handling |
| `desktop/sign-after-pack.cjs` | Production signing hook |
| `desktop/sign-artifacts.cjs` | Production signing hook |
| `desktop/desktop-update.cjs` | Auto-updater pipeline |
| `desktop/create-local-update.cjs` | Update packaging |
| `desktop/create-mechanic-update.cjs` | Mechanic updater packaging |
| `desktop/mechanic-main.cjs` | Mechanic station Electron client |
| `electron-builder.yml` | Production installer config |
| `electron-builder.mechanic-win7.yml` | Mechanic installer config |
| `scripts/Sign-WGI-POS.ps1` | Certificate signing script |
| `scripts/cloud/supabase-price-checker.sql` | Cloud schema (production integration) |
| `artifacts/tireshop-pos/src/pages/bir-*.tsx` | BIR/tax compliance UI |
| `artifacts/tireshop-pos/src/pages/z-reading.tsx` | Fiscal Z-reading |
| `artifacts/tireshop-pos/src/pages/exports.tsx` | Full backup export |
| `artifacts/tireshop-pos/src/pages/invoices/` | Sales invoice module |
| `artifacts/tireshop-pos/src/pages/mobile-price-checker.tsx` | Supabase cloud integration |
| `LICENSE.txt` (production) | Replaced with `LICENSE-DEMO.md` |

## Replaced with Demo-Specific Versions

| Path | Change |
| --- | --- |
| `demo-api.cjs` | New lightweight API; no net cost, BIR, cloud sync, or updater routes |
| `demo-data/demo-seed.json` | Fictional products, customers, tickets, and sales |
| `README.md` | Portfolio-focused documentation with limitations |
| `LICENSE-DEMO.md` | Demo-only legal terms |

## Modified / Redacted

| Path | Change |
| --- | --- |
| `artifacts/tireshop-pos/src/App.tsx` | Removed production-only routes; added demo banner |
| `artifacts/tireshop-pos/src/components/layout/AppLayout.tsx` | Demo navigation; removed invoices/exports |
| `artifacts/tireshop-pos/src/pages/login.tsx` | Demo credentials; removed production password hints |
| `artifacts/tireshop-pos/src/pages/inventory.tsx` | Hidden net cost fields/columns |
| `artifacts/tireshop-pos/src/pages/sales-report.tsx` | Hidden profit/net cost metrics in demo mode |
| `artifacts/tireshop-pos/vite.config.ts` | `VITE_DEMO_MODE=1`; localhost-only dev server |
| `artifacts/tireshop-pos/package.json` | Demo dev script |
| `package.json` | Demo version metadata and scripts |
| `.gitignore` | Excludes runtime demo database files |

## Excluded via `.gitignore` (Never Committed)

- `local-data/`
- `demo-data/wgi-pos-demo.json` (runtime state)
- `node_modules/`
- `dist*/`
- `*.exe`, `*.pfx`, `*.pem`, `.env*`

## Security Verification Checklist

- [x] No API keys, tokens, or secrets in demo repository
- [x] No production database or customer records
- [x] No signing certificates or updater artifacts
- [x] No proprietary margin/profit algorithms in demo API
- [x] No BIR/tax compliance implementation in demo UI
- [x] Demo API binds to `127.0.0.1` by default
- [x] Production repo designated as authoritative source (private)

## Recommendations for Further Protection

1. Keep `WGI-POS` private permanently; distribute production builds as signed installers only.
2. Rotate any credentials ever used on development machines before wider sharing.
3. Use separate Supabase/cloud projects if a cloud price-checker demo is needed later.
4. Add pre-publish CI secret scanning (`gitleaks`, GitHub secret scanning).
5. Consider compiling production API logic into bundled bytecode for release artifacts.
6. Maintain this sanitization report when demo features change.

## Private Production Repository Actions

- Visibility set to **private**
- `package.json` license corrected to proprietary / UNLICENSED
- Copyright notice reinforced in production codebase
