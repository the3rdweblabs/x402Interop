// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_FACILITATOR_URL?: string
  readonly PUBLIC_DOCS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
