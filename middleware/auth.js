
exports.auth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect("/login");
    }

    next();
};

exports.ownerOnly = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect("/login");
    }

    const role = req.session.user.role;

    if (!["OWNER", "ADMIN"].includes(role)) {
        return res.status(403).send(
            "Access denied. Only owners and administrators can perform this action."
        );
    }

    next();
};

exports.adminOnly = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect("/login");
    }

    if (req.session.user.role !== "ADMIN") {
        return res.status(403).send("Administrator access required.");
    }

    next();
};
