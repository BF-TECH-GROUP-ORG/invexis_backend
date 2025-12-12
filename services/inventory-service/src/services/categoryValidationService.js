const fs = require('fs');
const path = require('path');
const Category = require('../models/Category');

let mappingCache = null;

function loadMapping() {
  if (mappingCache) return mappingCache;
  const p = path.join(__dirname, '..', 'shared', 'bodies', 'categories', 'l2-field-requirements.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    mappingCache = JSON.parse(raw);
    return mappingCache;
  } catch (err) {
    // graceful fallback
    mappingCache = null;
    return null;
  }
}

function findL2MappingByName(l2Name) {
  const mapping = loadMapping();
  if (!mapping || !mapping.categories) return null;

  const target = l2Name ? l2Name.trim().toLowerCase() : '';
  for (const parent in mapping.categories) {
    const l2s = mapping.categories[parent];
    for (const name in l2s) {
      if (name && name.toLowerCase() === target) return l2s[name];
    }
  }
  return null;
}

function findFieldInPayload(payload, fieldName) {
  if (!payload || !fieldName) return false;

  // check specs array [{name,value}]
  if (Array.isArray(payload.specs)) {
    if (payload.specs.find(s => String(s.name).toLowerCase() === fieldName.toLowerCase())) return true;
  }

  // check attributes array
  if (Array.isArray(payload.attributes)) {
    if (payload.attributes.find(a => String(a.name).toLowerCase() === fieldName.toLowerCase())) return true;
  }

  // check top-level simple fields (e.g. some mappings may reference 'warranty_months' or similar)
  const keys = Object.keys(payload || {});
  for (const k of keys) {
    if (k.toLowerCase() === fieldName.toLowerCase()) return true;
  }

  // pricing nested fields (e.g. price)
  if (payload.pricing) {
    if (fieldName.toLowerCase() === 'price' || fieldName.toLowerCase() === 'baseprice' || fieldName.toLowerCase() === 'base_price') return true;
    if (payload.pricing.basePrice && (fieldName.toLowerCase() === 'baseprice' || fieldName.toLowerCase() === 'base_price' || fieldName.toLowerCase() === 'baseprice')) return true;
  }

  return false;
}

async function validateProductPayloadAgainstL2(payload, l2Name) {
  const l2map = findL2MappingByName(l2Name);
  if (!l2map) {
    return { valid: true, mappingFound: false, errors: [] };
  }

  const required = Array.isArray(l2map.required) ? l2map.required : [];
  const missing = [];

  required.forEach((field) => {
    if (!findFieldInPayload(payload, field)) missing.push(field);
  });

  return {
    valid: missing.length === 0,
    mappingFound: true,
    errors: missing.map(f => ({ field: f, reason: 'required_field_missing' })),
  };
}

module.exports = {
  loadMapping,
  findL2MappingByName,
  validateProductPayloadAgainstL2,
};
