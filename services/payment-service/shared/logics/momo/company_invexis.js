// Route: Request payment from company to Invexis
app.post("/pay/company-to-invexis", async (req, res) => {
    try {
        const { amount, currency, companyPhone, tierId } = req.body;

        if (!companyPhone)
            return res.status(400).json({ error: "Company phone is required" });

        const externalId = uuidv4();
        const token = await getMomoToken();

        // Request payment from company to Invexis
        await axios.post(
            "https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay",
            {
                amount: amount.toString(),
                currency,
                externalId,
                payer: { partyIdType: "MSISDN", partyId: companyPhone }, // company pays
                payee: { partyIdType: "MSISDN", partyId: process.env.INVEXIS_MOMO_PHONE }, // Invexis receives
                payerMessage: `Tier payment for ${tierId}`,
                payeeNote: `Payment to Invexis for ${tierId} tier`,
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

        res.status(202).json({ message: "Tier payment request sent to Invexis", externalId });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});
