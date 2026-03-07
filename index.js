"use strict";

const { createApiHandler } = require("./src/handlers/apiHandler");
const { createAdminProductsHandler } = require("./src/handlers/adminProductsHandler");
const {
  createAdminProductImageHandler
} = require("./src/handlers/adminProductImageHandler");
const { getPool } = require("./src/db/pool");

const adminProductsHandler = createAdminProductsHandler({ getPool });
const adminProductImageHandler = createAdminProductImageHandler({ getPool });
const api = createApiHandler({
  adminProductsHandler,
  adminProductImageHandler
});

module.exports = {
  api,
  adminProductsImage: api
};
