import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { parseSpanishDate } from "@/utils/parseSpanishDate";

export async function GET(context: APIContext) {
  const events = await getCollection("events");

  const items = events
    .map((event) => ({
      title: event.data.name,
      pubDate: parseSpanishDate(event.data.date),
      description: event.data.shortDescription,
      link: `/eventos/${event.id}`,
      categories: [event.data.category.label],
    }))
    // Más recientes primero (fechas no parseables caen al epoch → al final).
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: "Eventos — GDG Ica",
    description:
      "Próximos eventos, talleres y meetups del Google Developer Group Ica.",
    site: context.site ?? "https://gdgica.com",
    items,
    customData: "<language>es</language>",
  });
}
