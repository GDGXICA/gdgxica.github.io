import { getCollection } from "astro:content";

export async function GET() {
  const allEvents = await getCollection("volunteers");
  return new Response(JSON.stringify(allEvents));
}
