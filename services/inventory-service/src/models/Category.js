// models/Category.js (Unchanged, but ensuring alignment with Product stats)
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxLength: [100, 'Category name cannot exceed 100 characters'],
    minLength: [2, 'Category name must be at least 2 characters'],
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    index: true,
  },
  description: {
    type: String,
    maxLength: [500, 'Description cannot exceed 500 characters'],
  },
  level: {
    type: Number,
    required: true,
    enum: [1, 2, 3],
    index: true,
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
    index: true,
  },
  // companyId is required for level 3 categories to scope them to a company
  companyId: {
    type: String,
    default: null,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  image: {
    url: String,
    alt: String,
  },
  seo: {
    metaTitle: {
      type: String,
      maxLength: [60, 'Meta title cannot exceed 60 characters'],
    },
    metaDescription: {
      type: String,
      maxLength: [160, 'Meta description cannot exceed 160 characters'],
    },
    keywords: [String],
  },
  attributes: [{
    name: String,
    type: {
      type: String,
      enum: ['text', 'number', 'select', 'multiselect', 'boolean'],
      default: 'text',
    },
    required: {
      type: Boolean,
      default: false,
    },
    options: [String], // for select/multiselect types
  }],
  statistics: {
    totalProducts: {
      type: Number,
      default: 0,
    },
    totalSubcategories: {
      type: Number,
      default: 0,
    },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for subcategories
categorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentCategory',
});

// Virtual for products count
categorySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  count: true,
});

// Indexes for performance
categorySchema.index({ name: 'text', description: 'text' });
categorySchema.index({ level: 1, parentCategory: 1 });
categorySchema.index({ isActive: 1, sortOrder: 1 });

// Middleware to generate slug
categorySchema.pre('save', function (next) {
  // Only generate slug if not provided and name is set
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Middleware to preserve companyId for level 3 categories
categorySchema.pre('save', async function (next) {
  // If this is an update (not a new document) and it's level 3, restore the original companyId
  if (!this.isNew && this.level === 3) {
    const original = await this.constructor.findById(this._id);
    if (original && original.companyId) {
      this.companyId = original.companyId;
    }
  }
  next();
});

// Middleware to validate parent category level
categorySchema.pre('save', async function (next) {
  if (this.parentCategory) {
    const parent = await this.constructor.findById(this.parentCategory);
    if (!parent) {
      return next(new Error('Parent category not found'));
    }
    if (parent.level >= 3) {
      return next(new Error('Cannot create subcategory under level 3 category'));
    }
    if (this.level !== parent.level + 1) {
      return next(new Error('Invalid category level hierarchy'));
    }
  } else if (this.level !== 1) {
    return next(new Error('Root categories must be level 1'));
  }

  // Validation: level 3 categories must include a companyId
  if (this.level === 3) {
    if (!this.companyId) {
      return next(new Error('companyId is required for level 3 categories'));
    }
  }
  next();
});

// Static method to get category tree
categorySchema.statics.getCategoryTree = async function (parentId = null, level = 1) {
  const categories = await this.find({
    parentCategory: parentId,
    level: level,
    isActive: true,
  }).sort({ sortOrder: 1, name: 1 });

  const categoryTree = [];
  for (let category of categories) {
    const categoryObj = category.toObject();
    if (level < 3) {
      categoryObj.children = await this.getCategoryTree(category._id, level + 1);
    }
    categoryTree.push(categoryObj);
  }
  return categoryTree;
};

// Static method to get category path
categorySchema.statics.getCategoryPath = async function (categoryId) {
  const category = await this.findById(categoryId);
  if (!category) return [];

  const path = [category];
  let currentCategory = category;

  while (currentCategory.parentCategory) {
    currentCategory = await this.findById(currentCategory.parentCategory);
    if (currentCategory) {
      path.unshift(currentCategory);
    } else {
      break;
    }
  }

  return path;
};

module.exports = mongoose.model('Category', categorySchema);