const mongoose = require('mongoose');
const { Schema } = mongoose;
const fs = require('fs');
const path = require('path');

/**
 * ProductFieldRequirements
 * Stores per-L2 category required / optional field definitions.
 * This model can be seeded from the canonical JSON file under `shared/bodies`.
 */
const FieldReqSchema = new Schema({
  l1Category: { type: String, required: true, index: true },
  l2Name: { type: String, required: true, index: true },
  required: { type: [String], default: [] },
  optional: { type: [String], default: [] },
  commonFields: { type: [String], default: [] },
}, {
  timestamps: true,
});

FieldReqSchema.index({ l1Category: 1, l2Name: 1 }, { unique: true });

/**
 * Load and upsert entries from the canonical JSON mapping file.
 * Returns the number of upserts performed.
 */
FieldReqSchema.statics.seedFromJsonFile = async function (filePath) {
  const Model = this;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', '..', 'shared', 'bodies', 'categories', filePath || 'l2-field-requirements.json');
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read field requirements file at ${abs}: ${err.message}`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in field requirements file: ${err.message}`);
  }

  const common = (json.fieldDefinitions && json.fieldDefinitions.commonFields) || [];
  const categories = (json.categories || {});
  const ops = [];

  Object.keys(categories).forEach(l1 => {
    const l1Node = categories[l1] || {};
    Object.keys(l1Node).forEach(l2 => {
      const def = l1Node[l2] || {};
      const required = Array.isArray(def.required) ? def.required : [];
      const optional = Array.isArray(def.optional) ? def.optional : [];
      ops.push({
        updateOne: {
          filter: { l1Category: l1, l2Name: l2 },
          update: { $set: { l1Category: l1, l2Name: l2, required, optional, commonFields: common } },
          upsert: true,
        }
      });
    });
  });

  if (!ops.length) return 0;
  const res = await Model.bulkWrite(ops, { ordered: false });
  return res.upsertedCount + (res.modifiedCount || 0);
};

/**
 * Find mapping by L2 name (case-insensitive). Returns a single document or null.
 */
FieldReqSchema.statics.findByL2Name = async function (l2Name) {
  if (!l2Name) return null;
  return this.findOne({ l2Name: new RegExp(`^${l2Name}$`, 'i') }).lean();
};

module.exports = mongoose.model('ProductFieldRequirements', FieldReqSchema);
