// scripts/load_templates.js
// Simple loader to upsert templates from the `templates` folder into the Template model.

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

const Template = require("../src/models/Template");
const logger = require("../src/utils/logger");

const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/invexis";

const templatesDir = path.join(__dirname, "..", "templates");

const walk = (dir) => {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
};

const inferTypeFromPath = (p) => {
  if (p.includes("/email/")) return "email";
  if (p.includes("/sms/")) return "sms";
  if (p.includes("/push/")) return "push";
  return "inApp";
};

const nameFromFilename = (filePath) => {
  const parts = filePath.split(path.sep);
  const filename = parts[parts.length - 1];
  return filename.replace(path.extname(filename), "");
};

const load = async () => {
  await mongoose.connect(MONGO, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  logger.info("Connected to MongoDB for template loader");

  const files = walk(templatesDir);

  // Group by template name and type
  const groups = {};
  for (const f of files) {
    const type = inferTypeFromPath(f);
    const name = nameFromFilename(f);
    groups[name] = groups[name] || { name, type, files: [] };
    groups[name].files.push(f);
  }

  for (const key of Object.keys(groups)) {
    const g = groups[key];
    // Prefer .html for email content, fallback to .txt
    let content = "";
    let subject = "";
    if (g.type === "email") {
      const html = g.files.find((x) => x.endsWith(".html"));
      const txt = g.files.find((x) => x.endsWith(".txt"));
      if (html) content = fs.readFileSync(html, "utf8");
      else if (txt) content = fs.readFileSync(txt, "utf8");
      subject = (g.name || "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (g.type === "sms" || g.type === "push") {
      const file = g.files[0];
      content = fs.readFileSync(file, "utf8");
      // for push, content is JSON; leave it as string
    }

    // Upsert - IMPORTANT: Match by BOTH name AND type to prevent overwrites
    try {
      await Template.findOneAndUpdate(
        { name: g.name, type: g.type },
        { name: g.name, type: g.type, subject, content, isActive: true },
        { upsert: true, new: true }
      );
      logger.info(`Upserted template: ${g.name} (${g.type})`);
    } catch (err) {
      logger.error("Failed to upsert template", g.name, err.message);
    }
  }

  await mongoose.disconnect();
  logger.info("Template loader finished");
};

load().catch((err) => {
  console.error("Template loader error:", err);
  process.exit(1);
});
