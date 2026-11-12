[← README](../README.md) · Prev: [Self-signed SSL](04-self-signed-ssl.md) · Next: [Release & signing](06-release-signing.md)

# Google login (Laravel Socialite)

## The problem
Google **blocks OAuth inside embedded WebViews** (`Error 403: disallowed_useragent`). Also Google OAuth web clients
do not accept raw IP addresses as redirect URIs. So the usual Socialite redirect flow cannot run inside the app on
`https://192.168.x.x:8443`.

## The solution used here: native Google sign-in + ID-token endpoint
The app shows Android's native account picker (via `@capgo/capacitor-social-login`, Credential Manager),
receives a Google **ID token**, and POSTs it to a Laravel route that verifies it and logs the user in.
No redirect URI, no browser, works with IP + self-signed. Your normal browser Socialite flow stays untouched.

Enable per app:
```json
"googleLogin": { "enabled": true, "webClientId": "1234567890-xxxx.apps.googleusercontent.com" }
```
(`enabled` adds the plugin and the required `MainActivity` hook for that app only.)

## Google Cloud Console (once per Google project)
1. APIs & Services → OAuth consent screen: configure it (Testing mode is fine for a few users – add them as test users).
2. Credentials → *Create OAuth client ID* → **Web application**. No redirect URI needed for this flow. Copy the **client ID** → `webClientId` and Laravel `GOOGLE_CLIENT_ID`. (Your existing Socialite web client can be reused.)
3. Credentials → *Create OAuth client ID* → **Android**: package name = the app's `appId`; SHA-1 = from
   `.\platform sha1 myshop` (release key) and/or `.\platform sha1 myshop --debug` (debug key).
   Debug and release builds are signed by different keys → register an Android client for each you use.
   It must be in the **same Google Cloud project** as the Web client.
4. Wait a few minutes. Error `28444`/"Developer console is not set up correctly" = package name or SHA-1 mismatch, or different projects.

## Laravel side

```bash
composer require google/apiclient
```

`routes/web.php` (keep it in the `web` group so the session cookie is set):
```php
Route::post('/auth/google/native', [NativeGoogleLoginController::class, 'login'])->name('google.native');
```

`app/Http/Controllers/NativeGoogleLoginController.php`:
```php
<?php

namespace App\Http\Controllers;

use App\Models\User;
use Google\Client as GoogleClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class NativeGoogleLoginController extends Controller
{
    public function login(Request $request)
    {
        $request->validate(['idToken' => 'required|string']);

        // audience must be your WEB client id
        $client  = new GoogleClient(['client_id' => config('services.google.client_id')]);
        $payload = $client->verifyIdToken($request->string('idToken')); // false when invalid/expired

        if (!$payload || empty($payload['email']) || !($payload['email_verified'] ?? false)) {
            return response()->json(['message' => 'Invalid Google token'], 422);
        }

        // Use the same lookup your Socialite callback uses:
        $user = User::where('google_id', $payload['sub'])->orWhere('email', $payload['email'])->first()
            ?? User::create([
                'name'      => $payload['name'] ?? $payload['email'],
                'email'     => $payload['email'],
                'google_id' => $payload['sub'],
                'password'  => bcrypt(Str::random(40)),
            ]);
        if (!$user->google_id) { $user->forceFill(['google_id' => $payload['sub']])->save(); }

        Auth::login($user, true);
        $request->session()->regenerate();

        return response()->json(['redirect' => url('/home')]);
    }
}
```
`config/services.php` → `'google' => ['client_id' => env('GOOGLE_CLIENT_ID'), ...]` (already there if you use Socialite).
Adapt the user model/columns to your app. The server needs outbound internet once in a while (to fetch Google's public keys).

## Login page JavaScript
The native plugin is injected into pages loaded by the app, so no bundling is needed:

```html
<button id="google-native" style="display:none">Sign in with Google</button>
<a id="google-web" href="{{ route('auth.google') }}">Sign in with Google</a>   {{-- existing Socialite link --}}

<script>
(async () => {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;   // normal browser: keep Socialite link
  const SocialLogin = cap.Plugins.SocialLogin;
  document.getElementById('google-web').style.display = 'none';
  const btn = document.getElementById('google-native');
  btn.style.display = '';

  await SocialLogin.initialize({ google: { webClientId: '{{ config('services.google.client_id') }}', mode: 'online' } });

  btn.onclick = async () => {
    try {
      const { result } = await SocialLogin.login({ provider: 'google', options: {} });
      if (!result.idToken) throw new Error('No ID token');
      const res = await fetch('{{ route('google.native') }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
                   'X-CSRF-TOKEN': document.querySelector('meta[name=csrf-token]').content },
        body: JSON.stringify({ idToken: result.idToken }),
      });
      const data = await res.json();
      if (res.ok) location.href = data.redirect; else alert(data.message || 'Login failed');
    } catch (e) { if (e && e.code !== 'USER_CANCELLED') alert(e.message || e); }
  };
})();
</script>
```
(Needs `<meta name="csrf-token" content="{{ csrf_token() }}">` in your layout.)

If `Capacitor.Plugins.SocialLogin` is undefined in your build, the plugin was not added: check `googleLogin.enabled`
and that `platform build` printed no errors; as a fallback you can bundle `@capgo/capacitor-social-login` into your
site's JS instead.

> The Google plugin's Android API changes between versions. If the Java compile fails on `MainActivity`
> (step "Running Gradle"), compare the generated `build\<app>\android\app\src\main\java\...\MainActivity.java`
> with the plugin's Android setup page (<https://capgo.app/docs/plugins/social-login/getting-started/>) and adjust
> `tools/lib/patch.js` (`EXTRA_MEMBERS`). Apps without Google login are unaffected.

## Alternative: system browser (Custom Tab)
Possible only with a public **domain** + valid HTTPS redirect URI registered in Google. Not covered, as it does not fit IP + self-signed.
