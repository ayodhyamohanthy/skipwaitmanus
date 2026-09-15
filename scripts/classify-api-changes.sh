#!/usr/bin/env bash
set -euo pipefail
head_sha=${HEAD_SHA:-${GITHUB_SHA:-HEAD}}
event=${EVENT_NAME:-${GITHUB_EVENT_NAME:-push}}
before=${BEFORE_SHA:-}
last=${LAST_DEPLOYED_SHA:-}
if [ "$event" = push ] && [ -n "$before" ] && [[ ! "$before" =~ ^0+$ ]]; then base=$before
elif [ "$event" = workflow_dispatch ] && [ -n "$last" ]; then base=$(git merge-base "$head_sha" "$last")
else base="${head_sha}^"
fi
files=$(git diff --name-only "$base" "$head_sha")
runtime='^(server/|shared/|drizzle/|src/worker\.ts$|Dockerfile$|\.dockerignore$|package\.json$|pnpm-lock\.yaml$|patches/|wrangler\.jsonc$|tsconfig\.json$|vite\.config\.ts$)'
if grep -Eq "$runtime" <<<"$files"; then classification=runtime
elif [ -z "$files" ] || ! grep -Eqv '^(docs/|README\.md$)' <<<"$files"; then classification=skip
else classification=pipeline
fi
# Workflow and deploy-script changes validate the pipeline, while unrelated
# non-runtime source changes remain pipeline-only rather than deploying API.
if [ "$classification" = pipeline ] && ! grep -Eq '^(.github/workflows/deploy-api\.yml|scripts/(classify-api-changes|verify-cloudflare-container-release|assert-api-workflow-selection)\.sh)$' <<<"$files"; then classification=skip; fi
printf 'classification=%s\nbase=%s\n' "$classification" "$base"
printf '%s\n' "$files" >&2
