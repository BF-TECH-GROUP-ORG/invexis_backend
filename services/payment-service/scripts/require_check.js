// quick require check for syntax errors
try {
    require('../src/controllers/paymentController');
    require('../src/services/paymentService');
    console.log('Require check passed');
    process.exit(0);
} catch (err) {
    console.error('Require check failed:', err);
    process.exit(1);
}
