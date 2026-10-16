# mobile_driver — App de Repartidor (Flutter)

App Android/iOS para motorizados de Delivery Tracker. Consume Supabase de forma directa
(login por teléfono, pool de pedidos `LISTO`, telemetría GPS y validación por PIN).

## Requisitos

- Flutter 3.x (`flutter --version`)
- Android SDK + un emulador o dispositivo

## Configuración

Las credenciales **no** están hardcodeadas. Se inyectan en tiempo de compilación desde un
archivo `.env` (no versionado):

```bash
cp .env.example .env
# edita .env con tus credenciales reales
```

`.env`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

> El archivo `.env` está en `.gitignore`. Nunca subas credenciales al repo.

## Ejecutar

```bash
flutter pub get

# Inyectando las credenciales desde .env
flutter run --dart-define-from-file=.env
```

Para un emulador específico:

```bash
flutter devices
flutter run -d emulator-5554 --dart-define-from-file=.env
```

Si olvidas el flag, la app arranca con un error explícito indicando que faltan
`SUPABASE_URL` / `SUPABASE_ANON_KEY`.

## Credenciales demo (repartidores)

| Teléfono | Repartidor | Tenant |
|---|---|---|
| `941000001` | Carlos Rios | Fuego & Carbón |
| `941000002` | Miguel Torres | Fuego & Carbón |
| `942000001` | Jorge Mendoza | Librería Atenea |
| `942000002` | Diego Salazar | Librería Atenea |

(la contraseña no se valida en el modo demo por teléfono)
