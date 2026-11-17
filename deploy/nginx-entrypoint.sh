#!/bin/sh
set -e

DNS=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
if [ -z "$DNS" ]; then
  DNS="127.0.0.11"
fi

sed "s/__RESOLVER__/${DNS}/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
echo "nginx: using resolver ${DNS}"

exec nginx -g 'daemon off;'
