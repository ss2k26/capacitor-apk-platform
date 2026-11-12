[← README](../README.md) · Prev: [Google login](05-google-login.md) · Next: [Troubleshooting](07-troubleshooting.md)

# Release build, signing and security

## Release build and signing

Debug APKs are fine for testing and sideloading. For a proper release:

```powershell
.\platform keystore myshop        # once; creates apps\myshop\myshop.jks + keystore.properties
.\platform build myshop --release
```
**Back up the `.jks` and `keystore.properties`.** Android only installs an update over an existing app if it is signed by
the same key. Before each new release, increase `version.code` (and `version.name`) in the config.
`--aab` produces an `.aab` for Google Play.

Note that debug and release builds are signed with different keys, so you cannot install one over the other; uninstall first.

## Security notes

* Pinned self-signed certificates are safe for private networks; an unpinned `allowSelfSigned` accepts any certificate for that host (the CLI warns).
* Never commit `*.jks` or `keystore.properties` (the provided `.gitignore` excludes them).
* Keep `android.webDebugging` off for builds you distribute.
* Google ID tokens must always be verified on the server (done in the Laravel controller shown in [Google login](05-google-login.md)); never trust the email sent by the client.
