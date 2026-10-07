require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir)); // serve uploaded images

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

//PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'aurafit_ar',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

//Test Connection
pool.connect((err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to PostgreSQL database!');
  }
});

// CLOTHING ITEMS ENDPOINTS
// GET all clothing items
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ci.*, c.category_name 
      FROM clothing_item ci
      JOIN category c ON ci.category_id = c.category_id
      ORDER BY ci.item_id
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET items by category
app.get('/api/items/category/:categoryName', async (req, res) => {
  try {
    const { categoryName } = req.params;
    const result = await pool.query(`
      SELECT ci.*, c.category_name 
      FROM clothing_item ci
      JOIN category c ON ci.category_id = c.category_id
      WHERE c.category_name = $1
      ORDER BY ci.item_id
    `, [categoryName]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single item by ID
app.get('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT ci.*, c.category_name 
      FROM clothing_item ci
      JOIN category c ON ci.category_id = c.category_id
      WHERE ci.item_id = $1
    `, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, error: 'Item not found' 
      });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add new clothing item (Admin)
app.post('/api/items', async (req, res) => {
  try {
    const { 
      name, price, description, 
      sizes, image_url, ar_overlay_url, 
      category_id, owner_id 
    } = req.body;
    const result = await pool.query(`
      INSERT INTO clothing_item 
        (name, price, description, sizes, 
         image_url, ar_overlay_url, category_id, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [name, price, description, sizes, 
        image_url, ar_overlay_url, category_id, owner_id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update clothing item (Admin)
app.put('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, sizes } = req.body;
    const result = await pool.query(`
      UPDATE clothing_item 
      SET name=$1, price=$2, description=$3, sizes=$4
      WHERE item_id=$5
      RETURNING *
    `, [name, price, description, sizes, id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE clothing item (Admin)
app.delete('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'DELETE FROM clothing_item WHERE item_id = $1', [id]
    );
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add new clothing image 
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ success: true, data: { url } });
});

// CATEGORIES ENDPOINT
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM category ORDER BY category_id'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN AUTH ENDPOINTS
// POST admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      'SELECT * FROM shop_owner WHERE email = $1', [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, error: 'Invalid credentials' 
      });
    }
    const owner = result.rows[0];
    // Simple password check
    if (password !== owner.password) {
      return res.status(401).json({ 
        success: false, error: 'Invalid credentials' 
      });
    }
    res.json({ 
      success: true, 
      data: { 
        owner_id: owner.owner_id,
        username: owner.username,
        email: owner.email 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CUSTOMER AUTH ENDPOINTS
// POST customer register
app.post('/api/customer/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO customer (name, email, password)
      VALUES ($1, $2, $3)
      RETURNING customer_id, name, email
    `, [name, email, hashedPassword]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST customer login
app.post('/api/customer/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      'SELECT * FROM customer WHERE email = $1', [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, error: 'Invalid credentials' 
      });
    }
    const customer = result.rows[0];
    const validPassword = await bcrypt.compare(
      password, customer.password
    );
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, error: 'Invalid credentials' 
      });
    }
    res.json({ 
      success: true, 
      data: { 
        customer_id: customer.customer_id,
        name: customer.name,
        email: customer.email 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WISHLIST ENDPOINTS
// GET customer wishlist
app.get('/api/wishlist/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await pool.query(`
      SELECT w.*, ci.name, ci.price, ci.image_url
      FROM wishlist w
      JOIN clothing_item ci ON w.item_id = ci.item_id
      WHERE w.customer_id = $1
      ORDER BY w.date_added DESC
    `, [customerId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add to wishlist
app.post('/api/wishlist', async (req, res) => {
  try {
    const { customer_id, item_id } = req.body;
    const result = await pool.query(`
      INSERT INTO wishlist (customer_id, item_id)
      VALUES ($1, $2)
      RETURNING *
    `, [customer_id, item_id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE from wishlist
app.delete('/api/wishlist/:wishlistId', async (req, res) => {
  try {
    const { wishlistId } = req.params;
    await pool.query(
      'DELETE FROM wishlist WHERE wishlist_id = $1', 
      [wishlistId]
    );
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

//Start Server 
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AuraFit AR Server running on port ${PORT}`);
  console.log(`API available at http://192.168.8.184:3000/api`);
});