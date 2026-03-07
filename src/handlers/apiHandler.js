"use strict";

function normalizePath(req) {
  const raw = req.path || req.url || "/";
  const pathOnly = String(raw).split("?")[0] || "/";
  return pathOnly;
}

function isAdminProductImageRequest(req) {
  const path = normalizePath(req);
  return (
    path === "/admin/products/image" ||
    path === "/admin/products/image/" ||
    path === "/api/admin/products/image" ||
    path === "/api/admin/products/image/"
  );
}

function isAdminProductsRequest(req) {
  const path = normalizePath(req);
  return (
    path === "/admin/products" ||
    path === "/admin/products/" ||
    path === "/api/admin/products" ||
    path === "/api/admin/products/"
  );
}

function createApiHandler({ adminProductImageHandler, adminProductsHandler }) {
  return async function api(req, res) {
    try {
      if (isAdminProductImageRequest(req)) {
        return adminProductImageHandler(req, res);
      }

      if (isAdminProductsRequest(req)) {
        return adminProductsHandler(req, res);
      }

      return res.status(404).json({
        error: "Route not found. Use /admin/products or /admin/products/image"
      });
    } catch (error) {
      console.error("Unhandled API routing error", {
        method: req.method,
        path: req.path || req.url,
        message: error.message
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

module.exports = {
  createApiHandler
};
