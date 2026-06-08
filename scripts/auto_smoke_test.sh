#!/usr/bin/env bash
set -euo pipefail

# Automated smoke-test for Crypt Companion backend (CI-style)
# Usage:
#   BACKEND_URL=http://localhost:4000 ADMIN_TOKEN=xxx bash ./scripts/auto_smoke_test.sh

BACKEND_URL=${BACKEND_URL:-http://localhost:4000}
ADMIN_TOKEN=${ADMIN_TOKEN:-}
PROVIDER=${PROVIDER:-telegram}

TIMESTAMP=$(date +%s)
EMAIL="smoke-${TIMESTAMP}@example.com"
PASSWORD="password123"
DISPLAY_NAME="Smoke Test"

echo "Backend URL: $BACKEND_URL"
echo "Using email: $EMAIL"

echo "--- signup ---"
SIGNUP=$(curl -s -X POST "$BACKEND_URL/api/auth/signup" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"$DISPLAY_NAME\"}")
echo "SIGNUP_RESPONSE: $SIGNUP"

TOKEN=$(echo "$SIGNUP" | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{try{const j=JSON.parse(s); console.log(j.data && j.data.token ? j.data.token : "");}catch(e){console.log("")}})')

if [ -z "$TOKEN" ]; then
  echo "Signup returned no token; attempting login..."
  LOGIN=$(curl -s -X POST "$BACKEND_URL/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  echo "LOGIN_RESPONSE: $LOGIN"
  TOKEN=$(echo "$LOGIN" | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{try{const j=JSON.parse(s); console.log(j.data && j.data.token ? j.data.token : "");}catch(e){console.log("")}})')
fi

if [ -z "$TOKEN" ]; then
  echo "ERROR: unable to obtain auth token; aborting"
  exit 2
fi

echo "TOKEN: ${TOKEN:0:20}..."

echo "--- me ---"
curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/auth/me" || true
echo

echo "--- register public key ---"
PUBKEY="SMOKE_AUTO_PUBKEY_${TIMESTAMP}"
REGKEY=$(curl -s -X POST "$BACKEND_URL/api/keys/register" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"ownerId\":\"$EMAIL\",\"publicKey\":\"$PUBKEY\"}")
echo "REGISTER_KEY_RESPONSE: $REGKEY"
echo

echo "--- create link ---"
LINK=$(curl -s -X POST "$BACKEND_URL/api/provider/link/init" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"provider\":\"$PROVIDER\"}")
echo "LINK_RESPONSE: $LINK"
CODE=$(echo "$LINK" | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{try{const j=JSON.parse(s); console.log(j.data && j.data.code ? j.data.code : "");}catch(e){console.log("")}})')
echo "CODE: $CODE"
echo

if [ -n "$CODE" ]; then
  echo "--- link status ---"
  curl -s "$BACKEND_URL/api/provider/link/status/$CODE" || true
  echo
fi

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CODE" ]; then
  echo "--- completing link via admin ---"
  PROVIDER_CHAT="smoke_chat_${TIMESTAMP}"
  COMPLETE=$(curl -s -X POST "$BACKEND_URL/api/provider/link/complete" -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" -d "{\"code\":\"$CODE\",\"provider\":\"$PROVIDER\",\"providerChatId\":\"$PROVIDER_CHAT\",\"providerDisplayName\":\"Smoke Provider\"}")
  echo "COMPLETE_RESPONSE: $COMPLETE"
  echo "--- post-complete status ---"
  curl -s "$BACKEND_URL/api/provider/link/status/$CODE" || true
  echo
else
  if [ -z "$ADMIN_TOKEN" ]; then
    echo "Skipping admin link completion (no ADMIN_TOKEN provided)"
  fi
fi

echo "--- attempt send (may fail if provider credentials missing) ---"
SEND_PAYLOAD="{\"provider\":\"$PROVIDER\",\"from\":\"smoke-web\",\"to\":\"someone\",\"chatId\":\"someone\",\"text\":\"hello from smoke test\",\"encrypt\":false}"
echo "Sending payload: $SEND_PAYLOAD"
SEND=$(curl -s -X POST "$BACKEND_URL/api/messages/send" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$SEND_PAYLOAD")
echo "SEND_RESPONSE: $SEND"

echo "--- smoke test complete ---"
