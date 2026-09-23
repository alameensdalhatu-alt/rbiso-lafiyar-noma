require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-me";
const DATA = path.join(__dirname, "data");

fs.mkdirSync(DATA, { recursive: true });
const SCANS = path.join(DATA, "scans.json");
const FARMERS = path.join(DATA, "farmers.json");
if (!fs.existsSync(SCANS)) fs.writeFileSync(SCANS, "[]");
if (!fs.existsSync(FARMERS)) fs.writeFileSync(FARMERS, "[]");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|jpg)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG or WebP images are allowed."));
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const cropIds = {
  maize: ["msv", "nclb", "fall_armyworm"],
  tomato: ["early_blight", "bacterial_wilt", "leaf_curl_mosaic"],
  rice: ["blast", "rym", "blb"],
  groundnut: ["rosette", "cercospora", "rust"],
  soybean: ["soy_leaf_spot"]
};

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return []; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    version: "4.0"
  });
});

app.post("/api/diagnose", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI is not configured on the server." });
    }
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const crop = String(req.body.crop || "").toLowerCase();
    if (!cropIds[crop]) return res.status(400).json({ error: "Unsupported crop." });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const allowed = cropIds[crop].join(", ");

    const prompt = `You are an agricultural crop-disease screening assistant.
Crop: ${crop}.
Possible local disease IDs only: ${allowed}.

Examine the image carefully. Return ONLY valid JSON in exactly this shape:
{"id":"one allowed id or unknown","confidence":0.0,"observations":["short observation"],"note":"short advisory"}

Rules:
- Never invent a disease ID.
- If the image is unclear, unrelated, too poor, or does not support a listed disease, use id "unknown" and confidence below 0.50.
- Confidence must be between 0 and 1.
- Keep observations short and visual.
- This is advisory screening, not a definitive diagnosis.
- Do not recommend pesticide brands or unsafe chemical rates.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
          ]
        }
      ]
    });

    let text = (response.output_text || "")
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let result;
    try { result = JSON.parse(text); }
    catch {
      return res.status(502).json({ error: "AI returned an unreadable result." });
    }

    const id = cropIds[crop].includes(result.id) ? result.id : "unknown";
    const confidence = Math.min(1, Math.max(0, Number(result.confidence) || 0));

    const record = {
      id: Date.now().toString(),
      crop,
      diseaseId: id,
      confidence,
      observations: Array.isArray(result.observations) ? result.observations.slice(0, 6) : [],
      note: String(result.note || ""),
      createdAt: new Date().toISOString()
    };

    const scans = readJson(SCANS);
    scans.unshift(record);
    writeJson(SCANS, scans.slice(0, 500));

    res.json(record);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Diagnosis failed. Please try again." });
  }
});

app.get("/api/history", (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  res.json(readJson(SCANS).slice(0, limit));
});

app.get("/api/profile", (req, res) => {
  res.json(readJson(FARMERS)[0] || {});
});

app.post("/api/profile", (req, res) => {
  const p = {
    name: String(req.body.name || "").trim(),
    phone: String(req.body.phone || "").trim(),
    location: String(req.body.location || "").trim(),
    updatedAt: new Date().toISOString()
  };
  if (!p.name) return res.status(400).json({ error: "Name is required." });

  const farmers = readJson(FARMERS);
  const existing = farmers.findIndex(x => x.phone && p.phone && x.phone === p.phone);

  if (existing >= 0) {
    farmers[existing] = { ...farmers[existing], ...p };
  } else {
    farmers.unshift({ id: Date.now().toString(), ...p });
  }
  writeJson(FARMERS, farmers.slice(0, 1000));
  res.json(farmers[0]);
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const scans = readJson(SCANS);
  const farmers = readJson(FARMERS);
  const byCrop = {};
  const byDisease = {};

  for (const s of scans) {
    byCrop[s.crop] = (byCrop[s.crop] || 0) + 1;
    byDisease[s.diseaseId] = (byDisease[s.diseaseId] || 0) + 1;
  }

  res.json({
    farmers: farmers.length,
    scans: scans.length,
    byCrop,
    byDisease,
    recent: scans.slice(0, 20)
  });
});

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));

app.use((err, req, res, next) => {
  if (err && err.message) return res.status(400).json({ error: err.message });
  next(err);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`R-BISO LAFIYAR-NOMA V4 running on port ${PORT}`);
});
