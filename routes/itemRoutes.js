
const express = require("express");
const router = express.Router();

const itemController = require("../controllers/itemController");
const { auth, ownerOnly } = require("../middleware/auth");
const upload = require("../middleware/upload");

// Marketplace
router.get("/", itemController.home);
router.get("/search", itemController.searchItems);

// IMPORTANT: Static routes BEFORE /items/:id
router.get(
    "/items/add",
    auth,
    ownerOnly,
    itemController.showAddForm
);

router.post(
    "/items/add",
    auth,
    ownerOnly,
    upload.single("image"),
    itemController.addItem
);

router.get(
    "/my-items",
    auth,
    ownerOnly,
    itemController.myItems
);

// Edit and delete
router.get(
    "/items/:id/edit",
    auth,
    ownerOnly,
    itemController.showEditForm
);

router.post(
    "/items/:id/edit",
    auth,
    ownerOnly,
    upload.single("image"),
    itemController.updateItem
);

router.post(
    "/items/:id/delete",
    auth,
    ownerOnly,
    itemController.deleteItem
);

// Dynamic details route LAST
router.get("/items/:id", itemController.details);

module.exports = router;
