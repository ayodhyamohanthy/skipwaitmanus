#!/usr/bin/env bash
poll_cloudflare_readiness(){
  local url="$1" expected="$2" timeout="${READY_TIMEOUT_SECONDS:-360}" interval="${READY_INTERVAL_SECONDS:-30}" max_attempts="${READY_MAX_ATTEMPTS:-13}" start="${SECONDS}" attempt=0 last_status=000 last_sha= last_state=
  while (( attempt < max_attempts && SECONDS-start <= timeout ));do
    attempt=$((attempt+1));local headers body status content_type retry_after service sha state rc=0
    headers=$(mktemp);body=$(mktemp)
    curl -sS --max-time 20 -D "$headers" -o "$body" "$url" || rc=$?
    status=$(awk 'toupper($1)~/^HTTP\//{s=$2}END{print s+0}' "$headers");content_type=$(awk -F': *' 'tolower($1)=="content-type"{print tolower($2)}' "$headers"|tr -d '\r'|tail -1);retry_after=$(awk -F': *' 'tolower($1)=="retry-after"{print $2}' "$headers"|tr -d '\r'|tail -1)
    if ((rc==0)) && [[ "$content_type" == application/json* ]] && jq -e 'type=="object" and (.service|type=="string") and (.commitSha|type=="string") and (.state|type=="string")' "$body" >/dev/null 2>&1;then
      service=$(jq -r .service "$body");sha=$(jq -r .commitSha "$body");state=$(jq -r .state "$body");last_sha=$sha;last_state=$state;last_status=$status
      echo "Runtime readiness attempt=$attempt elapsed=$((SECONDS-start))s HTTP=$status service=$service sha=${sha:0:12} state=$state"
      [[ "$service" == skipwait-api ]]||{ echo '::error::Unexpected readiness service/schema';rm -f "$headers" "$body";return 3;}
      [[ "$state" == failed ]]&&{ echo '::error::Runtime reported failed';rm -f "$headers" "$body";return 3;}
      [[ "$status" == 200 && "$sha" == "$expected" && "$state" == ready ]]&&{ rm -f "$headers" "$body";return 0;}
      [[ "$status" == 503 || "$sha" != "$expected" || "$state" == reconciling ]]||{ echo '::error::Unexpected readiness state';rm -f "$headers" "$body";return 3;}
    elif ((rc==0)) && [[ "$status" == 401 || "$status" == 403 || "$status" == 200 ]];then echo "::error::Invalid readiness response HTTP=$status content-type=${content_type:-missing}";rm -f "$headers" "$body";return 3
    else echo "Runtime readiness attempt=$attempt elapsed=$((SECONDS-start))s HTTP=${status:-000} transient"
    fi
    rm -f "$headers" "$body";(( attempt >= max_attempts || SECONDS-start >= timeout ))&&break
    local delay=$interval;[[ "$retry_after" =~ ^[0-9]+$ ]]&&delay=$retry_after;((delay>60))&&delay=60;((delay<1))&&delay=1;sleep "$delay"
  done
  echo "::error::Readiness timeout after ${timeout}s attempts=$attempt finalHTTP=$last_status sha=${last_sha:0:12} state=$last_state";return 1
}
