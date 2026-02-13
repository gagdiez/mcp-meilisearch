import { Meilisearch } from "meilisearch";

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const MEILI_INDEX_NAME = process.env.MEILI_INDEX_NAME || "near-docs";

export const meiliClient = new Meilisearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

export interface SearchResult {
  title: string;
  content: string;
  path: string;
}

const MAX_CONTENT_LENGTH = 800;

export async function searchNearDocs(
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const index = meiliClient.index(MEILI_INDEX_NAME);

  const results = await index.search(query, {
    hybrid: { semanticRatio: 0.7, embedder: "default" },
    limit,
    attributesToRetrieve: ["title", "content", "path"],
    attributesToCrop: ["content"],
    cropLength: 200,
  });

  return results.hits.map((hit: any) => ({
    title: hit.title || "Untitled",
    content: (hit._formatted?.content || hit.content || "").slice(
      0,
      MAX_CONTENT_LENGTH
    ),
    path: hit.path || "",
  }));
}
