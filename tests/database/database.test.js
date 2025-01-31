// __tests__/database/database.test.js
const mysql = require('mysql2/promise');
const { DB } = require('../../src/database/database');
const config = require('../../src/config');
const bcrypt = require('bcrypt');


jest.mock('mysql2/promise');

describe('Database', () => {
  let mockConnection;

  beforeEach(() => {
    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      end: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    };

    mysql.createConnection.mockResolvedValue(mockConnection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMenu', () => {
    test('should return menu items', async () => {
      const menuItems = [
        { id: 1, name: 'Pizza', price: 10.99 },
        { id: 2, name: 'Burger', price: 8.99 },
      ];

      mockConnection.execute.mockResolvedValue([menuItems]);

      const result = await DB.getMenu();

      expect(result).toEqual(menuItems);
    });
  });

  describe('addMenuItem', () => {
    test('should add menu item', async () => {
      const newItem = {
        title: 'Margherita Pizza',
        description: 'Classic Italian pizza',
        image: 'pizza.jpg',
        price: 10.99
      };
  
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 1 }]);
  
      const result = await DB.addMenuItem(newItem);
  
      expect(result).toEqual({
        ...newItem,
        id: 1
      });
      
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)',
        [newItem.title, newItem.description, newItem.image, newItem.price]
      );
    });
  });

  describe('addUser', () => {
    test('should add user with correct roles', async () => {
      const newUser = {
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        roles: [{ role: 'diner' }]
      };

      mockConnection.execute
        .mockResolvedValueOnce([{ insertId: 1 }]) 
        .mockResolvedValueOnce([{ insertId: 1 }]); 

      const result = await DB.addUser(newUser);

      expect(result.id).toBe(1);
      expect(result.name).toBe(newUser.name);
      expect(result.password).toBeUndefined();
      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUser', () => {
    test('should return user with roles', async () => {
      const userId = 1;
      const user = {
        id: userId,
        name: 'Test User',
        email: 'test@test.com',
        password: 'hashedpassword'
      };
  
      mockConnection.execute
        .mockResolvedValueOnce([[user]]) 
        .mockResolvedValueOnce([[{ userId: 1, role: 'diner' }]]); 
  
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
  
      const result = await DB.getUser(user.email, 'password');
  
      expect(result).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        roles: [{ role: 'diner', objectId: undefined }],
        password: undefined
      });
  
      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        'SELECT * FROM user WHERE email=?',
        [user.email]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        2,
        'SELECT * FROM userRole WHERE userId=?',
        [user.id]
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashedpassword');
    });
  });

  describe('loginUser', () => {
    test('should insert token and userId into auth table', async () => {
      const userId = 1;
      const token = 'someRandomToken';
      const tokenSignature = 'signedToken';
  
      DB.getTokenSignature = jest.fn().mockReturnValue(tokenSignature);
  
      const mockConnection = {
        execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
  
      await DB.loginUser(userId, token);
  
      expect(DB.getTokenSignature).toHaveBeenCalledWith(token);
  
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'INSERT INTO auth (token, userId) VALUES (?, ?)',
        [tokenSignature, userId]
      );
  
    });
  
    test('should close connection even if query throws an error', async () => {
      const userId = 1;
      const token = 'someRandomToken';
  
      DB.getTokenSignature = jest.fn().mockReturnValue('signedToken');
  
      const mockConnection = {
        execute: jest.fn().mockRejectedValue(new Error('Database error')),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
  
      await expect(DB.loginUser(userId, token)).rejects.toThrow('Database error');
      });
  });

  describe('isLoggedIn', () => {
    let mockConnection;
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      DB.getTokenSignature = jest.fn(token => `signed_${token}`);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should return true when user is logged in', async () => {
      const token = 'validToken';
      mockConnection.execute.mockResolvedValueOnce([[{ userId: 1 }]]);
  
      const result = await DB.isLoggedIn(token);
  
      expect(result).toBe(true);
      expect(DB.getTokenSignature).toHaveBeenCalledWith(token);
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'SELECT userId FROM auth WHERE token=?',
        ['signed_validToken']
      );
      expect(mockConnection.end).toHaveBeenCalled();
    });
  
    test('should return false when user is not logged in', async () => {
      const token = 'invalidToken';
      mockConnection.execute.mockResolvedValueOnce([[]]);
  
      const result = await DB.isLoggedIn(token);
  
      expect(result).toBe(false);
      expect(DB.getTokenSignature).toHaveBeenCalledWith(token);
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'SELECT userId FROM auth WHERE token=?',
        ['signed_invalidToken']
      );
    });
  
    test('should close connection even if query throws an error', async () => {
      const token = 'errorToken';
      mockConnection.execute.mockRejectedValueOnce(new Error('Database error'));
  
      await expect(DB.isLoggedIn(token)).rejects.toThrow('Database error');
    });
  });

  describe('logoutUser', () => {
    let mockConnection;
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      DB.getTokenSignature = jest.fn(token => `signed_${token}`);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should delete auth record for the given token', async () => {
      const token = 'validToken';
  
      await DB.logoutUser(token);
  
      expect(DB.getTokenSignature).toHaveBeenCalledWith(token);
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'DELETE FROM auth WHERE token=?',
        ['signed_validToken']
      );
    });
  
    test('should close connection even if query throws an error', async () => {
      const token = 'errorToken';
      mockConnection.execute.mockRejectedValueOnce(new Error('Database error'));
  
      await expect(DB.logoutUser(token)).rejects.toThrow('Database error');
      expect(mockConnection.end).toHaveBeenCalled();
    });
  
    test('should not throw error if no auth record is deleted', async () => {
      const token = 'nonExistentToken';
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
  
      await expect(DB.logoutUser(token)).resolves.not.toThrow();
    });
  });

  describe('getOrders', () => {
    let mockConnection;
    const user = { id: 1 };
    const config = { db: { listPerPage: 10 } };
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      DB.getOffset = jest.fn((page, perPage) => (page - 1) * perPage);
      global.config = config;
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should fetch orders with items for a user', async () => {
      const orders = [
        { id: 1, franchiseId: 101, storeId: 201, date: '2023-05-01' },
        { id: 2, franchiseId: 102, storeId: 202, date: '2023-05-02' }
      ];
      const items1 = [
        { id: 11, menuId: 1001, description: 'Item 1', price: 10.99 },
        { id: 12, menuId: 1002, description: 'Item 2', price: 15.99 }
      ];
      const items2 = [
        { id: 21, menuId: 2001, description: 'Item 3', price: 12.99 }
      ];
  
      mockConnection.execute
        .mockResolvedValueOnce([orders])
        .mockResolvedValueOnce([items1])
        .mockResolvedValueOnce([items2]);
  
      const result = await DB.getOrders(user);
  
      expect(DB.getOffset).toHaveBeenCalledWith(1, config.db.listPerPage);
      expect(mockConnection.execute).toHaveBeenCalledTimes(3);
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        `SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT 0,${config.db.listPerPage}`,
        [user.id]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        2,
        'SELECT id, menuId, description, price FROM orderItem WHERE orderId=?',
        [1]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        3,
        'SELECT id, menuId, description, price FROM orderItem WHERE orderId=?',
        [2]
      );
  
      expect(result).toEqual({
        dinerId: user.id,
        orders: [
          { ...orders[0], items: items1 },
          { ...orders[1], items: items2 }
        ],
        page: 1
      });
  
    });
  
  });
  
  describe('addDinerOrder', () => {
    let mockConnection;
    const user = { id: 1 };
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      DB.getID = jest.fn().mockResolvedValue(1);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should insert diner order and order items', async () => {
      const order = {
        franchiseId: 101,
        storeId: 201,
        items: [
          { menuId: 1, description: 'Pizza', price: 10.99 },
          { menuId: 2, description: 'Pizza', price: 12.99 }
        ]
      };
  
      mockConnection.execute
        .mockResolvedValueOnce([{ insertId: 1 }]) 
        .mockResolvedValueOnce([]) 
        .mockResolvedValueOnce([]); 
  
      const result = await DB.addDinerOrder(user, order);
  
      expect(result).toEqual({ ...order, id: 1 });
      expect(mockConnection.execute).toHaveBeenCalledTimes(3);
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        'INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())',
        [user.id, order.franchiseId, order.storeId]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        2,
        'INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)',
        [1, 1, 'Pizza', 10.99]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        3,
        'INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)',
        [1, 1, 'Pizza', 12.99]
      );
      expect(DB.getID).toHaveBeenCalledTimes(2);
    });
  });

});

  
  
