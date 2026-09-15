#!/usr/bin/env bash
set -euo pipefail
. scripts/poll-cloudflare-readiness.sh
D=$(mktemp -d);trap 'rm -rf "$D"' EXIT
cat >"$D/curl" <<'SH'
#!/usr/bin/env bash
n=$(cat "$SEQ/count" 2>/dev/null||echo 0);n=$((n+1));echo $n>"$SEQ/count";line=$(sed -n "${n}p" "$SEQ/data");[ -n "$line" ]||line=$(tail -1 "$SEQ/data");IFS='|' read -r status type sha state <<<"$line";args=("$@");for((i=0;i<${#args[@]};i++));do [[ ${args[i]} == -D ]]&&h=${args[i+1]};[[ ${args[i]} == -o ]]&&b=${args[i+1]};done;printf 'HTTP/2 %s\ncontent-type: %s\n' "$status" "$type">"$h";if [[ $type == application/json* ]];then printf '{"service":"skipwait-api","commitSha":"%s","state":"%s"}' "$sha" "$state">"$b";else echo '<html>bad</html>'>"$b";fi
SH
chmod +x "$D/curl";export PATH="$D:$PATH" READY_INTERVAL_SECONDS=1 READY_TIMEOUT_SECONDS=2 SEQ="$D/seq";mkdir "$SEQ"
run(){ : >"$SEQ/count";printf '%s\n' "$1">"$SEQ/data";set +e;poll_cloudflare_readiness x good >/dev/null;r=$?;set -e;[[ $r == "$2" ]];}
run $'503|application/json|old|reconciling\n503|application/json|good|reconciling\n200|application/json|good|ready' 0
run '200|text/html|good|ready' 3
run '503|application/json|good|failed' 3
run '503|application/json|old|reconciling' 1
echo ok
