#!/bin/bash

# Example: Upload verification documents to Cloudinary via company service
# Replace COMPANY_ID with your actual company ID

COMPANY_ID="07f0c16d-95af-4cd6-998b-edfea57d87d7"
API_URL="http://localhost:8004/company/companies/${COMPANY_ID}/verification-docs"

# Upload files using curl
curl -X POST "${API_URL}" \
  -F "documents=@./sample-documents/business_license.pdf" \
  -F "documents=@./sample-documents/tax_certificate.jpg" \
  -F "documentType_0=business_license" \
  -F "documentType_1=tax_certificate" \
  -F "documentNotes_0=Valid until 2026" \
  -F "documentNotes_1=Annual tax clearance certificate"

echo ""
echo "Files uploaded successfully to Cloudinary!"
