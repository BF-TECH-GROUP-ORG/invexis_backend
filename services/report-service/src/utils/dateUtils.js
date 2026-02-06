const moment = require('moment');

/**
 * Calculates start and end dates based on a period string or raw dates.
 * Priorities:
 * 1. Explicit startDate & endDate
 * 2. 'period' parameter (today, yesterday, this_week, last_week, this_month, last_month, this_year)
 * 3. Default: Current Month
 * 
 * @param {string} startDate 
 * @param {string} endDate 
 * @param {string} period 
 * @returns {Object} { start, end } formatted YYYY-MM-DD
 */
const getDateRange = (startDate, endDate, period) => {
    // 1. Explicit Dates
    if (startDate && endDate) {
        return {
            start: moment(startDate).format('YYYY-MM-DD'),
            end: moment(endDate).format('YYYY-MM-DD')
        };
    }

    const today = moment();

    // 2. Period Logic
    switch (period) {
        case 'today':
            return {
                start: today.startOf('day').format('YYYY-MM-DD'),
                end: today.endOf('day').format('YYYY-MM-DD')
            };
        case 'yesterday':
            const yesterday = today.subtract(1, 'days');
            return {
                start: yesterday.startOf('day').format('YYYY-MM-DD'),
                end: yesterday.endOf('day').format('YYYY-MM-DD')
            };
        case 'this_week':
            return {
                start: today.startOf('isoWeek').format('YYYY-MM-DD'),
                end: today.endOf('isoWeek').format('YYYY-MM-DD')
            };
        case 'last_week':
            const lastWeek = today.subtract(1, 'weeks');
            return {
                start: lastWeek.startOf('isoWeek').format('YYYY-MM-DD'),
                end: lastWeek.endOf('isoWeek').format('YYYY-MM-DD')
            };
        case 'this_month':
            return {
                start: today.startOf('month').format('YYYY-MM-DD'),
                end: today.endOf('month').format('YYYY-MM-DD')
            };
        case 'last_month':
            const lastMonth = today.subtract(1, 'months');
            return {
                start: lastMonth.startOf('month').format('YYYY-MM-DD'),
                end: lastMonth.endOf('month').format('YYYY-MM-DD')
            };
        case 'this_year':
            return {
                start: today.startOf('year').format('YYYY-MM-DD'),
                end: today.endOf('year').format('YYYY-MM-DD')
            };
        default:
            // 3. Default (Current Month)
            return {
                start: moment().startOf('month').format('YYYY-MM-DD'),
                end: moment().endOf('month').format('YYYY-MM-DD')
            };
    }
};

module.exports = { getDateRange };
