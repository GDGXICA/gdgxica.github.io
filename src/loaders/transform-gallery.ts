import { fetchGdgData, stripDomain } from "./fetch-gdg-data";

interface ExternalGalleryItem {
  id: string;
  image_url: string;
  alt: string;
  title: string;
  description: string;
  tag: string;
  type?: string;
}

const TAG_TO_TYPE: Record<string, string> = {
  devfest: "devfest",
  "i/o": "io",
  "study jam": "studyjam",
  wtm: "wtm",
  meetup: "meetup",
  workshop: "workshop",
  networking: "networking",
  hackathon: "hackathon",
};

function deriveType(tag: string, explicitType?: string): string {
  if (explicitType) return explicitType;
  return TAG_TO_TYPE[tag.toLowerCase()] || "meetup";
}

export async function loadGallery() {
  const items = await fetchGdgData<ExternalGalleryItem[]>(
    "gallery/gallery.json"
  );
  return items.map((item) => ({
    id: item.id,
    src: stripDomain(item.image_url),
    alt: item.alt,
    title: item.title,
    description: item.description,
    tag: item.tag,
    type: deriveType(item.tag, item.type),
  }));
}
