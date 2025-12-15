/**
 * Shop Operating Hours Controller
 * Handles all shop operating hours operations with event-driven architecture
 * NO direct inter-service calls - everything via events
 */

"use strict";

const asyncHandler = require("express-async-handler");
const { ShopOperatingHours, Shop } = require("../models/index.model");
const { operatingHoursEvents } = require("../events/eventHelpers");
const db = require("../config/db");

/**
 * @desc    Get operating hours for a shop
 * @route   GET /shop/:shopId/operating-hours
 * @access  Private
 */
const getOperatingHours = asyncHandler(async (req, res) => {
    const { shopId } = req.params;

    // Verify shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
        res.status(404);
        throw new Error("Shop not found");
    }

    // Verify company ownership
    const companyId = req.user?.companyId || req.body.companyId || req.query.companyId;
    if (shop.company_id !== companyId) {
        res.status(403);
        throw new Error("Unauthorized: Shop does not belong to your company");
    }

    // Get operating hours
    const hours = await ShopOperatingHours.findByShop(shopId);

    res.json({
        success: true,
        data: hours.map((h) => ({
            id: h.id,
            shopId: h.shop_id,
            day_of_week: h.day_of_week,
            open_time: h.open_time,
            close_time: h.close_time,
        })),
    });
});

/**
 * @desc    Set operating hours for a shop (bulk update for all days)
 * @route   PUT /shop/:shopId/operating-hours
 * @access  Private (Shop Manager/Company Admin)
 *
 * Request body:
 * {
 *   "hours": [
 *     { "day_of_week": 0, "open_time": "09:00", "close_time": "18:00" },
 *     { "day_of_week": 1, "open_time": "09:00", "close_time": "18:00" },
 *     ...
 *   ]
 * }
 */
const setOperatingHours = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { hours } = req.body;

    // Validate input
    if (!hours || !Array.isArray(hours) || hours.length !== 7) {
        res.status(400);
        throw new Error("Must provide hours for all 7 days (0-6)");
    }

    // Verify shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
        res.status(404);
        throw new Error("Shop not found");
    }

    // Verify company ownership
    const companyId = req.user?.companyId || req.body.companyId || req.query.companyId;
    if (shop.company_id !== companyId) {
        res.status(403);
        throw new Error("Unauthorized: Shop does not belong to your company");
    }

    // Validate hours format
    hours.forEach((h, index) => {
        if (h.day_of_week !== index) {
            throw new Error(`Hours must be in order: day_of_week should be ${index} at index ${index}`);
        }

        // Allow null times for closed days
        if (h.open_time !== null && h.close_time !== null) {
            // Validate time format HH:MM
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (!timeRegex.test(h.open_time) || !timeRegex.test(h.close_time)) {
                throw new Error("Times must be in HH:MM format (24-hour)");
            }

            // Validate open < close
            if (h.open_time >= h.close_time) {
                throw new Error(`Day ${index}: close_time must be after open_time`);
            }
        }
    });

    // Update with transaction
    const result = await db.transaction(async (trx) => {
        // Delete existing hours for shop
        const existingHours = await ShopOperatingHours.findByShop(shopId, trx);
        for (const h of existingHours) {
            await ShopOperatingHours.delete(h.id, req.user?.id || null, trx);
        }

        // Bulk create new hours
        const newHours = await ShopOperatingHours.bulkCreate(
            shopId,
            hours,
            req.user?.id || null,
            trx
        );

        // ✅ EMIT EVENT - NO DIRECT API CALL
        // This event will be picked up by Auth Service and cached
        await operatingHoursEvents.updated(shopId, companyId, newHours, trx);

        return newHours;
    });

    res.json({
        success: true,
        data: result.map((h) => ({
            id: h.id,
            day_of_week: h.day_of_week,
            open_time: h.open_time,
            close_time: h.close_time,
        })),
        message: "Operating hours updated successfully",
    });
});

/**
 * @desc    Update operating hours for a specific day
 * @route   PATCH /shop/:shopId/operating-hours/:dayOfWeek
 * @access  Private (Shop Manager/Company Admin)
 *
 * Request body:
 * {
 *   "open_time": "09:00",
 *   "close_time": "18:00"
 * }
 */
const updateDayHours = asyncHandler(async (req, res) => {
    const { shopId, dayOfWeek } = req.params;
    const { open_time, close_time } = req.body;

    // Validate day
    const day = parseInt(dayOfWeek);
    if (isNaN(day) || day < 0 || day > 6) {
        res.status(400);
        throw new Error("dayOfWeek must be 0-6 (Sunday-Saturday)");
    }

    // Verify shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
        res.status(404);
        throw new Error("Shop not found");
    }

    // Verify company ownership
    const companyId = req.user?.companyId || req.body.companyId || req.query.companyId;
    if (shop.company_id !== companyId) {
        res.status(403);
        throw new Error("Unauthorized: Shop does not belong to your company");
    }

    // Validate time format
    if (open_time !== null || close_time !== null) {
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

        if (open_time && !timeRegex.test(open_time)) {
            res.status(400);
            throw new Error("open_time must be in HH:MM format");
        }

        if (close_time && !timeRegex.test(close_time)) {
            res.status(400);
            throw new Error("close_time must be in HH:MM format");
        }

        if (open_time && close_time && open_time >= close_time) {
            res.status(400);
            throw new Error("close_time must be after open_time");
        }
    }

    // Update with transaction
    const result = await db.transaction(async (trx) => {
        const dayHours = await ShopOperatingHours.findByShopAndDay(shopId, day, trx);

        if (!dayHours) {
            res.status(404);
            throw new Error("No hours configured for this day");
        }

        // Update
        const updated = await ShopOperatingHours.update(
            dayHours.id,
            {
                open_time: open_time !== undefined ? open_time : dayHours.open_time,
                close_time: close_time !== undefined ? close_time : dayHours.close_time,
                updated_by: req.user?.id || null,
            },
            trx
        );

        // ✅ EMIT EVENT - Refresh all hours in cache
        // Get all hours to emit
        const allHours = await ShopOperatingHours.findByShop(shopId, trx);
        await operatingHoursEvents.updated(shopId, companyId, allHours, trx);

        return updated;
    });

    res.json({
        success: true,
        data: {
            id: result.id,
            day_of_week: result.day_of_week,
            open_time: result.open_time,
            close_time: result.close_time,
        },
        message: "Hours updated successfully",
    });
});

/**
 * @desc    Clear operating hours (delete all for shop)
 * @route   DELETE /shop/:shopId/operating-hours
 * @access  Private (Shop Manager/Company Admin)
 */
const clearOperatingHours = asyncHandler(async (req, res) => {
    const { shopId } = req.params;

    // Verify shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
        res.status(404);
        throw new Error("Shop not found");
    }

    // Verify company ownership
    const companyId = req.user?.companyId || req.body.companyId || req.query.companyId;
    if (shop.company_id !== companyId) {
        res.status(403);
        throw new Error("Unauthorized: Shop does not belong to your company");
    }

    // Delete with transaction
    const result = await db.transaction(async (trx) => {
        const hours = await ShopOperatingHours.findByShop(shopId, trx);

        // Delete all
        for (const h of hours) {
            await ShopOperatingHours.delete(h.id, req.user?.id || null, trx);
        }

        // ✅ EMIT EVENT - Signal to Auth Service to clear cache
        await operatingHoursEvents.deleted(shopId, companyId, trx);

        return true;
    });

    res.json({
        success: true,
        message: "Operating hours cleared successfully",
    });
});

/**
 * @desc    Check if shop is currently open (info endpoint)
 * @route   GET /shop/:shopId/is-open
 * @access  Public
 *
 * Returns current open/close status and next opening time
 */
const checkShopOpen = asyncHandler(async (req, res) => {
    const { shopId } = req.params;

    const shop = await Shop.findById(shopId);
    if (!shop) {
        res.status(404);
        throw new Error("Shop not found");
    }

    const hours = await ShopOperatingHours.findByShop(shopId);

    // Calculate shop status using same logic as Auth Service
    const status = calculateShopStatus(hours);

    res.json({
        success: true,
        data: {
            shopId,
            isOpen: status.isOpen,
            message: status.message,
            currentTime: new Date().toISOString(),
            timezone: shop.timezone,
            todaysHours: status.todaysHours,
            nextOpenTime: status.nextOpenTime,
        },
    });
});

/**
 * Calculate shop open/close status
 * (Same logic as Auth Service checkShopOpen)
 */
function calculateShopStatus(operatingHours, checkTime = new Date()) {
    if (!operatingHours || operatingHours.length === 0) {
        return {
            isOpen: true,
            message: "No operating hours configured",
            todaysHours: null,
            nextOpenTime: null,
        };
    }

    const dayOfWeek = checkTime.getDay();
    const currentTime = formatTime(checkTime);

    const todayHours = operatingHours.find((h) => h.day_of_week === dayOfWeek);

    if (!todayHours || !todayHours.open_time || !todayHours.close_time) {
        return {
            isOpen: false,
            message: "Closed today",
            todaysHours: todayHours || null,
            nextOpenTime: findNextOpen(operatingHours, dayOfWeek),
        };
    }

    const isOpen =
        currentTime >= todayHours.open_time && currentTime < todayHours.close_time;

    return {
        isOpen,
        message: isOpen ? "Open now" : "Closed",
        todaysHours: {
            open_time: todayHours.open_time,
            close_time: todayHours.close_time,
        },
        nextOpenTime: isOpen ? null : findNextOpen(operatingHours, dayOfWeek),
    };
}

function formatTime(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

function findNextOpen(hours, currentDay) {
    for (let i = 1; i <= 7; i++) {
        const nextDay = (currentDay + i) % 7;
        const h = hours.find((x) => x.day_of_week === nextDay);
        if (h && h.open_time) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + i);
            const [hour, min] = h.open_time.split(":").map(Number);
            nextDate.setHours(hour, min, 0, 0);
            return nextDate.toISOString();
        }
    }
    return null;
}

module.exports = {
    getOperatingHours,
    setOperatingHours,
    updateDayHours,
    clearOperatingHours,
    checkShopOpen,
};
