// models/Warehouse.js (New model for multi-location support, as discussed)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const warehouseSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  location: {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    zipCode: { type: String, trim: true }
  },
  capacity: { type: Number, min: 0 }, // Optional max capacity
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

warehouseSchema.index({ companyId: 1, name: 1 });

warehouseSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Warehouse', warehouseSchema);