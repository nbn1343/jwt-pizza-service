const os = require('os');
const config = require('./config');

class Metrics {
  constructor() {
    this.httpMetrics = {
      totalRequests: 0,
      getRequests: 0,
      postRequests: 0,
      putRequests: 0,
      deleteRequests: 0,
      activeUsers: new Set(),
      activeUserTimers: new Map() 
    };

    this.authMetrics = {
      successfulAttempts: 0,
      failedAttempts: 0,
    };

    this.purchaseMetrics = {
      pizzasSold: 0,
      creationFailures: 0,
      revenue: 0,
    };

    this.latencyMetrics = {
      requestLatency: {
        sum: 0,
        count: 0,
        average: 0
      },
      pizzaCreationLatency: {
        sum: 0,
        count: 0,
        average: 0
      }
    };

    this.sendMetricsPeriodically(5000); 
  }

  requestTracker = (req, res, next) => {
    const startTime = Date.now();
    
    this.httpMetrics.totalRequests++;
    
    switch (req.method) {
      case 'GET':
        this.httpMetrics.getRequests++;
        break;
      case 'POST':
        this.httpMetrics.postRequests++;
        break;
      case 'PUT':
        this.httpMetrics.putRequests++;
        break;
      case 'DELETE':
        this.httpMetrics.deleteRequests++;
        break;
    }

    let userId = null;
    if (req.headers.authorization) {
        const userId = req.headers.authorization.split(' ')[1]; // Use the token itself as ID
        this.httpMetrics.activeUsers.add(userId);
        
        if (this.httpMetrics.activeUserTimers.has(userId)) {
          clearTimeout(this.httpMetrics.activeUserTimers.get(userId));
        }
        
        const timer = setTimeout(() => {
          this.httpMetrics.activeUsers.delete(userId);
          this.httpMetrics.activeUserTimers.delete(userId);
        }, 60000);
        
        this.httpMetrics.activeUserTimers.set(userId, timer);
      }

    if (userId) {
      this.httpMetrics.activeUsers.add(userId);
      
      if (this.httpMetrics.activeUserTimers.has(userId)) {
        clearTimeout(this.httpMetrics.activeUserTimers.get(userId));
      }
      
      const timer = setTimeout(() => {
        this.httpMetrics.activeUsers.delete(userId);
        this.httpMetrics.activeUserTimers.delete(userId);
      }, 60000);
      
      this.httpMetrics.activeUserTimers.set(userId, timer);
    }

    if (req.method === 'POST' && req.path === '/api/order') {
      const originalSend = res.send;
      res.send = function(body) {
        try {
          const data = JSON.parse(body);
          if (data && data.success) {
            const items = req.body.items || [];
            const quantity = items.length;
            const revenue = items.reduce((total, item) => total + (item.price || 0), 0);
            const latency = Date.now() - startTime;
            
            metrics.trackPurchase(quantity, revenue, true, latency);
          }
        } catch (e) {
        }
        return originalSend.apply(this, arguments);
      };
    }

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      this.latencyMetrics.requestLatency.sum += duration;
      this.latencyMetrics.requestLatency.count++;
      this.latencyMetrics.requestLatency.average = 
        this.latencyMetrics.requestLatency.sum / this.latencyMetrics.requestLatency.count;
    });

    next();
  };

  trackAuthentication(success) {
    if (success) {
      this.authMetrics.successfulAttempts++;
    } else {
      this.authMetrics.failedAttempts++;
    }
  }

  trackPurchase(quantity, price, success, latency) {
    if (success) {
      this.purchaseMetrics.pizzasSold += quantity;
      this.purchaseMetrics.revenue += price;
    } else {
      this.purchaseMetrics.creationFailures += quantity;
    }
    
    this.latencyMetrics.pizzaCreationLatency.sum += latency;
    this.latencyMetrics.pizzaCreationLatency.count++;
    this.latencyMetrics.pizzaCreationLatency.average = 
      this.latencyMetrics.pizzaCreationLatency.sum / this.latencyMetrics.pizzaCreationLatency.count;
  }

  getSystemMetrics() {
    return {
      cpuUsage: this.getCpuUsagePercentage(),
      memoryUsage: this.getMemoryUsagePercentage()
    };
  }

  getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return parseFloat((cpuUsage * 100).toFixed(2));
  }

  getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    return parseFloat(memoryUsage.toFixed(2));
  }

  sendMetricsPeriodically(period) {
    setInterval(() => {
      try {
        console.log('Current metrics state:', {
          activeUsers: this.httpMetrics.activeUsers.size,
          pizzasSold: this.purchaseMetrics.pizzasSold,
          revenue: this.purchaseMetrics.revenue,
          authSuccess: this.authMetrics.successfulAttempts,
          authFailed: this.authMetrics.failedAttempts
        });
        
        this.sendMetricToGrafana('http_requests_total', this.httpMetrics.totalRequests, 'sum', '1');
        this.sendMetricToGrafana('http_requests_get', this.httpMetrics.getRequests, 'sum', '1');
        this.sendMetricToGrafana('http_requests_post', this.httpMetrics.postRequests, 'sum', '1');
        this.sendMetricToGrafana('http_requests_put', this.httpMetrics.putRequests, 'sum', '1');
        this.sendMetricToGrafana('http_requests_delete', this.httpMetrics.deleteRequests, 'sum', '1');
        this.sendMetricToGrafana('active_users', this.httpMetrics.activeUsers.size, 'gauge', 'users');
        
        this.sendMetricToGrafana('auth_successful', this.authMetrics.successfulAttempts, 'sum', '1');
        this.sendMetricToGrafana('auth_failed', this.authMetrics.failedAttempts, 'sum', '1');
        
        const systemMetrics = this.getSystemMetrics();
        this.sendMetricToGrafana('cpu_usage_percent', systemMetrics.cpuUsage, 'gauge', '%');
        this.sendMetricToGrafana('memory_usage_percent', systemMetrics.memoryUsage, 'gauge', '%');
        
        this.sendMetricToGrafana('pizzas_sold', this.purchaseMetrics.pizzasSold, 'sum', 'pizzas');
        this.sendMetricToGrafana('pizza_creation_failures', this.purchaseMetrics.creationFailures, 'sum', 'failures');
        this.sendMetricToGrafana('pizza_revenue', this.purchaseMetrics.revenue, 'sum', 'dollars');
        
        this.sendMetricToGrafana('request_latency', this.latencyMetrics.requestLatency.average, 'gauge', 'ms');
        this.sendMetricToGrafana('pizza_creation_latency', this.latencyMetrics.pizzaCreationLatency.average, 'gauge', 'ms');
        
        console.log('Metrics reported to Grafana');
      } catch (error) {
        console.error('Error sending metrics', error);
      }
    }, period);
  }

  sendMetricToGrafana(metricName, metricValue, type, unit) {
    const dataPoint = {
      timeUnixNano: Date.now() * 1000000
    };
    
    if (metricName.includes('revenue') || metricName.includes('latency') || metricName.includes('percent')) {
      dataPoint.asDouble = parseFloat(metricValue);
    } else {
      dataPoint.asInt = Math.floor(metricValue);
    }
    
    const metric = {
      resourceMetrics: [{
        scopeMetrics: [{
          metrics: [{
            name: metricName,
            unit: unit,
            [type]: {
              dataPoints: [dataPoint],
            },
          }],
        }],
      }],
    };

    if (type === 'sum') {
      metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
      metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
    }

    const body = JSON.stringify(metric);
    fetch(`${config.metrics.url}`, {
      method: 'POST',
      body: body,
      headers: { Authorization: `Bearer ${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
    })
      .then((response) => {
        if (!response.ok) {
          response.text().then((text) => {
            console.error(`Failed to push metrics data to Grafana: ${text}\n${body}`);
          });
        } else {
          console.log(`Pushed ${metricName}: ${metricValue}`);
        }
      })
      .catch((error) => {
        console.error('Error pushing metrics:', error);
      });
  }
}

const metrics = new Metrics();
module.exports = metrics;
