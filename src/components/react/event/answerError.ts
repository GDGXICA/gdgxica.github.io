const messages: Record<string, string> = {
  not_joined: "Tu sesión se perdió. Recarga la página y vuelve a entrar.",
  already_answered: "Tu respuesta ya está registrada.",
  not_live:
    "Esta dinámica ya no está en vivo. Consulta la pantalla del evento.",
  invalid_question: "La pregunta cambió. Recarga la página para continuar.",
  expired: "Se acabó el tiempo para responder esta pregunta.",
};

export function answerErrorMessage(error: string | undefined): string {
  return error
    ? (messages[error] ?? error)
    : "No pudimos enviar tu respuesta. Intenta de nuevo.";
}
