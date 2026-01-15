import express from "express";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// Function to get MTN MoMo access token
async function getMomoToken() {
    const resp = await axios.post(
        `https://sandbox.momodeveloper.mtn.com/collection/token/`,
        {},
        {
            headers: {
                Authorization: `Basic ${Buffer.from(
                    `${process.env.MTN_API_USER}:${process.env.MTN_API_KEY}`
                ).toString("base64")}`,
                "Ocp-Apim-Subscription-Key": process.env.MTN_COLLECTION_SUBSCRIPTION_KEY,
            },
        }
    );
    return resp.data.access_token;
}

// Route: Request payment from customer to company
app.post("/pay/customer-to-company", async (req, res) => {
    try {
        const { amount, currency, customerPhone, companyId } = req.body;

        // Lookup company info from database
        const company = await CompanyModel.findById(companyId);
        if (!company || !company.momoPhone)
            return res.status(404).json({ error: "Company MoMo account not found" });

        const externalId = uuidv4();
        const token = await getMomoToken();

        // Request payment
        await axios.post(
            "https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay",
            {
                amount: amount.toString(),
                currency,
                externalId,
                payer: { partyIdType: "MSISDN", partyId: customerPhone }, // who pays
                payee: { partyIdType: "MSISDN", partyId: company.momoPhone }, // where money goes
                payerMessage: `Paying ${company.name} via Invexis`,
                payeeNote: `Payment for ${company.name}`,
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "X-Reference-Id": externalId,
                    "X-Target-Environment": process.env.MTN_TARGET_ENVIRONMENT,
                    "Ocp-Apim-Subscription-Key": process.env.MTN_COLLECTION_SUBSCRIPTION_KEY,
                    "Content-Type": "application/json",
                },
            }
        );

        res.status(202).json({ message: "Payment request sent to company", externalId });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});
