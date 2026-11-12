// Vercel serverless function: tallentaa ja hakee koodi -> nimi -parit Upstash Redikseen.
// Tarvitsee ympäristömuuttujat (tulevat automaattisesti kun lisäät Upstash Redis -integraation Vercelissä):
//   KV_REST_API_URL + KV_REST_API_TOKEN   (tai UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const validCode = (c) => typeof c === "string" && /^\d{4}$/.test(c);

export default async function handler(req, res) {
  if (!URL_ || !TOKEN) {
    return res.status(500).json({ error: "Tietokantaa ei ole yhdistetty (Upstash Redis puuttuu)." });
  }
  try {
    if (req.method === "GET") {
      const code = String(req.query.code || "");
      if (!validCode(code)) return res.status(400).json({ error: "Koodin pitää olla 4 numeroa." });
      const name = await redis(["GET", `code:${code}`]);
      if (name === null) return res.status(404).json({ error: "Koodia ei löytynyt." });
      return res.status(200).json({ code, name });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const code = String(body.code || "");
      const name = String(body.name || "").trim().slice(0, 100);
      const overwrite = body.overwrite === true;
      if (!validCode(code)) return res.status(400).json({ error: "Koodin pitää olla 4 numeroa." });
      if (!name) return res.status(400).json({ error: "Anna nimi." });

      if (overwrite) {
        await redis(["SET", `code:${code}`, name]);
      } else {
        const ok = await redis(["SET", `code:${code}`, name, "NX"]);
        if (ok === null) return res.status(409).json({ error: "Koodi on jo käytössä." });
      }
      return res.status(200).json({ code, name });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "Palvelinvirhe: " + e.message });
  }
}
