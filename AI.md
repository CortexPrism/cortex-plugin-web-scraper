# AI Disclosure

This file documents any AI-assisted development used in this plugin.

## Tools Used

- Claude Code (Anthropic) — scaffold and implementation

## Scope

AI assistance was used in the following areas:

- `mod.ts` — Core logic scaffolded and implemented by Claude Code, manually reviewed
- `manifest.json` — Tool definitions, UI settings, and metadata
- `README.md` — Documentation structure and tool reference
- `CHANGELOG.md` — Release notes
- `test/unit/mod.test.ts` — Test cases generated and verified

## Review

All AI-generated code was reviewed by a human developer, tested thoroughly, and verified to work
correctly before being committed to this repository.

## Certification

I certify that I understand the code being submitted and take full responsibility for its behavior
and security.

---

## Disclosure in manifest.json

The `manifest.json` file includes this disclosure:

```json
{
  "aiDisclosure": {
    "tools": ["Claude Code (Anthropic) — scaffold and implementation"],
    "humanReview": true
  }
}
```

---

## Why This Matters

- **Trust** — Users know what to expect from the code
- **Review** — Marketplace reviewers can assess AI-generated vs. human-written code
- **Security** — Extra scrutiny is paid to AI-generated code for vulnerabilities
- **Attribution** — Proper credit for the development process
