#!/bin/sh

echo "=== Container starting ==="
echo "Files in /usr/share/nginx/html:"
ls -la /usr/share/nginx/html/
echo ""
echo "Checking for SOCKET_URL in bundle:"
grep -o 'tunnelerserver[^"]*' /usr/share/nginx/html/bundle*.js || echo "NOT FOUND"
echo "==========================="

# Start nginx
exec nginx -g 'daemon off;'
