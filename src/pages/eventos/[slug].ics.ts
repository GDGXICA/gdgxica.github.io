import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";
import type { APIContext } from "astro";
import { buildEventIcs } from "@/utils/eventDates";

export async function getStaticPaths() {
  const events = await getCollection("events");
  return events.map((event) => ({
    params: { slug: event.id },
    props: { event },
  }));
}

export async function GET({ props }: APIContext) {
  const { event } = props as { event: CollectionEntry<"events"> };
  const body = buildEventIcs(event.data, event.id);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.id}.ics"`,
    },
  });
}
