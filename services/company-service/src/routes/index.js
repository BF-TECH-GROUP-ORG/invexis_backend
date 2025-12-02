const companyRoutes = require('./companyRoutes');
const roleRoutes = require('./roleRoutes');
const companyUserRoutes = require('./companyUserRoutes');
const departmentUserRoutes = require('./departmentUserRoutes');
const companyAdminRoutes = require('./companyAdminRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
const express = require('express')
const router = express.Router()

router.get('/', (req, res) => {
    res.json({ message: "company service routed to gateway" })
})
router.use('/companies', companyRoutes);
router.use('/roles', roleRoutes);
router.use('/company-users', companyUserRoutes);
router.use('/department-users', departmentUserRoutes);
router.use('/company-admins', companyAdminRoutes);
router.use('/subscriptions', subscriptionRoutes);


module.exports = router