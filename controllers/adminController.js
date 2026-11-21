const db = require("../config/db");

exports.dashboard = async (req, res) => {
    try {
        const [[stats]] = await db.execute(`
            SELECT
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM items) AS total_items,
                (SELECT COUNT(*) FROM bookings) AS total_bookings,
                (SELECT COUNT(*) FROM bookings
                 WHERE status = 'PENDING') AS pending_bookings,
                (SELECT COALESCE(SUM(amount), 0)
                 FROM payments WHERE status = 'PAID') AS total_revenue
        `);

        const [users] = await db.execute(`
            SELECT id, name, email, role, status, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 10
        `);

        const [items] = await db.execute(`
            SELECT i.id, i.title, i.status, u.name AS owner_name
            FROM items i
            JOIN users u ON u.id = i.owner_id
            ORDER BY i.created_at DESC
            LIMIT 10
        `);

        res.render("admin/dashboard", {
            stats,
            users,
            items
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to load admin dashboard.");
    }
};

exports.updateUserStatus = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const status = req.body.status;

        if (!["ACTIVE", "BLOCKED"].includes(status)) {
            return res.status(400).send("Invalid user status.");
        }

        if (userId === req.session.user.id) {
            return res.status(400).send("You cannot block your own account.");
        }

        const [result] = await db.execute(
            "UPDATE users SET status = ? WHERE id = ? AND role <> 'ADMIN'",
            [status, userId]
        );

        if (!result.affectedRows) {
            return res.status(404).send("User not found or cannot be changed.");
        }

        await db.execute(
            "INSERT INTO admin_logs (admin_id, action) VALUES (?, ?)",
            [req.session.user.id, `Changed user ${userId} status to ${status}`]
        );

        res.redirect("/admin");
    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to update user.");
    }
};

exports.updateItemStatus = async (req, res) => {
    try {
        const status = req.body.status;

        if (!["AVAILABLE", "UNAVAILABLE", "BLOCKED"].includes(status)) {
            return res.status(400).send("Invalid item status.");
        }

        const [result] = await db.execute(
            "UPDATE items SET status = ? WHERE id = ?",
            [status, req.params.id]
        );

        if (!result.affectedRows) {
            return res.status(404).send("Item not found.");
        }

        await db.execute(
            "INSERT INTO admin_logs (admin_id, action) VALUES (?, ?)",
            [
                req.session.user.id,
                `Changed item ${req.params.id} status to ${status}`
            ]
        );

        res.redirect("/admin");
    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to update item.");
    }
};