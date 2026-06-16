---
name: Auth token import fix
description: setAuthTokenGetter must be imported from the package root, not a deep path
---

# Auth token getter import — correct pattern

The `@workspace/api-client-react` package only exports its root entry point:

```json
"exports": { ".": "./src/index.ts" }
```

The `index.ts` re-exports everything from `custom-fetch.ts`:

```ts
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
```

## Correct import (use this)

```ts
import { useGetMe, setAuthTokenGetter } from "@workspace/api-client-react";
```

## Wrong import (Vite will throw "Missing specifier" error)

```ts
import { setAuthTokenGetter } from "@workspace/api-client-react/src/custom-fetch";
```

**Why:** Vite resolves package imports against the `exports` field in package.json. Deep paths not listed in `exports` are rejected at module resolution time, causing a build-breaking error. The design subagent wrote the wrong deep import in use-auth.tsx which we fixed.

**How to apply:** Any time you need `setAuthTokenGetter`, `setBaseUrl`, or `AuthTokenGetter`, import from the package root.
