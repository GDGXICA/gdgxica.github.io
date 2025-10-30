import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";

// Función para generar mensajes personalizados según la red social y evento
function generateShareMessage(eventData, platform = "default") {
  const {
    title,
    date,
    time,
    location,
    description,
    type = "evento",
    hashtags = ["GDGIca", "TechEvent"],
    organization = "GDG Ica",
  } = eventData;

  // Generar hashtags dinámicos
  const hashtagString = hashtags
    .map((tag) => `#${tag.replace(/\s+/g, "")}`)
    .join(" ");

  const messages = {
    whatsapp: `🚀 ¡No te pierdas ${title}!

📅 ${date}
🕐 ${time}
📍 ${location}
🎯 ${description}

¡Regístrate gratis y únete a la comunidad tech de ${organization}!
🔥 ${hashtagString}`,

    twitter: `🚀 ¡${title} está llegando!

📅 ${date} ${time}
📍 ${location}

${description}

¡Regístrate gratis! 🎫
${hashtagString}`,

    linkedin: `🚀 Te invito a ${title}

Un ${type} imperdible para la comunidad tecnológica:

📅 Fecha: ${date}
🕐 Hora: ${time}
📍 Ubicación: ${location}

${description}

¡Nos vemos ahí! Registro gratuito disponible.
Organiza: ${organization}

${hashtagString}`,

    facebook: `🎉 ¡${title} se acerca!

📅 ${date}
🕐 ${time}  
📍 ${location}

${description}

¡Regístrate gratis y únete a nosotros!
Organiza: ${organization}`,

    default: `🚀 ${title}

📅 ${date} - ${time}
📍 ${location}
${description}

¡Regístrate gratis!`,
  };

  return messages[platform] || messages.default;
}

export default function SharedButton({
  title,
  eventDate,
  eventTime,
  eventLocation,
  eventDescription,
  eventType = "evento",
  eventHashtags = "[]",
  eventOrganization = "GDG Ica",
}) {
  const [copySuccess, setCopySuccess] = useState(false);

  const shareUrl = encodeURIComponent(window.location.href);

  // Parsear hashtags si es un string JSON
  let parsedHashtags = [];
  try {
    parsedHashtags =
      typeof eventHashtags === "string"
        ? JSON.parse(eventHashtags)
        : eventHashtags;
  } catch (error) {
    parsedHashtags = ["TechEvent"];
  }

  // Datos del evento para generar mensajes
  const eventData = {
    title: title || "Evento increíble",
    date: eventDate || "Próximamente",
    time: eventTime || "Por definir",
    location: eventLocation || "Ubicación por confirmar",
    description: eventDescription || "Un evento que no te puedes perder",
    type: eventType,
    hashtags: parsedHashtags.length > 0 ? parsedHashtags : ["TechEvent"],
    organization: eventOrganization,
  };

  // Generar mensajes específicos para cada plataforma
  const whatsappMessage = encodeURIComponent(
    generateShareMessage(eventData, "whatsapp")
  );
  const twitterMessage = encodeURIComponent(
    generateShareMessage(eventData, "twitter")
  );
  const linkedinMessage = encodeURIComponent(
    generateShareMessage(eventData, "linkedin")
  );
  const facebookMessage = encodeURIComponent(
    generateShareMessage(eventData, "facebook")
  );

  // Función para copiar enlace
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Error al copiar:", err);
    }
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="text-primary inline-flex items-center justify-center gap-[10px] rounded-md border border-white bg-white px-8 py-[10px] font-medium"
          aria-label="Update dimensions"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-share2-icon lucide-share-2"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
            <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
          </svg>
          Compartir evento
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="focus:shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2),0_0_0_2px_theme(colors.violet7)] data-[state=open]:data-[side=bottom]:animate-slideUpAndFade data-[state=open]:data-[side=left]:animate-slideRightAndFade data-[state=open]:data-[side=right]:animate-slideLeftAndFade data-[state=open]:data-[side=top]:animate-slideDownAndFade z-5 w-[260px] rounded bg-white p-5 shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2)] will-change-[transform,opacity]"
          sideOffset={5}
        >
          <div className="flex flex-col gap-2.5">
            <p className="text-mauve12 mb-2.5 text-[15px] leading-[19px] font-medium">
              Compartir en:
            </p>
            {/* Twitter */}
            <div className="mb-3 grid grid-cols-4 gap-2">
              <a
                href={`https://x.com/intent/tweet?url=${shareUrl}&text=${twitterMessage}`}
                target="_blank"
                className="inline-flex h-11 w-11 items-center gap-2 rounded-md bg-black px-3 py-3 text-center text-white transition-colors hover:bg-gray-800"
                title="Compartir en X (Twitter)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 1200 1227"
                >
                  <path
                    fill="#fff"
                    d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"
                  />
                </svg>
              </a>

              {/* Facebook */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${facebookMessage}`}
                target="_blank"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-blue-700 px-3 py-3 text-center text-white transition-colors hover:bg-blue-800"
                title="Compartir en Facebook"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 36 36"
                  fill="url(#facebook__a)"
                  height="24"
                  width="24"
                >
                  <defs>
                    <linearGradient
                      x1="50%"
                      x2="50%"
                      y1="97.078%"
                      y2="0%"
                      id="facebook__a"
                    >
                      <stop offset="0%" stop-color="#0062E0" />
                      <stop offset="100%" stop-color="#19AFFF" />
                    </linearGradient>
                  </defs>
                  <path d="M15 35.8C6.5 34.3 0 26.9 0 18 0 8.1 8.1 0 18 0s18 8.1 18 18c0 8.9-6.5 16.3-15 17.8l-1-.8h-4l-1 .8z" />
                  <path
                    fill="#FFF"
                    d="m25 23 .8-5H21v-3.5c0-1.4.5-2.5 2.7-2.5H26V7.4c-1.3-.2-2.7-.4-4-.4-4.1 0-7 2.5-7 7v4h-4.5v5H15v12.7c1 .2 2 .3 3 .3s2-.1 3-.3V23h4z"
                  />
                </svg>
              </a>

              {/* WhatsApp */}
              <a
                href={`https://api.whatsapp.com/send?text=${whatsappMessage}%0A%0A${shareUrl}`}
                target="_blank"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-green-500 px-3 py-3 text-center text-white transition-colors hover:bg-green-600"
                title="Compartir en WhatsApp"
              >
                <svg
                  viewBox="0 0 256 259"
                  width="24"
                  height="24"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="xMidYMid"
                >
                  <path
                    d="m67.663 221.823 4.185 2.093c17.44 10.463 36.971 15.346 56.503 15.346 61.385 0 111.609-50.224 111.609-111.609 0-29.297-11.859-57.897-32.785-78.824-20.927-20.927-48.83-32.785-78.824-32.785-61.385 0-111.61 50.224-110.912 112.307 0 20.926 6.278 41.156 16.741 58.594l2.79 4.186-11.16 41.156 41.853-10.464Z"
                    fill="#00E676"
                  />
                  <path
                    d="M219.033 37.668C195.316 13.254 162.531 0 129.048 0 57.898 0 .698 57.897 1.395 128.35c0 22.322 6.278 43.947 16.742 63.478L0 258.096l67.663-17.439c18.834 10.464 39.76 15.347 60.688 15.347 70.453 0 127.653-57.898 127.653-128.35 0-34.181-13.254-66.269-36.97-89.986ZM129.048 234.38c-18.834 0-37.668-4.882-53.712-14.648l-4.185-2.093-40.458 10.463 10.463-39.76-2.79-4.186C7.673 134.63 22.322 69.058 72.546 38.365c50.224-30.692 115.097-16.043 145.79 34.181 30.692 50.224 16.043 115.097-34.18 145.79-16.045 10.463-35.576 16.043-55.108 16.043Zm61.385-77.428-7.673-3.488s-11.16-4.883-18.136-8.371c-.698 0-1.395-.698-2.093-.698-2.093 0-3.488.698-4.883 1.396 0 0-.697.697-10.463 11.858-.698 1.395-2.093 2.093-3.488 2.093h-.698c-.697 0-2.092-.698-2.79-1.395l-3.488-1.395c-7.673-3.488-14.648-7.674-20.229-13.254-1.395-1.395-3.488-2.79-4.883-4.185-4.883-4.883-9.766-10.464-13.253-16.742l-.698-1.395c-.697-.698-.697-1.395-1.395-2.79 0-1.395 0-2.79.698-3.488 0 0 2.79-3.488 4.882-5.58 1.396-1.396 2.093-3.488 3.488-4.883 1.395-2.093 2.093-4.883 1.395-6.976-.697-3.488-9.068-22.322-11.16-26.507-1.396-2.093-2.79-2.79-4.883-3.488H83.01c-1.396 0-2.79.698-4.186.698l-.698.697c-1.395.698-2.79 2.093-4.185 2.79-1.395 1.396-2.093 2.79-3.488 4.186-4.883 6.278-7.673 13.951-7.673 21.624 0 5.58 1.395 11.161 3.488 16.044l.698 2.093c6.278 13.253 14.648 25.112 25.81 35.575l2.79 2.79c2.092 2.093 4.185 3.488 5.58 5.58 14.649 12.557 31.39 21.625 50.224 26.508 2.093.697 4.883.697 6.976 1.395h6.975c3.488 0 7.673-1.395 10.464-2.79 2.092-1.395 3.487-1.395 4.882-2.79l1.396-1.396c1.395-1.395 2.79-2.092 4.185-3.487 1.395-1.395 2.79-2.79 3.488-4.186 1.395-2.79 2.092-6.278 2.79-9.765v-4.883s-.698-.698-2.093-1.395Z"
                    fill="#FFF"
                  />
                </svg>
              </a>
              {/* linkedin */}
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}&summary=${linkedinMessage}`}
                target="_blank"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 px-3 py-3 text-center text-white transition-colors hover:bg-blue-700"
                title="Compartir en LinkedIn"
              >
                <svg
                  width="24"
                  height="24"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="xMidYMid"
                  viewBox="0 0 256 256"
                >
                  <path
                    d="M218.123 218.127h-37.931v-59.403c0-14.165-.253-32.4-19.728-32.4-19.756 0-22.779 15.434-22.779 31.369v60.43h-37.93V95.967h36.413v16.694h.51a39.907 39.907 0 0 1 35.928-19.733c38.445 0 45.533 25.288 45.533 58.186l-.016 67.013ZM56.955 79.27c-12.157.002-22.014-9.852-22.016-22.009-.002-12.157 9.851-22.014 22.008-22.016 12.157-.003 22.014 9.851 22.016 22.008A22.013 22.013 0 0 1 56.955 79.27m18.966 138.858H37.95V95.967h37.97v122.16ZM237.033.018H18.89C8.58-.098.125 8.161-.001 18.471v219.053c.122 10.315 8.576 18.582 18.89 18.474h218.144c10.336.128 18.823-8.139 18.966-18.474V18.454c-.147-10.33-8.635-18.588-18.966-18.453"
                    fill="#0A66C2"
                  />
                </svg>
              </a>
            </div>

            {/* Botón copiar enlace */}
            <div className="border-t border-gray-200 pt-3">
              <button
                onClick={copyToClipboard}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                  copySuccess
                    ? "border border-green-200 bg-green-50 text-green-700"
                    : "border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
                title="Copiar enlace del evento"
              >
                {copySuccess ? (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                    ¡Copiado!
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        width="14"
                        height="14"
                        x="8"
                        y="8"
                        rx="2"
                        ry="2"
                      ></rect>
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                    </svg>
                    Copiar enlace
                  </>
                )}
              </button>
            </div>
          </div>
          <Popover.Close
            className="text-violet11 hover:bg-violet4 focus:shadow-violet7 absolute top-[5px] right-[5px] inline-flex size-[25px] cursor-default items-center justify-center rounded-full outline-none focus:shadow-[0_0_0_2px]"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              class="lucide lucide-x-icon lucide-x"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </Popover.Close>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
