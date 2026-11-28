export interface CreditLinkEntry {
  code: string;
  label: string;
  url: string;
  qrImage: string;
  qrAlt: string;
  creditsCount: number;
  periodLabel: string;
}

export interface ManualStep {
  id: string;
  number: number;
  phaseId: "profile" | "verify" | "billing";
  title: string;
  summary: string;
  actionHint: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  imageAlt: string;
}

export interface ManualPhase {
  id: "profile" | "verify" | "billing";
  label: string;
  shortLabel: string;
  summary: string;
  accentColor: string;
}

export interface CreditFaq {
  question: string;
  answer: string;
}

export interface EventGcpCreditsConfig {
  eventSlug: string;
  eventTitle: string;
  opensAt: string;
  creditsEndAt: string;
  viewClosesAt: string;
  dateLabel: string;
  creditsPeriodLabel: string;
  viewPeriodLabel: string;
  workshopHint: string;
  primaryLink: CreditLinkEntry;
  backupLink: CreditLinkEntry;
  phases: ManualPhase[];
  steps: ManualStep[];
  included: string[];
  excluded: string[];
  faqs: CreditFaq[];
}

const DEVFEST_2026_PHASES: ManualPhase[] = [
  {
    id: "profile",
    label: "Perfil y solicitud",
    shortLabel: "Perfil",
    summary:
      "Inicia sesión con tu correo personal @gmail.com y crea tu perfil de Google Developer Program.",
    accentColor: "var(--g-blue)",
  },
  {
    id: "verify",
    label: "Verificación móvil",
    shortLabel: "Verificación",
    summary:
      "Confirma que eres una persona mediante reCAPTCHA móvil y espera el procesamiento del beneficio.",
    accentColor: "var(--g-yellow)",
  },
  {
    id: "billing",
    label: "Facturación en GCP",
    shortLabel: "Facturación",
    summary:
      "Abre tu cuenta de facturación GDP Credit en Google Cloud Console y vincúlala a tu proyecto.",
    accentColor: "var(--g-green)",
  },
];

const DEVFEST_2026_STEPS: ManualStep[] = [
  {
    id: "login",
    number: 1,
    phaseId: "profile",
    title: "Inicia sesión con tu @gmail.com",
    summary:
      "Al abrir el enlace de créditos, Google pedirá confirmar tu identidad. Asegúrate de elegir una cuenta personal terminada en @gmail.com; las cuentas de Google Workspace no son compatibles.",
    actionHint: "Verifica el correo en pantalla y pulsa Siguiente / Avanzar.",
    image: "/gcp-credits/devfest-2026/step-01-login.webp",
    imageWidth: 768,
    imageHeight: 1376,
    imageAlt:
      "Pantalla de inicio de sesión de Google solicitando confirmar identidad antes de continuar",
  },
  {
    id: "claim-benefit",
    number: 2,
    phaseId: "profile",
    title: "Reclama el beneficio del evento",
    summary:
      "Entrarás a la página de Google Developer Program con el título Claim Your Benefit indicando que calificas para el crédito del DevFest.",
    actionHint: "Pulsa el botón Claim Credit.",
    image: "/gcp-credits/devfest-2026/step-02-claim-benefit.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Pantalla Claim Your Benefit con el botón azul Claim Credit para solicitar el beneficio",
  },
  {
    id: "create-profile",
    number: 3,
    phaseId: "profile",
    title: "Crea tu perfil de desarrollador",
    summary:
      "Si todavía no tienes un perfil en Google Developer Program, aparecerá un aviso explicando que es necesario crearlo para recibir los créditos de Google Cloud.",
    actionHint: "Pulsa Create profile. Si ya tenías perfil, avanzarás directo.",
    image: "/gcp-credits/devfest-2026/step-03-create-profile.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Ventana emergente Create a profile to claim credits con el botón Create profile",
  },
  {
    id: "fill-details",
    number: 4,
    phaseId: "profile",
    title: "Completa los datos básicos",
    summary:
      "Llena el formulario con tu nombre, ciudad o país, rol actual y organización o centro de estudios.",
    actionHint: "El campo Nombre es obligatorio para habilitar el registro.",
    image: "/gcp-credits/devfest-2026/step-04-fill-details.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Formulario de creación de perfil de Google Developer Program con campos de nombre, ubicación y rol",
  },
  {
    id: "submit-form",
    number: 5,
    phaseId: "profile",
    title: "Envía el formulario del perfil",
    summary:
      "Revisa la casilla de perfil público y preferencias de correo al final del formulario para completar el alta en el programa.",
    actionHint: "Pulsa Crear perfil al final de la pantalla.",
    image: "/gcp-credits/devfest-2026/step-05-submit-form.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Parte inferior del formulario de perfil con casillas de confirmación y botón Crear perfil",
  },
  {
    id: "mobile-verify",
    number: 6,
    phaseId: "verify",
    title: "Inicia la verificación móvil",
    summary:
      "El portal abrirá una pantalla de verificación para dispositivos móviles protegida por reCAPTCHA.",
    actionHint: "Pulsa el botón azul de confirmación para continuar.",
    image: "/gcp-credits/devfest-2026/step-06-mobile-verify.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Pantalla de verificación para dispositivos móviles con botón azul para confirmar",
  },
  {
    id: "app-access",
    number: 7,
    phaseId: "verify",
    title: "Permite el paso de la app",
    summary:
      "En algunos teléfonos (especialmente iOS) puede mostrarse un aviso sobre descargas automáticas de contenido dentro de la app antes de abrir el verificador.",
    actionHint: "Pulsa Continuar para seguir con la validación.",
    image: "/gcp-credits/devfest-2026/step-07-app-access.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Aviso del sistema sobre descargas automáticas para contenido dentro de la app con botón Continuar",
  },
  {
    id: "recaptcha",
    number: 8,
    phaseId: "verify",
    title: "Completa la validación reCAPTCHA",
    summary:
      "Se desplegará la hoja de verificación de reCAPTCHA («Verify you are a human») para validar tu sesión.",
    actionHint: "Pulsa Abrir y completa la comprobación.",
    image: "/gcp-credits/devfest-2026/step-08-recaptcha.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt: "Hoja inferior de reCAPTCHA con el botón Abrir para validar",
  },
  {
    id: "verified",
    number: 9,
    phaseId: "verify",
    title: "Confirma verificación completada",
    summary:
      "Verás la pantalla con el ícono de check indicando que la verificación fue completada correctamente.",
    actionHint:
      "Cierra esa pestaña o ventana y regresa a la página web del beneficio.",
    image: "/gcp-credits/devfest-2026/step-09-verified.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Pantalla de verificación concluida indicando que ya puedes cerrar y volver a la página",
  },
  {
    id: "processing",
    number: 10,
    phaseId: "verify",
    title: "Espera el procesamiento del crédito",
    summary:
      "Al regresar a Claim Your Benefit, verás un indicador de carga mientras Google asigna el cupón a tu cuenta.",
    actionHint: "Mantén la pestaña abierta unos segundos sin recargar.",
    image: "/gcp-credits/devfest-2026/step-10-processing.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Pantalla Claim Your Benefit mostrando un indicador de carga mientras se procesa el crédito",
  },
  {
    id: "claimed",
    number: 11,
    phaseId: "billing",
    title: "Crédito reclamado con éxito",
    summary:
      "Aparecerá el mensaje «Successfully claimed your event credit!» junto con la fecha de vencimiento del saldo. Puede tardar hasta 5 minutos en reflejarse en la consola.",
    actionHint: "Pulsa Open Billing Account para abrir Google Cloud Console.",
    image: "/gcp-credits/devfest-2026/step-11-claimed.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Confirmación azul Successfully claimed your event credit con el botón Open Billing Account",
  },
  {
    id: "billing",
    number: 12,
    phaseId: "billing",
    title: "Verifica y vincula tu facturación",
    summary:
      "En Administración de cuentas de facturación de Google Cloud verás tu cuenta activa listada como «GDP Credit». Desde la pestaña «Tus proyectos» podrás vincularla al proyecto del taller.",
    actionHint:
      "Si aún no aparece, espera hasta 5 minutos y actualiza la consola.",
    image: "/gcp-credits/devfest-2026/step-12-billing.webp",
    imageWidth: 736,
    imageHeight: 1600,
    imageAlt:
      "Consola de Google Cloud mostrando la cuenta de facturación activa GDP Credit",
  },
];

export const GCP_CREDITS_BY_EVENT: Record<string, EventGcpCreditsConfig> = {
  "devfest-2026": {
    eventSlug: "devfest-2026",
    eventTitle: "DevFest ICA 2026",
    opensAt: "2026-11-28T08:00:00-05:00",
    creditsEndAt: "2026-11-28T20:00:00-05:00",
    viewClosesAt: "2026-11-28T22:00:00-05:00",
    dateLabel: "28 nov 2026",
    creditsPeriodLabel: "08:00 – 20:00 PET",
    viewPeriodLabel: "08:00 – 22:00 PET",
    workshopHint:
      "Canjea tus créditos durante el registro (08:00 – 09:00) para llegar con tu cuenta lista al taller «Construyendo con GCP y Gemini» (11:30, Laboratorio).",
    primaryLink: {
      code: "gdg-ica-1",
      label: "Enlace principal",
      url: "https://g.dev/credits/gdg-ica-1",
      qrImage: "/gcp-credits/devfest-2026/qr-gdg-ica-1.png",
      qrAlt: "Código QR del enlace principal de créditos GCP gdg-ica-1",
      creditsCount: 350,
      periodLabel: "28/11/2026 · 08:00 – 20:00",
    },
    backupLink: {
      code: "gdg-ica-1-bkp",
      label: "Enlace de respaldo",
      url: "https://g.dev/credits/gdg-ica-1-bkp",
      qrImage: "/gcp-credits/devfest-2026/qr-gdg-ica-1-bkp.png",
      qrAlt: "Código QR del enlace de respaldo de créditos GCP gdg-ica-1-bkp",
      creditsCount: 350,
      periodLabel: "28/11/2026 · 08:00 – 20:00",
    },
    phases: DEVFEST_2026_PHASES,
    steps: DEVFEST_2026_STEPS,
    included: [
      "Infraestructura principal de GCP: Compute Engine, Cloud Storage y BigQuery.",
      "APIs estándar de Agent Platform y SDKs de Google Cloud.",
    ],
    excluded: [
      "Facturación de API de Google AI Studio (sin soporte directo de créditos para API).",
      "Estos créditos no se pueden aplicar a proyectos de Google AI Studio.",
    ],
    faqs: [
      {
        question: "¿Puedo usar mi correo universitario o de empresa?",
        answer:
          "No. Google exige una cuenta personal terminada en @gmail.com; las cuentas de Google Workspace son rechazadas al intentar reclamar el beneficio.",
      },
      {
        question: "¿Cuántas veces puedo canjear los créditos?",
        answer:
          "Solo una vez por cuenta @gmail.com. Si necesitas activar otra cuenta distinta, tendrás que usar otro correo personal @gmail.com.",
      },
      {
        question: "¿Cuándo debo usar el enlace de respaldo (-bkp)?",
        answer:
          "Úsalo únicamente si tuviste un problema al activar tu cuenta con el enlace principal o si el sistema te indica que ya canjeaste ese enlace.",
      },
      {
        question:
          "Ya reclamé el crédito, pero no veo la cuenta en Google Cloud Console",
        answer:
          "Es normal: la cuenta de facturación «GDP Credit» puede tardar hasta 5 minutos en aparecer después de confirmar el reclamo. Recarga la consola pasado ese tiempo.",
      },
    ],
  },
};

export function getGcpCreditsConfig(
  slug: string
): EventGcpCreditsConfig | undefined {
  return GCP_CREDITS_BY_EVENT[slug];
}
