[← README](../README.md) · Prev: [App configuration](03-app-config.md) · Next: [Google login](05-google-login.md)

# Self-signed SSL on an IP address with a custom port

## What the app does
With `ssl.allowSelfSigned: true`, the native WebView handler accepts certificate errors **only** for the
configured host, and, when `ssl.pinSha256` is set, **only** if the certificate's SHA-256 fingerprint equals the pin.
Everything else (other hosts, a swapped certificate) is rejected. This is much safer than "ignore all SSL errors".

Consequences: when you **renew or regenerate** the certificate, run `platform pin <name> --save` and ship a new build.
Use a long validity (e.g. 3650 days) to avoid frequent rebuilds.

## Create a certificate that is valid for an IP (once per server)

Modern TLS stacks want the IP in `subjectAltName`. With OpenSSL (Git for Windows ships `openssl.exe`):

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout server.key -out server.crt \
  -subj "/CN=192.168.1.10" \
  -addext "subjectAltName=IP:192.168.1.10"
```

Use `server.crt` / `server.key` in your web server, e.g. nginx:

```nginx
server {
    listen 8443 ssl;
    server_name 192.168.1.10;
    ssl_certificate     /etc/ssl/myshop/server.crt;
    ssl_certificate_key /etc/ssl/myshop/server.key;
    root /var/www/myshop/public;
    # ... usual Laravel/php-fpm config
}
```

Laravel: set `APP_URL=https://192.168.1.10:8443` and make sure it trusts the proxy headers
(`TrustProxies`) if TLS ends at nginx, otherwise generated URLs and redirects fall back to `http://`.

## Pin it

```powershell
.\platform pin myshop --save
```
Prints subject, validity, SAN and SHA-256, and writes `allowSelfSigned: true` + the pin into the config.
Rebuild afterwards. If the phone cannot reach the server, the app shows the built-in offline page with a retry button.

## What does *not* work
* The cert must be reachable **from the phone** (same Wi-Fi / VPN). A private IP is not reachable from mobile data.
* Other apps and Chrome on the phone still distrust the cert; only this app accepts it. (Optional: install the cert as a user CA in Android settings – not needed for this platform.)
* Self-signed certs cannot be used for Google OAuth redirects, see [Google login](05-google-login.md).
