
const express = require("express");
const router = express.Router();

const admin = require("../controllers/adminController");
const { adminOnly } = require("../middleware/auth");

// Admin dashboard
router.get(
    "/",
    adminOnly,
    admin.dashboard
);

// Update user status
router.post(
    "/users/:id/status",
    adminOnly,
    admin.updateUserStatus
);

// Update item status
router.post(
    "/items/:id/status",
    adminOnly,
    admin.updateItemStatus
);

module.exports = router;
