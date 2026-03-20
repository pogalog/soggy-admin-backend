"use strict";

const { createApiHandler } = require("./src/handlers/apiHandler");
const {
  createAdminCommissionsHandler
} = require("./src/handlers/adminCommissionsHandler");
const { createAdminProductsHandler } = require("./src/handlers/adminProductsHandler");
const {
  createAdminProductImageHandler
} = require("./src/handlers/adminProductImageHandler");
const { getPool } = require("./src/db/pool");

const adminCommissionsHandler = createAdminCommissionsHandler({ getPool });
const adminProductsHandler = createAdminProductsHandler({ getPool });
const adminProductImageHandler = createAdminProductImageHandler({ getPool });
const api = createApiHandler({
  adminCommissionsHandler,
  adminProductsHandler,
  adminProductImageHandler
});

module.exports = {
  api,
  adminProductsImage: api
};
