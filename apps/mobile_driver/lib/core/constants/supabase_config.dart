/// Configuración de Supabase inyectada en tiempo de compilación.
///
/// Los valores provienen del archivo `.env` (no versionado) mediante:
///   flutter run --dart-define-from-file=.env
///
/// Nunca hardcodees credenciales aquí. Ver `.env.example` para el formato.
class SupabaseConfig {
  static const String url = String.fromEnvironment('SUPABASE_URL');
  static const String anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static bool get isConfigured => url.isNotEmpty && anonKey.isNotEmpty;

  /// Aborta con un mensaje claro si faltó inyectar el `.env`.
  static void assertConfigured() {
    if (!isConfigured) {
      throw StateError(
        'Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.\n'
        'Crea tu .env a partir de .env.example y ejecuta:\n'
        '  flutter run --dart-define-from-file=.env',
      );
    }
  }
}
