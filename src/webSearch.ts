const NEAR_DOCS_BASE = "https://docs.near.org";

export async function fetchNearDoc(path: string): Promise<string> {
  const url = `${NEAR_DOCS_BASE}/${path}`;
  const response = await fetch(url);
  
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  return await response.text();
}
