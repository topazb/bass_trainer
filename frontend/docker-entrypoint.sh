#!/bin/sh
# Substitute $BACKEND_URL and $DOMAIN — leave all nginx variables untouched
envsubst '$BACKEND_URL $DOMAIN' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
