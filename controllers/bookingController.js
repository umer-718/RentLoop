const db = require("../config/db");

exports.createBooking = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const itemId = Number(req.params.itemId);
        const customerId = req.session.user.id;
        const startDate = req.body.start_date;
        const endDate = req.body.end_date;

        if (!startDate || !endDate) {
            return res.status(400).send("Select rental dates.");
        }

        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            end < start
        ) {
            return res.status(400).send("Invalid rental date range.");
        }

        const totalDays =
            Math.floor((end - start) / 86400000) + 1;

        await connection.beginTransaction();

        const [items] = await connection.execute(
            `SELECT * FROM items
             WHERE id = ? AND status = 'AVAILABLE'
             FOR UPDATE`,
            [itemId]
        );

        if (!items.length) {
            await connection.rollback();
            return res.status(404).send("Item is not available.");
        }

        const item = items[0];

        if (item.owner_id === customerId) {
            await connection.rollback();
            return res.status(400).send("You cannot book your own item.");
        }

        const [overlaps] = await connection.execute(`
            SELECT id FROM bookings
            WHERE item_id = ?
              AND status IN ('PENDING', 'APPROVED')
              AND start_date <= ?
              AND end_date >= ?
            LIMIT 1
        `, [itemId, endDate, startDate]);

        if (overlaps.length) {
            await connection.rollback();
            return res.status(409).send(
                "This item is already requested or booked for overlapping dates."
            );
        }

        const totalAmount =
            Number(item.price_per_day) * totalDays;

        const [bookingResult] = await connection.execute(`
            INSERT INTO bookings
            (item_id, customer_id, start_date, end_date,
             total_days, total_amount)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            itemId,
            customerId,
            startDate,
            endDate,
            totalDays,
            totalAmount
        ]);

        await connection.execute(
            `INSERT INTO notifications (user_id, message)
             VALUES (?, ?)`,
            [
                item.owner_id,
                `You received a new booking request for ${item.title}.`
            ]
        );

        await connection.commit();

        res.redirect("/my-bookings");
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).send("Unable to create booking.");
    } finally {
        connection.release();
    }
};

exports.myBookings = async (req, res) => {
    try {
        const [bookings] = await db.execute(`
            SELECT
                b.*,
                i.title AS item_title,
                i.image,
                i.location,
                u.name AS owner_name
            FROM bookings b
            JOIN items i ON i.id = b.item_id
            JOIN users u ON u.id = i.owner_id
            WHERE b.customer_id = ?
            ORDER BY b.created_at DESC
        `, [req.session.user.id]);

        res.render("dashboard/bookings", {
            bookings,
            pageTitle: "My Bookings"
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to load bookings.");
    }
};

exports.ownerBookings = async (req, res) => {
    try {
        const [bookings] = await db.execute(`
            SELECT
                b.*,
                i.title AS item_title,
                i.image,
                u.name AS customer_name,
                u.email AS customer_email
            FROM bookings b
            JOIN items i ON i.id = b.item_id
            JOIN users u ON u.id = b.customer_id
            WHERE i.owner_id = ?
            ORDER BY b.created_at DESC
        `, [req.session.user.id]);

        res.render("dashboard/bookings", {
            bookings,
            pageTitle: "Rental Requests"
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to load rental requests.");
    }
};

exports.updateBooking = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const bookingId = Number(req.params.id);
        const action = req.body.action;

        if (!["APPROVED", "REJECTED", "COMPLETED"].includes(action)) {
            return res.status(400).send("Invalid booking action.");
        }

        await connection.beginTransaction();

        const [rows] = await connection.execute(`
            SELECT b.*, i.owner_id, i.title
            FROM bookings b
            JOIN items i ON i.id = b.item_id
            WHERE b.id = ?
            FOR UPDATE
        `, [bookingId]);

        if (!rows.length) {
            await connection.rollback();
            return res.status(404).send("Booking not found.");
        }

        const booking = rows[0];

        if (booking.owner_id !== req.session.user.id) {
            await connection.rollback();
            return res.status(403).send("You cannot manage this booking.");
        }

        if (booking.status !== "PENDING" && action !== "COMPLETED") {
            await connection.rollback();
            return res.status(400).send("This booking has already been processed.");
        }

        if (action === "COMPLETED" && booking.status !== "APPROVED") {
            await connection.rollback();
            return res.status(400).send("Only approved bookings can be completed.");
        }

        if (action === "APPROVED") {
            const [overlaps] = await connection.execute(`
                SELECT id FROM bookings
                WHERE item_id = ?
                  AND id <> ?
                  AND status = 'APPROVED'
                  AND start_date <= ?
                  AND end_date >= ?
                LIMIT 1
            `, [
                booking.item_id,
                bookingId,
                booking.end_date,
                booking.start_date
            ]);

            if (overlaps.length) {
                await connection.rollback();
                return res.status(409).send(
                    "Another booking has already been approved for these dates."
                );
            }
        }

        await connection.execute(
            "UPDATE bookings SET status = ? WHERE id = ?",
            [action, bookingId]
        );

        if (action === "APPROVED") {
            await connection.execute(`
                INSERT INTO payments (booking_id, amount)
                VALUES (?, ?)
            `, [bookingId, booking.total_amount]);
        }

        if (action === "COMPLETED") {
            await connection.execute(`
                UPDATE payments
                SET status = 'PAID', paid_at = NOW()
                WHERE booking_id = ?
            `, [bookingId]);
        }

        const message = {
            APPROVED: `Your booking for ${booking.title} was approved.`,
            REJECTED: `Your booking for ${booking.title} was rejected.`,
            COMPLETED: `Your rental for ${booking.title} was marked completed.`
        }[action];

        await connection.execute(
            "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
            [booking.customer_id, message]
        );

        await connection.commit();
        res.redirect("/owner-bookings");
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).send("Unable to update booking.");
    } finally {
        connection.release();
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        const [result] = await db.execute(`
            UPDATE bookings
            SET status = 'CANCELLED'
            WHERE id = ?
              AND customer_id = ?
              AND status = 'PENDING'
        `, [req.params.id, req.session.user.id]);

        if (!result.affectedRows) {
            return res.status(400).send(
                "Only your pending bookings can be cancelled."
            );
        }

        res.redirect("/my-bookings");
    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to cancel booking.");
    }
};

exports.addReview = async (req, res) => {
    try {
        const bookingId = Number(req.params.id);
        const rating = Number(req.body.rating);
        const comment = String(req.body.comment || "").trim();

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).send("Rating must be between 1 and 5.");
        }

        const [bookings] = await db.execute(`
            SELECT b.id, b.item_id
            FROM bookings b
            WHERE b.id = ?
              AND b.customer_id = ?
              AND b.status = 'COMPLETED'
        `, [bookingId, req.session.user.id]);

        if (!bookings.length) {
            return res.status(403).send(
                "You can review only your completed bookings."
            );
        }

        await db.execute(`
            INSERT INTO reviews
            (booking_id, customer_id, item_id, rating, comment)
            VALUES (?, ?, ?, ?, ?)
        `, [
            bookingId,
            req.session.user.id,
            bookings[0].item_id,
            rating,
            comment
        ]);

        res.redirect(`/items/${bookings[0].item_id}`);
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).send("You have already reviewed this booking.");
        }

        console.error(error);
        res.status(500).send("Unable to submit review.");
    }
};