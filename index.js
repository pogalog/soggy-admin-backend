"use strict";

const { createApiHandler } = require("./src/handlers/apiHandler");
const {
  createAdminCommissionsHandler
} = require("./src/handlers/adminCommissionsHandler");
const { createAdminOrdersHandler } = require("./src/handlers/adminOrdersHandler");
const {
  createAdminProductSafetyHandler
} = require("./src/handlers/adminProductSafetyHandler");
const { createAdminProductsHandler } = require("./src/handlers/adminProductsHandler");
const {
  createAdminProductImageHandler
} = require("./src/handlers/adminProductImageHandler");
const { createAdminMarketsHandler } = require("./src/handlers/adminMarketsHandler");
const { getPool } = require("./src/db/pool");

const adminCommissionsHandler = createAdminCommissionsHandler({ getPool });
const adminMarketsHandler = createAdminMarketsHandler({ getPool });
const adminOrdersHandler = createAdminOrdersHandler({ getPool });
const adminProductSafetyHandler = createAdminProductSafetyHandler({ getPool });
const adminProductsHandler = createAdminProductsHandler({ getPool });
const adminProductImageHandler = createAdminProductImageHandler({ getPool });
const api = createApiHandler({
  adminCommissionsHandler,
  adminMarketsHandler,
  adminOrdersHandler,
  adminProductSafetyHandler,
  adminProductsHandler,
  adminProductImageHandler
});

module.exports = {
  api,
  adminProductsImage: api
};
