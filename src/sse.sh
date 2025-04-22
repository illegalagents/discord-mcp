pnpm run build && 
npx -y supergateway \
    --stdio "node dist/stdio.js ." \
    --port 8001 --baseUrl http://localhost:8000 \
    --ssePath /sse --messagePath /message \
    --cors