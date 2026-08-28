# Google Sign-In + Gmail API — setup

Un solo proyecto/cliente OAuth de Google Cloud cubre dos features:

1. **Login con Google** (`POST /auth/google`) — botón "Continuar con Google" en `/login` y `/register`.
2. **Envío de correos transaccionales** (verificación de correo, reset de contraseña) vía Gmail API en vez de SMTP+app password.

Todo el código ya está implementado y probado (`api/utils/gmail_api.py`, `api/routers/auth.py`, `src/components/GoogleSignInButton.tsx`). Lo único que falta son las credenciales de abajo.

## 1. Crear el proyecto y el OAuth Client

1. [console.cloud.google.com](https://console.cloud.google.com) → crear proyecto (o reusar uno existente).
2. **APIs & Services → Library** → buscar "Gmail API" → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Scopes: agregar `https://www.googleapis.com/auth/gmail.send`.
   - Test users: agregá el Gmail que va a enviar los correos (ej. tu cuenta de Medellín Social).
   - **⚠️ Publishing status: cambiar a "In production"** (botón "Publish app"). Mientras esté en "Testing", el refresh token expira a los ~7 días y los correos dejan de salir silenciosamente — exactamente el bug que estamos arreglando. No hace falta pasar la verificación completa de Google para esto: solo aparece una pantalla de advertencia ("Google no verificó esta app") al autorizar, que se puede saltar con "Ir a [nombre app] (no seguro)".
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs: agregar `https://developers.google.com/oauthplayground` (solo para el paso 2, se puede quitar después).
   - Authorized JavaScript origins: agregar tu dominio de producción y `http://localhost:5173` (dev).
   - Guardá el **Client ID** y **Client secret**.

## 2. Generar el refresh token (una sola vez)

El refresh token se obtiene con un flujo de consentimiento manual — no hay forma de generarlo sin abrir un navegador y loguearte una vez con la cuenta que va a enviar los correos.

Opción más simple, [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):

1. Ícono de engranaje (arriba a la derecha) → marcar **"Use your own OAuth credentials"** → pegar tu Client ID y Client secret del paso 1.
2. Panel izquierdo → escribir manualmente el scope `https://www.googleapis.com/auth/gmail.send` → **Authorize APIs**.
3. Logueate con la cuenta Gmail que va a enviar los correos → aceptar el warning de "app no verificada".
4. **Exchange authorization code for tokens** → copiá el **Refresh token** (empieza con `1//`).

## 3. Variables de entorno

Setear en Railway (servicio API) y en `.env` local:

```
GOOGLE_CLIENT_ID=<client id del paso 1>
GOOGLE_CLIENT_SECRET=<client secret del paso 1>
GOOGLE_REFRESH_TOKEN=<refresh token del paso 2>
GMAIL_SENDER=<gmail que autorizó, ej. noreply@medellinsocial.com o tu gmail>
```

Y en el frontend (mismo Client ID, variable pública):

```
VITE_GOOGLE_CLIENT_ID=<client id del paso 1>
```

Sin `GOOGLE_REFRESH_TOKEN`, el envío de correos cae automáticamente a SMTP (`SMTP_USER`/`SMTP_PASS`) si están configuradas, y si tampoco eso, a un stub que solo imprime en logs — nunca rompe el registro/login.

## 4. Qué falta de mi lado

Nada más — pegá las 5 variables de arriba (local + Railway) y el login/registro con Google + el envío de correos de verificación/reset quedan funcionando sin tocar código.
