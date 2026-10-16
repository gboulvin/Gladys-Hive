// -----------------------------------------------------------------------------
// User-facing texts, in the four languages of the Gladys UI (English, French,
// German, Spanish). Gladys picks the user's language, English otherwise.
// -----------------------------------------------------------------------------

/** Multi-language text. */
export const t = (en, fr, de, es) => ({ en, fr, de, es });

/** Apply `fn` to every language of a multi-language text. */
export const mapText = (text, fn) =>
  Object.fromEntries(Object.entries(text).map(([lang, value]) => [lang, fn(value, lang)]));

/** Connection status messages, by status code (see src/controller.js). */
export const STATUS = {
  unconfigured: t(
    'Enter your Hive account email and password, then save.',
    'Renseignez l’e-mail et le mot de passe de votre compte Hive, puis enregistrez.',
    'Geben Sie die E-Mail-Adresse und das Passwort Ihres Hive-Kontos ein und speichern Sie.',
    'Introduzca el correo electrónico y la contraseña de su cuenta Hive y guarde.',
  ),
  sms_required: (destination) =>
    t(
      `Hive sent a code by SMS${destination ? ` to ${destination}` : ''}: type it in the "SMS code" field and save within 3 minutes.`,
      `Hive a envoyé un code par SMS${destination ? ` au ${destination}` : ''} : saisissez-le dans le champ « Code SMS » et enregistrez sous 3 minutes.`,
      `Hive hat einen Code per SMS gesendet${destination ? ` an ${destination}` : ''}: Geben Sie ihn im Feld „SMS-Code“ ein und speichern Sie innerhalb von 3 Minuten.`,
      `Hive ha enviado un código por SMS${destination ? ` al ${destination}` : ''}: escríbalo en el campo «Código SMS» y guarde en menos de 3 minutos.`,
    ),
  invalid_credentials: t(
    'Hive refused the email or password.',
    'Hive a refusé l’e-mail ou le mot de passe.',
    'Hive hat die E-Mail-Adresse oder das Passwort abgelehnt.',
    'Hive ha rechazado el correo electrónico o la contraseña.',
  ),
  missing_credentials: t(
    'Enter your Hive account email and password, then save.',
    'Renseignez l’e-mail et le mot de passe de votre compte Hive, puis enregistrez.',
    'Geben Sie die E-Mail-Adresse und das Passwort Ihres Hive-Kontos ein und speichern Sie.',
    'Introduzca el correo electrónico y la contraseña de su cuenta Hive y guarde.',
  ),
  invalid_sms_code: t(
    'Wrong SMS code: check it, then save again.',
    'Code SMS erroné : vérifiez-le puis enregistrez à nouveau.',
    'Falscher SMS-Code: Prüfen Sie ihn und speichern Sie erneut.',
    'Código SMS incorrecto: compruébelo y vuelva a guardar.',
  ),
  sms_expired: t(
    'The SMS code expired. Use "Test the connection" to receive a new one.',
    'Le code SMS a expiré. Utilisez « Tester la connexion » pour en recevoir un nouveau.',
    'Der SMS-Code ist abgelaufen. Nutzen Sie „Verbindung testen“, um einen neuen zu erhalten.',
    'El código SMS ha caducado. Use «Probar la conexión» para recibir uno nuevo.',
  ),
  password_reset_required: t(
    'Hive asks you to reset your password in the Hive app.',
    'Hive vous demande de réinitialiser votre mot de passe dans l’application Hive.',
    'Hive verlangt, dass Sie Ihr Passwort in der Hive-App zurücksetzen.',
    'Hive le pide que restablezca su contraseña en la aplicación Hive.',
  ),
  rate_limited: t(
    'Too many Hive login attempts: Gladys will try again later.',
    'Trop de tentatives de connexion à Hive : Gladys réessaiera plus tard.',
    'Zu viele Hive-Anmeldeversuche: Gladys versucht es später erneut.',
    'Demasiados intentos de conexión a Hive: Gladys lo volverá a intentar más tarde.',
  ),
  unsupported_challenge: t(
    'Hive asked for a login step this integration does not support. Check the logs.',
    'Hive a demandé une étape de connexion non prise en charge. Consultez les logs.',
    'Hive verlangt einen nicht unterstützten Anmeldeschritt. Prüfen Sie die Logs.',
    'Hive ha pedido un paso de conexión no compatible. Consulte los registros.',
  ),
  unavailable: t(
    'Hive cloud unreachable: Gladys keeps trying.',
    'Cloud Hive injoignable : Gladys continue d’essayer.',
    'Hive-Cloud nicht erreichbar: Gladys versucht es weiter.',
    'Nube de Hive inaccesible: Gladys sigue intentándolo.',
  ),
};

export const ACTION_MESSAGES = {
  connected: (count) =>
    t(
      `Connected to Hive: ${count} device(s) found, see the Discovery tab.`,
      `Connecté à Hive : ${count} appareil(s) trouvé(s), voir l’onglet Découverte.`,
      `Mit Hive verbunden: ${count} Gerät(e) gefunden, siehe Reiter „Erkennung“.`,
      `Conectado a Hive: ${count} dispositivo(s) encontrado(s), vea la pestaña Descubrimiento.`,
    ),
  refreshed: (count) =>
    t(
      `Hive devices refreshed (${count}).`,
      `Appareils Hive actualisés (${count}).`,
      `Hive-Geräte aktualisiert (${count}).`,
      `Dispositivos Hive actualizados (${count}).`,
    ),
  forgotten: t(
    'Session forgotten. The next login asks for a new SMS code.',
    'Session oubliée. La prochaine connexion demandera un nouveau code SMS.',
    'Sitzung vergessen. Die nächste Anmeldung fragt nach einem neuen SMS-Code.',
    'Sesión olvidada. El próximo inicio de sesión pedirá un nuevo código SMS.',
  ),
};
