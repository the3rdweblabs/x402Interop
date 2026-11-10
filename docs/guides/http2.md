<!--
provenance: "native"
copyright: "2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)"
-->

# HTTP/2 and HTTP/3

The x402Interop services use Node's `http` server, so the backend speaks HTTP/1.1. That is what `curl -i http://127.0.0.1:4040/...` prints as `HTTP/1.1 402`.

To serve modern clients, put a TLS edge in front. The repository includes a Caddy profile:

```sh
docker compose --env-file apps/facilitator/.env --profile proxy up -d
```

Caddy listens on `https://localhost:8443` and routes to the local services:

- facilitator: `4020`
- resource example: `4040`
- marketplace: `4321`

Check HTTP/2:

```sh
curl -k --http2 -i https://localhost:8443/health
```

Caddy uses its internal CA for `localhost`. Browsers will warn until that CA is trusted. For production, replace `tls internal` in `Caddyfile` with a real domain and normal ACME TLS; the backends can stay HTTP/1.1 behind the proxy.

HTTP/3 is enabled on the same UDP port when the client supports it. `curl` may need a build with HTTP/3 support; HTTP/2 is enough for most checks.
