const mongoose = require('mongoose');
const { Schema } = mongoose;

const categorySchema = new Schema({
  companyId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true }, // e.g., "Fashion"
  subcategory: { type: String, trim: true }, // e.g., "Mens", "Womens", "Child Fashion"
  types: [{ type: String, trim: true }], // e.g., ["Clothes", "Shoes", "Hats"]
  level: { type: Number, required: true, min: 1, max: 3 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for performance
categorySchema.index({ companyId: 1, name: 1, subcategory: 1 }, { unique: true });

// Pre-save validation
categorySchema.pre('save', async function (next) {
  this.updatedAt = new Date();

  // Validate level and subcategory
  if (this.level > 1 && !this.subcategory) {
    return next(new Error(`Subcategory is required for level ${this.level} categories`));
  }

  if (this.level === 1 && this.subcategory) {
    return next(new Error('Level 1 categories cannot have a subcategory'));
  }

  // Ensure types are non-empty strings if provided
  if (this.types && this.types.length > 0) {
    for (const type of this.types) {
      if (!type || typeof type !== 'string' || type.trim() === '') {
        return next(new Error('Types must be non-empty strings'));
      }
    }
  }

  next();
});

// Method to get full category path
categorySchema.methods.getFullPath = async function () {
  let path = this.subcategory ? `${this.name} > ${this.subcategory}` : this.name;
  if (this.types && this.types.length > 0) {
    path += ` [${this.types.join(', ')}]`;
  }
  return path;
};

// Static method to get category tree (grouped by level)
categorySchema.statics.getCategoryTree = async function (companyId) {
  const categories = await this.find({ companyId, isActive: true }).sort({ name: 1, level: 1 });
  const tree = {
    level1: categories.filter(cat => cat.level === 1).map(cat => ({
      _id: cat._id,
      name: cat.name,
      subcategory: cat.subcategory,
      types: cat.types,
      level: cat.level
    })),
    level2: categories.filter(cat => cat.level === 2).map(cat => ({
      _id: cat._id,
      name: cat.name,
      subcategory: cat.subcategory,
      types: cat.types,
      level: cat.level
    })),
    level3: categories.filter(cat => cat.level === 3).map(cat => ({
      _id: cat._id,
      name: cat.name,
      subcategory: cat.subcategory,
      types: cat.types,
      level: cat.level
    }))
  };
  return tree;
};

module.exports = mongoose.model('Category', categorySchema);