<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS"
-->

# Security policy

The trust model for payments lives in [docs/SECURITY.md](docs/SECURITY.md). This file is how to report a vulnerability.

## Reporting

Email [the3rdweblabs@gmail.com](mailto:the3rdweblabs@gmail.com). If you can, use the private advisory flow on this GitHub repository as well.

Please include what you found, how to reproduce it, and the impact you expect. Do not open a public issue for an unfixed vulnerability, and do not include live API keys or customer data.

We will acknowledge the report within 72 hours.

## Scope

In scope: the facilitator, discovery index, MCP tools, scheme handling, and anything that could move funds, leak the 1Click JWT, or forge a webhook.

Out of scope for this scaffold: there is no deployed service yet, and the chain and 1Click clients do not make network calls. A missing feature that the roadmap already lists is not a vulnerability.

## Disclosure

We will work with you on a fix before public discussion. Credit is offered unless you ask us not to name you.
