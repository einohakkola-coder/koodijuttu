// Vercel serverless function: koodi -> tuote -parit Upstash Redisissä.
//   GET  /api/code?code=1234   -> yhden koodin tuote
//   GET  /api/code?q=maito     -> kaikki tuotteet joiden nimessä on "maito" + niiden koodit
//   POST /api/code {code, name, overwrite}
//   DELETE /api/code?code=1234 -> poistaa koodin
// Ympäristömuuttujat: KV_REST_API_URL + KV_REST_API_TOKEN (tai UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)

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
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ");

// Hakee kaikki tallennetut parit (pieni tietomäärä -> yksinkertaisin ja pysyy aina ajan tasalla)
async function allPairs() {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis(["SCAN", cursor, "MATCH", "code:*", "COUNT", "1000"]);
    cursor = String(next);
    keys.push(...batch);
  } while (cursor !== "0");
  if (!keys.length) return [];
  const vals = await redis(["MGET", ...keys]);
  return keys
    .map((k, i) => ({ code: k.slice(5), name: vals[i] }))
    .filter((p) => p.name !== null);
}

async function search(q) {
  const nq = norm(q);
  const groups = new Map();
  for (const p of await allPairs()) {
    const key = norm(p.name);
    const hit = !nq || key.includes(nq) || (/^\d{4}$/.test(nq) && p.code === nq);
    if (!hit) continue;
    if (!groups.has(key)) groups.set(key, { name: p.name.trim(), codes: [] });
    groups.get(key).codes.push(p.code);
  }
  const rank = (g) => { const k = norm(g.name); return k === nq ? 0 : k.startsWith(nq) ? 1 : 2; };
  return [...groups.values()]
    .map((g) => {
      const codes = g.codes.sort();
      const firsts = new Set(codes.map((c) => c[0]));
      return { ...g, codes, prefix: firsts.size === 1 ? codes[0][0] : null };
    })
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fi"));
}

export default async function handler(req, res) {
  if (!URL_ || !TOKEN) {
    return res.status(500).json({ error: "Tietokantaa ei ole yhdistetty (Upstash Redis puuttuu)." });
  }
  try {
    if (req.method === "GET") {
      if (req.query.q !== undefined) {
        const q = String(req.query.q).slice(0, 100);
        return res.status(200).json({ q, results: await search(q) });
      }
      const code = String(req.query.code || "");
      if (!validCode(code)) return res.status(400).json({ error: "Koodin pitää olla 4 numeroa." });
      const name = await redis(["GET", `code:${code}`]);
      if (name === null) return res.status(404).json({ error: "Koodia ei löytynyt." });
      return res.status(200).json({ code, name });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const code = String(body.code || "");
      const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 100);
      const overwrite = body.overwrite === true;
      if (!validCode(code)) return res.status(400).json({ error: "Koodin pitää olla 4 numeroa." });
      if (!name) return res.status(400).json({ error: "Anna tuotteen nimi." });

      // Saman tuotteen kaikki koodit alkavat samalla numerolla
      const same = (await allPairs()).filter((p) => norm(p.name) === norm(name) && p.code !== code);
      const firsts = new Set(same.map((p) => p.code[0]));
      if (firsts.size === 1 && !firsts.has(code[0])) {
        const d = [...firsts][0];
        return res.status(400).json({ error: `Tuotteen "${same[0].name.trim()}" koodit alkavat numerolla ${d}.`, prefix: d });
      }

      if (overwrite) {
        await redis(["SET", `code:${code}`, name]);
      } else {
        const ok = await redis(["SET", `code:${code}`, name, "NX"]);
        if (ok === null) {
          const existing = await redis(["GET", `code:${code}`]);
          return res.status(409).json({ error: `Koodi ${code} on jo tuotteella "${existing}".` });
        }
      }
      return res.status(200).json({ code, name });
    }

    if (req.method === "DELETE") {
      const code = String(req.query.code || "");
      if (!validCode(code)) return res.status(400).json({ error: "Koodin pitää olla 4 numeroa." });
      // GETDEL on atominen: sama koodi ei voi "löytyä" kahdelle käyttäjälle
      const name = await redis(["GETDEL", `code:${code}`]);
      if (name === null) return res.status(404).json({ error: `Koodi ${code} on jo käytetty tai poistettu.` });
      return res.status(200).json({ code, name, deleted: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "Palvelinvirhe: " + e.message });
  }
}
