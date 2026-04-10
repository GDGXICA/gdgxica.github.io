import { defineSecret } from "firebase-functions/params";

export const GITHUB_TOKEN = defineSecret("GITHUB_TOKEN");

export const GITHUB_DATA_REPO = "GDGXICA/gdg-ica-data";
export const GITHUB_SITE_REPO = "GDGXICA/gdgxica.github.io";
export const GITHUB_API_BASE = "https://api.github.com";
