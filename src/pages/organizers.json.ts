import { getCollection } from "astro:content";

export async function GET() {
  try {
    const items = await getCollection("organizers");
    return new Response(JSON.stringify(items), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to load data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
