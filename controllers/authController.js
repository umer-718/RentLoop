
const db = require("../config/db");
const bcrypt = require("bcryptjs");

exports.showRegister = (req, res) => {
    res.render("auth/register", {
        error: null,
        formData: {}
    });
};

exports.showLogin = (req, res) => {
    res.render("auth/login", {
        error: null
    });
};

// REGISTER
exports.register = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            role
        } = req.body;

        const cleanName = String(name || "").trim();
        const cleanEmail = String(email || "").trim().toLowerCase();
        const cleanPhone = String(phone || "").trim();

        // Never allow users to register as ADMIN.
        const selectedRole = ["CUSTOMER", "OWNER"].includes(role)
            ? role
            : "CUSTOMER";

        const formData = {
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            role: selectedRole
        };

        const showError = (message, status = 400) => {
            return res.status(status).render("auth/register", {
                error: message,
                formData
            });
        };

        // Required fields
        if (!cleanName || !cleanEmail || !password) {
            return showError("Please complete all required fields.");
        }

        // Name validation
        if (cleanName.length > 100) {
            return showError("Name cannot exceed 100 characters.");
        }

        // Email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return showError("Please enter a valid email address.");
        }

        // Password validation
        if (password.length < 8 || password.length > 72) {
            return showError(
                "Password must contain between 8 and 72 characters."
            );
        }

        // Phone validation
        if (cleanPhone.length > 30) {
            return showError("Phone number cannot exceed 30 characters.");
        }

        // Check duplicate email
        const [existing] = await db.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [cleanEmail]
        );

        if (existing.length > 0) {
            return showError("This email is already registered.");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create account
        await db.execute(
            `INSERT INTO users
                (name, email, password, phone, role)
             VALUES (?, ?, ?, ?, ?)`,
            [
                cleanName,
                cleanEmail,
                hashedPassword,
                cleanPhone || null,
                selectedRole
            ]
        );

        // IMPORTANT:
        // Do not create a session after registration.
        // Redirect the user to login.
        return res.redirect("/login");

    } catch (error) {
        console.error("Registration error:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).render("auth/register", {
                error: "This email is already registered.",
                formData: req.body
            });
        }

        return res.status(500).render("auth/register", {
            error: "Unable to create your account.",
            formData: {}
        });
    }
};

// LOGIN
exports.login = async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).render("auth/login", {
                error: "Please enter your email and password."
            });
        }

        const [users] = await db.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1",
            [email]
        );

        if (!users.length) {
            return res.status(401).render("auth/login", {
                error: "Invalid email or password."
            });
        }

        const user = users[0];

        if (user.status !== "ACTIVE") {
            return res.status(403).render("auth/login", {
                error: "Your account is currently blocked."
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.status(401).render("auth/login", {
                error: "Invalid email or password."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error("Login session error:", error);

                return res.status(500).send(
                    "Unable to start your session."
                );
            }

            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            };

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Login save error:", saveError);

                    return res.status(500).send(
                        "Unable to save your session."
                    );
                }

                return res.redirect("/dashboard");
            });
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).render("auth/login", {
            error: "Login failed. Please try again."
        });
    }
};

// LOGOUT
exports.logout = (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error);

            return res.status(500).send("Unable to log out.");
        }

        res.clearCookie("rentloop.sid");
        return res.redirect("/");
    });
};
