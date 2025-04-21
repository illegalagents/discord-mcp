pnpm run build && 
npx -y supergateway \
    --stdio "node dist/index.js ." \
    --port 8000 --baseUrl http://localhost:8000 \
    --ssePath /sse --messagePath /message \
    --cors