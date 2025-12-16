/**
 * Shop Operating Hours Utility
 * Determines if a shop is currently open based on configured hours
 */

/**
 * Check if shop is currently open
 * @param {Object} operatingHours - Array of ShopOperatingHours records
 * @param {Date} checkTime - Time to check (defaults to now)
 * @returns {Object} { isOpen: boolean, message: string, nextOpenTime: Date|null }
 */
function isShopOpen(operatingHours, checkTime = new Date()) {
    if (!operatingHours || operatingHours.length === 0) {
        return {
            isOpen: true, // If no hours set, assume always open
            message: "No operating hours configured",
            nextOpenTime: null,
        };
    }

    const dayOfWeek = checkTime.getDay(); // 0 = Sunday
    const currentTime = formatTimeForComparison(checkTime);

    // Find today's hours
    const todayHours = operatingHours.find((h) => h.day_of_week === dayOfWeek);

    if (!todayHours) {
        return {
            isOpen: false,
            message: `Shop closed on ${getDayName(dayOfWeek)}`,
            nextOpenTime: null,
        };
    }

    // If no open_time/close_time, shop is closed that day
    if (!todayHours.open_time || !todayHours.close_time) {
        return {
            isOpen: false,
            message: `Shop is closed on ${getDayName(dayOfWeek)}`,
            nextOpenTime: null,
        };
    }

    const openTime = todayHours.open_time; // e.g., "08:00"
    const closeTime = todayHours.close_time; // e.g., "17:00"

    // Check if current time is between open and close
    const isCurrentlyOpen =
        currentTime >= openTime && currentTime < closeTime;

    if (isCurrentlyOpen) {
        return {
            isOpen: true,
            message: "Shop is open",
            nextOpenTime: null,
        };
    }

    // Calculate next open time
    let nextOpenTime = null;

    if (currentTime < openTime) {
        // Shop opens later today
        nextOpenTime = createNextDateTime(checkTime, dayOfWeek, openTime);
    } else {
        // Shop is closed for today, find next open day
        for (let i = 1; i <= 7; i++) {
            const nextDay = (dayOfWeek + i) % 7;
            const nextDayHours = operatingHours.find(
                (h) => h.day_of_week === nextDay
            );

            if (nextDayHours && nextDayHours.open_time && nextDayHours.close_time) {
                nextOpenTime = createNextDateTime(checkTime, nextDay, nextDayHours.open_time, i);
                break;
            }
        }
    }

    return {
        isOpen: false,
        message: "Shop is currently closed",
        nextOpenTime,
    };
}

/**
 * Format time as HH:MM for comparison
 * @param {Date} date
 * @returns {string} HH:MM format
 */
function formatTimeForComparison(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

/**
 * Create next datetime for shop opening
 * @param {Date} baseDate - Current date/time
 * @param {number} dayOfWeek - Target day of week
 * @param {string} time - Time in HH:MM format
 * @param {number} daysOffset - Days to add (default 0)
 * @returns {Date}
 */
function createNextDateTime(baseDate, dayOfWeek, time, daysOffset = 0) {
    const [hours, minutes] = time.split(":").map(Number);
    const nextDate = new Date(baseDate);

    if (daysOffset > 0) {
        nextDate.setDate(nextDate.getDate() + daysOffset);
    } else if (dayOfWeek !== nextDate.getDay()) {
        // Adjust to target day of week
        const currentDay = nextDate.getDay();
        const daysUntilTarget =
            dayOfWeek >= currentDay ? dayOfWeek - currentDay : 7 - currentDay + dayOfWeek;
        nextDate.setDate(nextDate.getDate() + daysUntilTarget);
    }

    nextDate.setHours(hours, minutes, 0, 0);
    return nextDate;
}

/**
 * Get day name from day of week number
 * @param {number} dayOfWeek - 0-6
 * @returns {string}
 */
function getDayName(dayOfWeek) {
    const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];
    return days[dayOfWeek] || "Unknown";
}

/**
 * Format shop open/close status for response
 * @param {Object} statusCheck - Result from isShopOpen()
 * @returns {string} Human-readable message
 */
function formatStatusMessage(statusCheck) {
    if (statusCheck.isOpen) {
        return statusCheck.message;
    }

    let message = statusCheck.message;
    if (statusCheck.nextOpenTime) {
        const timeStr = statusCheck.nextOpenTime.toLocaleString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
        message += `. Opens ${timeStr}`;
    }
    return message;
}

module.exports = {
    isShopOpen,
    formatTimeForComparison,
    createNextDateTime,
    getDayName,
    formatStatusMessage,
};
