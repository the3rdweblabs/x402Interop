<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# x402Interop Docs Site

This is the Astro-rendered product documentation site. The canonical docs source lives at the repository root:

- `docs/` - documentation source (`.mdx` landing pages + `.md` guides, reference, specs)
- `docs/README.mdx` - landing page

This app renders the product site. Local development:

```bash
pnpm --filter interop dev
```

`dev` and `start` both bind `http://127.0.0.1:4322` (the marketplace uses 4321, so the two apps can run together). `localhost:4322` reaches the same server. The marketplace is the separate app on port 4321; this site does not proxy it.

Routes:

- `/` - project landing page
- `/docs` and `/intro` - redirect to the introduction
- `/docs/intro` - documentation introduction
- `/whitepaper` - whitepaper page. The PDF is `/x402interop-whitepaper.pdf`

See the root `docs/` folder for the full guide, reference, and spec structure.
