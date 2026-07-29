import { defineSecret } from "firebase-functions/params";

export const GITHUB_TOKEN = defineSecret("GITHUB_TOKEN");

// Gmail SMTP credentials for sending certificates. GMAIL_USER is the
// full GDG ICA Gmail address; GMAIL_APP_PASSWORD is a 16-char Google
// "app password" (not the account password) generated with 2FA on.
export const GMAIL_USER = defineSecret("GMAIL_USER");
export const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// Origen canónico del sitio, usado para construir el enlace de canje de las
// invitaciones. Es el primero de ALLOWED_ORIGINS y se fija aquí en vez de
// derivarlo de la petición: tomarlo de la cabecera Host permitiría que un
// atacante hiciera llegar por correo un enlace apuntando a su propio dominio.
export const SITE_ORIGIN = "https://gdgica.com";

export const GITHUB_DATA_REPO = "GDGXICA/gdg-ica-data";
export const GITHUB_SITE_REPO = "GDGXICA/gdgxica.github.io";
export const GITHUB_API_BASE = "https://api.github.com";
