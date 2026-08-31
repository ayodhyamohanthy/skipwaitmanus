#!/usr/bin/env bash
set -euo pipefail

# The key pasted in chat (sk-1ipu...) must be treated as compromised: rotate it
# at the provider first, then put the new value here. Keeping it in a chmod 600
# env file avoids shell-history and process-listing exposure.
cat > "$HOME/.openhands.env" <<'EOF'
LLM_MODEL=openai/glm-5.3-flash
LLM_API_KEY=REPLACE_WITH_ROTATED_KEY
LLM_BASE_URL=https://api.b.ai/v1
EOF
chmod 600 "$HOME/.openhands.env"

docker run -it \
  --pull=always \
  --env-file "$HOME/.openhands.env" \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$HOME/.openhands-state:/.openhands-state" \
  docker.all-hands.dev/all-hands-ai/openhands:0.28
