import { getCollection } from "astro:content";

export async function GET() {
  const allEvents = await getCollection("organizers");
  return new Response(JSON.stringify(allEvents));
}
