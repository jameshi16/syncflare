const encoder = new TextEncoder();

export async function hashBuffer(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data.slice());
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

export async function hashString(data: string): Promise<string> {
  return hashBuffer(encoder.encode(data));
}
