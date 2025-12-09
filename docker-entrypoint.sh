#!/bin/sh

# Generate runtime config from environment variables
cat > /usr/share/nginx/html/config.js << EOF
window.SOCKET_URL = "${SOCKET_URL}";
EOF

# Start nginx
exec nginx -g 'daemon off;'
