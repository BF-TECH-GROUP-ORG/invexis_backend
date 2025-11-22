const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    zipCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String }
}, { _id: false });

module.exports = AddressSchema;
