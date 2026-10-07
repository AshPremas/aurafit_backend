# AuraFit AR Back End

REST API for the AuraFit AR mobile app (customer and admin login, clothing catalogue, image upload, wishlist). Built with Node.js, Express and PostgreSQL.

App repository: https://github.com/AshPremas/aurafit_ar.git

## Setup
```
copy .env.example .env      (fill in DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, PORT)
npm install
node server.js
```
Requires a PostgreSQL database named `aurafit_ar` with the tables clothing_item, category, shop_owner, customer and wishlist.

## Main endpoints
- `GET /api/items`, `GET /api/items/category/:name`, `GET /api/items/:id`
- `POST /api/items`, `PUT /api/items/:id`, `DELETE /api/items/:id` (admin)
- `POST /api/upload` (image upload)
- `GET /api/categories`
- `POST /api/admin/login`
- `POST /api/customer/register`, `POST /api/customer/login`
- `GET /api/wishlist/:customerId`, `POST /api/wishlist`, `DELETE /api/wishlist/:wishlistId`

Uploaded images are stored in the `uploads` folder and are not part of the repository.