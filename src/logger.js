const config = require('./config.js');
const fetch = require('node-fetch');

class Logger {
    constructor() {
        this.enabledLogTypes = {
          http: true,
          db: true,
          factory: true,
          exception: true
        };
      }
    
      httpLogger = (req, res, next) => {
        
        const logRequest = (responseBody) => {
          const logData = {
            time: new Date().toISOString(),
            level: 'info',
            type: 'http',
            auth: !!req.headers.authorization,
            method: req.method,
            status: res.statusCode,
            path: req.originalUrl,
            req: JSON.stringify(req.body || {}),
            res: JSON.stringify(responseBody || {}),
            ip: req.ip || req.connection.remoteAddress
          };
          
          this.log(logData);
        };
    
        const originalJson = res.json;
        const originalSend = res.send;
    
        res.json = function(body) {
          logRequest(body);
          return originalJson.call(this, body);
        };
    
        res.send = function(body) {
          logRequest(body);
          return originalSend.call(this, body);
        };
    
        next();
      };
  
  dbLogger = (query, params, path, method, success = true) => {
    if (!this.enabledLogTypes.db) return;

    const logData = {
      time: new Date().toISOString(),
      level: success ? 'info' : 'error',
      type: 'db',
      auth: false, // Most DB logs might not have auth context
      method: method || 'QUERY',
      status: success ? 200 : 500,
      path: path || 'unknown',
      req: JSON.stringify(params || {}),
      res: JSON.stringify({ query, success }),
      ip: '127.0.0.1' // Local database IP or server IP
    };
    
    this.log(logData);
  };
  
  factoryLogger = (method, path, requestBody, responseBody, statusCode, authenticated = false) => {
    if (!this.enabledLogTypes.factory) return;

    const logData = {
      time: new Date().toISOString(),
      level: statusCode >= 400 ? 'error' : 'info',
      type: 'factory',
      auth: authenticated,
      method: method,
      status: statusCode,
      path: path,
      req: JSON.stringify(requestBody || {}),
      res: JSON.stringify(responseBody || {}),
      ip: '127.0.0.1' // Factory service IP or server IP
    };
    
    this.log(logData);
  };
  
  errorLogger = (err, req, additionalContext = {}) => {
    if (!this.enabledLogTypes.exception) return;

    const logData = {
      time: new Date().toISOString(),
      level: 'error',
      type: 'exception',
      auth: req ? !!req.headers.authorization : false,
      method: req ? req.method : 'UNKNOWN',
      status: 500,
      path: req ? req.originalUrl : 'unknown',
      req: JSON.stringify(req?.body || {}),
      res: JSON.stringify({
        message: err.message,
        stack: err.stack,
        ...additionalContext
      }),
      ip: req ? req.ip : '127.0.0.1'
    };
    
    this.log(logData);
  };
  
  errorHandlerMiddleware = (err, req, res) => {
    this.errorLogger(err, req);
    
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred'
    });
  };
  
  log(logData) {
    const sanitizedData = this.sanitize(logData);
    console.log(`[${sanitizedData.level.toUpperCase()}] [${sanitizedData.type}]:`, sanitizedData);
    
    // Check if logging configuration exists before trying to use it
    if (config.logging && config.logging.source) {
      const labels = { 
        component: config.logging.source, 
        level: sanitizedData.level, 
        type: sanitizedData.type 
      };
      const values = [this.nowString(), JSON.stringify(sanitizedData)];
      const logEvent = { streams: [{ stream: labels, values: [values] }] };
  
      this.sendLogToGrafana(logEvent);
    } else {
      console.warn('Grafana logging is disabled: Missing configuration');
    }
  }
  
  sendLogToGrafana(event) {
    // Only attempt to send if configuration exists
    if (!config.logging || !config.logging.url || !config.logging.userId || !config.logging.apiKey) {
      console.warn('Cannot send logs to Grafana: Missing configuration');
      return;
    }
    
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: JSON.stringify(event),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana', res.status);
    }).catch(err => {
      console.error('Error sending log to Grafana:', err.message);
    });
  }
  

  nowString() {
    return (Date.now() * 1000000).toString();
  }

  sanitize(logData) {
    const dataStr = JSON.stringify(logData);
    
    let sanitized = dataStr.replace(/("password"\s*:\s*)"[^"]*"/g, '$1"*****"');
    sanitized = sanitized.replace(/("apiKey"\s*:\s*)"[^"]*"/g, '$1"*****"');
    sanitized = sanitized.replace(/(Authorization\s*:\s*Bearer\s+)[^\s"]+/g, '$1*****');
    sanitized = sanitized.replace(/(Authorization\s*:\s*)"[^"]*"/g, '$1"*****"');
    sanitized = sanitized.replace(/\b(\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?)\d{4}\b/g, '$1****');
    
    return JSON.parse(sanitized);
  }

  sendLogToGrafana(event) {
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: JSON.stringify(event),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana', res.status);
    }).catch(err => {
      console.error('Error sending log to Grafana:', err.message);
    });
  }
}

const logger = new Logger();
module.exports = { logger, errorHandlerMiddleware: logger.errorHandlerMiddleware };