const mongoose = require('mongoose');
const { Schema } = mongoose;

const FieldDefSchema = new Schema({
  name: { type: String, required: true },
  label: { type: String, required: false },
  type: { type: String, default: 'string' },
  required: { type: Boolean, default: false },
  options: [String]
}, { _id: false });

const CategoryFieldTemplateSchema = new Schema({
  l2Name: { type: String, required: true, index: true },
  l2CategoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
  fields: { type: [FieldDefSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CategoryFieldTemplate', CategoryFieldTemplateSchema);
