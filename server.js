require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Terhubung ke MongoDB Atlas');
});

// Schema dan Model
const transactionSchema = new mongoose.Schema({
  id: String,
  date: Date,
  items: [{
    id: Number,
    name: String,
    price: Number,
    quantity: Number,
    category: String
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  cash: Number,
  change: Number
});

const productSchema = new mongoose.Schema({
  id: Number,
  name: String,
  price: Number,
  icon: String,
  category: String,
  sales: { type: Number, default: 0 }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
const Product = mongoose.model('Product', productSchema);

// API Endpoint
app.post('/api/transactions', async (req, res) => {
  try {
    // Generate transaction ID
    const count = await Transaction.countDocuments();
    const transactionId = `TRX-${(count + 1).toString().padStart(3, '0')}`;
    
    const transactionData = {
      ...req.body,
      id: transactionId,
      date: new Date()
    };
    
    const transaction = new Transaction(transactionData);
    await transaction.save();
    
    // Update product sales
    for (const item of transactionData.items) {
      await Product.updateOne(
        { id: item.id },
        { $inc: { sales: item.quantity } }
      );
    }
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error saving transaction:', error);
    res.status(500).json({ error: 'Gagal menyimpan transaksi' });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const totalSales = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    
    const transactionCount = await Transaction.countDocuments();
    
    const totalProductsSold = await Product.aggregate([
      { $group: { _id: null, total: { $sum: "$sales" } } }
    ]);
    
    const topProduct = await Product.findOne()
      .sort({ sales: -1 })
      .select('name');
    
    res.json({
      totalSales: totalSales[0]?.total || 0,
      transactionCount,
      totalProductsSold: totalProductsSold[0]?.total || 0,
      topProduct: topProduct?.name || '-'
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({ error: 'Gagal mengambil data dashboard' });
  }
});

app.get('/api/transactions/recent', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ date: -1 })
      .limit(5);
    res.json(transactions);
  } catch (error) {
    console.error('Error getting recent transactions:', error);
    res.status(500).json({ error: 'Gagal mengambil transaksi terakhir' });
  }
});

app.post('/api/products/init', async (req, res) => {
  try {
    await Product.deleteMany({});
    const products = req.body;
    const inserted = await Product.insertMany(products);
    res.json({ message: 'Products initialized', count: inserted.length });
  } catch (error) {
    console.error('Error initializing products:', error);
    res.status(500).json({ error: 'Gagal menginisialisasi produk' });
  }
});

// Semua request lainnya ke index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
