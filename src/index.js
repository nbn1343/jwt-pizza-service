const express = require('express');
const app = require('./service.js');
const metrics = require('./metrics');
const { logger, errorHandlerMiddleware } = require('./logger');
const config = require('./config.js');
const fetch = require('node-fetch');

app.use((req, res, next) => {
  req.requestId = Date.now().toString();
  next();
});

app.use(express.json());
app.use(metrics.requestTracker);
app.use(logger.httpLogger);

app.use((req, res, next) => {
  req.ip = req.ip || 
    req.connection.remoteAddress || 
    req.socket.remoteAddress || 
    (req.connection.socket ? req.connection.socket.remoteAddress : null);
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to JWT Pizza' });
});

app.put('/api/auth', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    let factoryResponse, factoryResponseBody;
    try {
      factoryResponse = await fetch(`${config.factory.url}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.factory.apiKey}`
        },
        body: JSON.stringify({ email })
      });

      factoryResponseBody = await factoryResponse.json();
      
      logger.factoryLogger(
        'POST', 
        `${config.factory.url}/validate`, 
        { email }, 
        factoryResponseBody, 
        factoryResponse.status,
        true // authenticated
      );
    } catch (factoryErr) {
      logger.factoryLogger(
        'POST', 
        `${config.factory.url}/validate`, 
        { email: req.body.email }, 
        { error: factoryErr.message }, 
        500,
        false 
      );
    }
    
    if ((email === "d@jwt.com" && password === "diner") || 
        (email === "f@jwt.com" && password === "franchisee")) {
      metrics.trackAuthentication(true);
      
      const token = `token_for_${email}`;
      res.json({ success: true, token });
    } else {
      metrics.trackAuthentication(false);
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    next(err);
  }
});

app.delete('/api/auth', (req, res) => {
  logger.dbLogger(
    'LOGOUT', 
    {}, 
    'pizza-service.bytessl.click/logout', 
    'DELETE'
  );
  
  res.json({ success: true, message: 'Logout successful' });
});

app.get('/api/order/menu', (req, res, next) => {
  try {
    const menuQuery = 'SELECT * FROM menu_items WHERE active = true';
    const menuItems = [
      { id: 1, name: 'Veggie', price: 0.05 },
      { id: 2, name: 'Pepperoni', price: 0.06 },
      { id: 3, name: 'Margherita', price: 0.04 }
    ];

    logger.dbLogger(
      menuQuery, 
      null, 
      'pizza-service.bytessl.click/menu', 
      'SELECT'
    );

    res.json({
      menu: menuItems
    });
  } catch (err) {
    logger.dbLogger(
      'SELECT * FROM menu_items', 
      null, 
      'pizza-service.bytessl.click/menu', 
      'SELECT', 
      false
    );
    next(err);
  }
});

app.post('/api/order', (req, res, next) => {
  try {
    const startTime = Date.now();
    
    const items = req.body.items || [];
    const quantity = items.length;
    const revenue = items.reduce((total, item) => total + (parseFloat(item.price) || 0), 0);
    
    const insertQuery = 'INSERT INTO orders (quantity, revenue) VALUES (?, ?)';
    const queryParams = [quantity, revenue];
    
    logger.dbLogger(
      insertQuery, 
      queryParams, 
      'pizza-service.bytessl.click/order', 
      'INSERT'
    );
    
    const orderId = Math.floor(Math.random() * 1000);
    
    const latency = Date.now() - startTime;
    
    metrics.trackPurchase(quantity, revenue, true, latency);
    
    res.json({ 
      success: true, 
      orderId,
      message: `Successfully ordered ${quantity} pizza(s)` 
    });
  } catch (err) {
    logger.dbLogger(
      'INSERT INTO orders', 
      null, 
      'pizza-service.bytessl.click/order', 
      'INSERT', 
      false
    );
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ msg: 'Not Found' });
});

app.use(errorHandlerMiddleware);

const port = process.argv[2] || 3001;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});