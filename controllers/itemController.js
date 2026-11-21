
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

const uploadDirectory = path.join(__dirname, "../public/uploads");

const getCategories = async () => {
    const [categories] = await db.execute(
        "SELECT * FROM categories ORDER BY name"
    );
    return categories;
};

const removeUploadedFile = (filename) => {
    if (!filename) return;

    const safeName = path.basename(filename);
    const filePath = path.join(uploadDirectory, safeName);

    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (error) => {
            if (error) console.error("Image cleanup error:", error);
        });
    }
};

const validPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0;
};

const validNonNegativeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0;
};

const getItemFormData = async (req, item, error, statusCode = 400) => {
    const categories = await getCategories();

    return req.res.status(statusCode).render("items/form", {
        item,
        categories,
        error
    });
};

exports.home = async (req, res) => {
    try {
        const [items] = await db.execute(`
            SELECT
                i.*,
                u.name AS owner_name,
                c.name AS category_name,
                COALESCE(AVG(r.rating), 0) AS average_rating,
                COUNT(DISTINCT r.id) AS review_count
            FROM items i
            JOIN users u ON u.id = i.owner_id
            JOIN categories c ON c.id = i.category_id
            LEFT JOIN reviews r ON r.item_id = i.id
            WHERE i.status = 'AVAILABLE'
              AND u.status = 'ACTIVE'
            GROUP BY i.id
            ORDER BY i.created_at DESC
        `);

        const categories = await getCategories();

        res.render("items/index", {
            items,
            categories,
            search: "",
            categoryValue: ""
        });
    } catch (error) {
        console.error("Marketplace error:", error);
        res.status(500).send("Unable to load marketplace.");
    }
};

exports.searchItems = async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const category = String(req.query.category || "").trim();

        let sql = `
            SELECT
                i.*,
                u.name AS owner_name,
                c.name AS category_name,
                COALESCE(AVG(r.rating), 0) AS average_rating,
                COUNT(DISTINCT r.id) AS review_count
            FROM items i
            JOIN users u ON u.id = i.owner_id
            JOIN categories c ON c.id = i.category_id
            LEFT JOIN reviews r ON r.item_id = i.id
            WHERE i.status = 'AVAILABLE'
              AND u.status = 'ACTIVE'
        `;

        const params = [];

        if (search) {
            sql += `
                AND (
                    i.title LIKE ?
                    OR i.description LIKE ?
                    OR i.location LIKE ?
                )
            `;

            const term = `%${search}%`;
            params.push(term, term, term);
        }

        if (category) {
            if (!/^\d+$/.test(category)) {
                return res.status(400).send("Invalid category.");
            }

            sql += " AND i.category_id = ?";
            params.push(Number(category));
        }

        sql += " GROUP BY i.id ORDER BY i.created_at DESC";

        const [items] = await db.execute(sql, params);
        const categories = await getCategories();

        res.render("items/index", {
            items,
            categories,
            search,
            categoryValue: category
        });
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).send("Search failed.");
    }
};

exports.details = async (req, res) => {
    try {
        const itemId = req.params.id;

        const [items] = await db.execute(`
            SELECT
                i.*,
                u.name AS owner_name,
                u.phone AS owner_phone,
                c.name AS category_name,
                COALESCE(AVG(r.rating), 0) AS average_rating,
                COUNT(DISTINCT r.id) AS review_count
            FROM items i
            JOIN users u ON u.id = i.owner_id
            JOIN categories c ON c.id = i.category_id
            LEFT JOIN reviews r ON r.item_id = i.id
            WHERE i.id = ?
              AND u.status = 'ACTIVE'
            GROUP BY i.id
        `, [itemId]);

        if (!items.length) {
            return res.status(404).send("Item not found.");
        }

        const [reviews] = await db.execute(`
            SELECT
                r.*,
                u.name AS customer_name
            FROM reviews r
            JOIN users u ON u.id = r.customer_id
            WHERE r.item_id = ?
            ORDER BY r.created_at DESC
        `, [itemId]);

        res.render("items/details", {
            item: items[0],
            reviews
        });
    } catch (error) {
        console.error("Item details error:", error);
        res.status(500).send("Unable to load item.");
    }
};

exports.showAddForm = async (req, res) => {
    try {
        const categories = await getCategories();

        res.render("items/form", {
            item: null,
            categories,
            error: null
        });
    } catch (error) {
        console.error("Add form error:", error);
        res.status(500).send("Unable to open item form.");
    }
};

exports.addItem = async (req, res) => {
    try {
        const {
            title,
            category_id,
            description,
            price_per_day,
            security_deposit,
            location
        } = req.body;

        const cleanTitle = String(title || "").trim();
        const cleanDescription = String(description || "").trim();
        const cleanLocation = String(location || "").trim();

        const price = Number(price_per_day);
        const deposit = Number(
            security_deposit === "" || security_deposit == null
                ? 0
                : security_deposit
        );

        if (
            !cleanTitle ||
            cleanTitle.length > 150 ||
            !cleanDescription ||
            !cleanLocation ||
            cleanLocation.length > 255 ||
            !/^\d+$/.test(String(category_id || "")) ||
            !validPositiveNumber(price_per_day) ||
            !validNonNegativeNumber(deposit)
        ) {
            removeUploadedFile(req.file?.filename);

            const categories = await getCategories();

            return res.status(400).render("items/form", {
                item: null,
                categories,
                error: "Enter valid item details, a valid category and a positive daily price."
            });
        }

        const [category] = await db.execute(
            "SELECT id FROM categories WHERE id = ?",
            [Number(category_id)]
        );

        if (!category.length) {
            removeUploadedFile(req.file?.filename);

            const categories = await getCategories();

            return res.status(400).render("items/form", {
                item: null,
                categories,
                error: "Please select a valid category."
            });
        }

        await db.execute(`
            INSERT INTO items (
                owner_id,
                category_id,
                title,
                description,
                price_per_day,
                security_deposit,
                location,
                image
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            req.session.user.id,
            Number(category_id),
            cleanTitle,
            cleanDescription,
            price,
            deposit,
            cleanLocation,
            req.file ? req.file.filename : null
        ]);

        res.redirect("/my-items");
    } catch (error) {
        removeUploadedFile(req.file?.filename);
        console.error("Add item error:", error);
        res.status(500).send("Unable to add item.");
    }
};

exports.showEditForm = async (req, res) => {
    try {
        const [items] = await db.execute(
            `SELECT * FROM items
             WHERE id = ? AND owner_id = ?`,
            [req.params.id, req.session.user.id]
        );

        if (!items.length) {
            return res.status(404).send("Item not found.");
        }

        const categories = await getCategories();

        res.render("items/form", {
            item: items[0],
            categories,
            error: null
        });
    } catch (error) {
        console.error("Edit form error:", error);
        res.status(500).send("Unable to open item.");
    }
};

exports.updateItem = async (req, res) => {
    try {
        const {
            title,
            category_id,
            description,
            price_per_day,
            security_deposit,
            location,
            status
        } = req.body;

        const cleanTitle = String(title || "").trim();
        const cleanDescription = String(description || "").trim();
        const cleanLocation = String(location || "").trim();

        const price = Number(price_per_day);
        const deposit = Number(
            security_deposit === "" || security_deposit == null
                ? 0
                : security_deposit
        );

        if (
            !cleanTitle ||
            cleanTitle.length > 150 ||
            !cleanDescription ||
            !cleanLocation ||
            cleanLocation.length > 255 ||
            !/^\d+$/.test(String(category_id || "")) ||
            !validPositiveNumber(price_per_day) ||
            !validNonNegativeNumber(deposit)
        ) {
            removeUploadedFile(req.file?.filename);

            return res.status(400).send(
                "Please enter valid item details."
            );
        }

        const [items] = await db.execute(
            `SELECT * FROM items
             WHERE id = ? AND owner_id = ?`,
            [req.params.id, req.session.user.id]
        );

        if (!items.length) {
            removeUploadedFile(req.file?.filename);
            return res.status(404).send("Item not found.");
        }

        const [categories] = await db.execute(
            "SELECT id FROM categories WHERE id = ?",
            [Number(category_id)]
        );

        if (!categories.length) {
            removeUploadedFile(req.file?.filename);
            return res.status(400).send("Invalid category.");
        }

        const newStatus = status === "UNAVAILABLE"
            ? "UNAVAILABLE"
            : "AVAILABLE";

        const oldImage = items[0].image;
        const newImage = req.file
            ? req.file.filename
            : oldImage;

        await db.execute(`
            UPDATE items
            SET
                category_id = ?,
                title = ?,
                description = ?,
                price_per_day = ?,
                security_deposit = ?,
                location = ?,
                image = ?,
                status = ?
            WHERE id = ? AND owner_id = ?
        `, [
            Number(category_id),
            cleanTitle,
            cleanDescription,
            price,
            deposit,
            cleanLocation,
            newImage,
            newStatus,
            req.params.id,
            req.session.user.id
        ]);

        if (req.file && oldImage && oldImage !== newImage) {
            removeUploadedFile(oldImage);
        }

        res.redirect("/my-items");
    } catch (error) {
        removeUploadedFile(req.file?.filename);
        console.error("Update item error:", error);
        res.status(500).send("Unable to update item.");
    }
};

exports.deleteItem = async (req, res) => {
    try {
        const itemId = req.params.id;

        const [items] = await db.execute(
            `SELECT id, image
             FROM items
             WHERE id = ? AND owner_id = ?`,
            [itemId, req.session.user.id]
        );

        if (!items.length) {
            return res.status(404).send("Item not found.");
        }

        const [activeBookings] = await db.execute(
            `SELECT id
             FROM bookings
             WHERE item_id = ?
               AND status IN ('PENDING', 'APPROVED')
             LIMIT 1`,
            [itemId]
        );

        if (activeBookings.length) {
            return res.status(400).send(
                "This item cannot be deleted because it has active bookings."
            );
        }

        /*
         * Preserve historical bookings and reviews.
         * Unlist the item instead of deleting a record that may be
         * referenced by other database tables.
         */
        await db.execute(
            `UPDATE items
             SET status = 'UNAVAILABLE'
             WHERE id = ? AND owner_id = ?`,
            [itemId, req.session.user.id]
        );

        res.redirect("/my-items");
    } catch (error) {
        console.error("Delete item error:", error);
        res.status(500).send("Unable to remove item.");
    }
};

exports.myItems = async (req, res) => {
    try {
        const [items] = await db.execute(
            `SELECT *
             FROM items
             WHERE owner_id = ?
             ORDER BY created_at DESC`,
            [req.session.user.id]
        );

        res.render("dashboard/my-items", { items });
    } catch (error) {
        console.error("My items error:", error);
        res.status(500).send("Unable to load your items.");
    }
};
