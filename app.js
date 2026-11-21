
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");

const db = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const itemRoutes = require("./routes/itemRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const adminRoutes = require("./routes/adminRoutes");

const { auth } = require("./middleware/auth");

const app = express();

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Session
app.use(session({
    name: "rentloop.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Global logged-in user
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Application routes
app.use(authRoutes);
app.use(itemRoutes);
app.use(bookingRoutes);

// Main dashboard
app.get("/dashboard", auth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [[stats]] = await db.execute(`
            SELECT
                (SELECT COUNT(*) FROM items
                 WHERE owner_id = ?) AS my_items,

                (SELECT COUNT(*) FROM bookings
                 WHERE customer_id = ?) AS my_bookings,

                (SELECT COUNT(*) FROM bookings b
                 JOIN items i ON i.id = b.item_id
                 WHERE i.owner_id = ?
                 AND b.status = 'PENDING') AS pending_requests,

                (SELECT COALESCE(SUM(p.amount), 0)
                 FROM payments p
                 JOIN bookings b ON b.id = p.booking_id
                 JOIN items i ON i.id = b.item_id
                 WHERE i.owner_id = ?
                 AND p.status = 'PAID') AS earnings
        `, [userId, userId, userId, userId]);

        const [notifications] = await db.execute(`
            SELECT *
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 5
        `, [userId]);

        res.render("dashboard/index", {
            stats,
            notifications
        });

    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).send("Unable to load dashboard.");
    }
});

// Mark notification as read
app.post("/notifications/:id/read", auth, async (req, res) => {
    try {
        await db.execute(`
            UPDATE notifications
            SET is_read = TRUE
            WHERE id = ? AND user_id = ?
        `, [req.params.id, req.session.user.id]);

        res.redirect("/dashboard");

    } catch (error) {
        console.error("Notification error:", error);
        res.status(500).send("Unable to update notification.");
    }
});

// Admin routes
app.use("/admin", adminRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).send("Page not found.");
});

// Global error handler
app.use((error, req, res, next) => {
    console.error("Application error:", error);

    if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).send("Image must be 5 MB or smaller.");
    }

    if (error.message && error.message.startsWith("Only JPG")) {
        return res.status(400).send(error.message);
    }

    res.status(500).send("Something went wrong.");
});

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await db.query("SELECT 1");

        console.log("MySQL connected successfully.");

        app.listen(PORT, () => {
            console.log(`RentLoop running at http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
}

startServer();
