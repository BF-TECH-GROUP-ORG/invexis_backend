const checkCompanyOperatingHours = async (req, res, next) => {
    const companyId = req.body.company_id || req.params.company_id;
    const company = await knex('companies').where('id', companyId).first();

    if (company.enforce_operating_hours) {
        const tz = company.timezone || 'UTC';
        const now = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour12: false });

        if (now < company.open_time || now > company.close_time) {
            return res.status(403).json({
                message: 'Company operations are currently closed. Please perform actions during operating hours.'
            });
        }
    }

    next();
};
