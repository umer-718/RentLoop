
const express = require("express");
const router = express.Router();

const booking = require("../controllers/bookingController");
const { auth, ownerOnly } = require("../middleware/auth");

// Create booking
router.post(
    "/items/:itemId/book",
    auth,
    booking.createBooking
);

// Customer bookings
router.get(
    "/my-bookings",
    auth,
    booking.myBookings
);

// Owner bookings
router.get(
    "/owner-bookings",
    auth,
    ownerOnly,
    booking.ownerBookings
);

// Update booking
router.post(
    "/bookings/:id/update",
    auth,
    ownerOnly,
    booking.updateBooking
);

// Cancel booking
router.post(
    "/bookings/:id/cancel",
    auth,
    booking.cancelBooking
);

// Add review
router.post(
    "/bookings/:id/review",
    auth,
    booking.addReview
);

module.exports = router;
