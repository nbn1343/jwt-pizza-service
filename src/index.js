const express = require('express');
const app = express();
const metrics = require('./metrics');

app.use(express.json());

app.use(metrics.requestTracker);

app.put('/api/auth', (req, res) => {
  const { email, password } = req.body;
  
  if ((email === "d@jwt.com" && password === "diner") || 
      (email === "f@jwt.com" && password === "franchisee")) {
    metrics.trackAuthentication(true);
    
    const token = `token_for_${email}`;
    res.json({ success: true, token });
  } else {
    metrics.trackAuthentication(false);
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.delete('/api/auth', (req, res) => {
  res.json({ success: true });
});

app.get('/api/order/menu', (req, res) => {
  res.json({
    menu: [
      { id: 1, name: 'Veggie', price: 0.05 },
      { id: 2, name: 'Pepperoni', price: 0.06 },
      { id: 3, name: 'Margherita', price: 0.04 }
    ]
  });
});

app.post('/api/order', (req, res) => {
  const startTime = Date.now();
  
  const items = req.body.items || [];
  const quantity = items.length;
  const revenue = items.reduce((total, item) => total + (parseFloat(item.price) || 0), 0);
  
  const orderId = Math.floor(Math.random() * 1000);
  
  const latency = Date.now() - startTime;
  
  metrics.trackPurchase(quantity, revenue, true, latency);
  
  res.json({ 
    success: true, 
    orderId,
    message: `Successfully ordered ${quantity} pizza(s)` 
  });
});

const port = process.argv[2] || 3001;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
