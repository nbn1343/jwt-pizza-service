const mysql = require('mysql2/promise');
const { DB } = require('../../src/database/database');
const bcrypt = require('bcrypt');
const Role = { Franchisee: 'franchisee' };
global.Role = Role;


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
    });

    test('should add user with franchisee role', async () => {
      const newUser = {
        name: 'Franchise Owner',
        email: 'owner@franchise.com',
        password: 'password123',
        roles: [{ role: Role.Franchisee, object: 'Franchise Name' }]
      };
    
      const franchiseId = 5;
    
      mockConnection.execute
        .mockResolvedValueOnce([{ insertId: 2 }])  // User insertion
        .mockResolvedValueOnce([[{ id: franchiseId }]])  // getID query
        .mockResolvedValueOnce([{ insertId: 3 }]);  // userRole insertion
    
      DB.getID = jest.fn().mockResolvedValue(franchiseId);
    
      const result = await DB.addUser(newUser);
    
      expect(result.id).toBe(2);
      expect(result.name).toBe(newUser.name);
      expect(result.password).toBeUndefined();
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        'INSERT INTO user (name, email, password) VALUES (?, ?, ?)',
        [newUser.name, newUser.email, expect.any(String)]
      );
      expect(DB.getID).toHaveBeenCalledWith(mockConnection, 'name', 'Franchise Name', 'franchise');

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
  
    test('should throw error if insertion fails', async () => {
      const userId = 1;
      const token = 'someRandomToken';
  
      DB.getTokenSignature = jest.fn().mockReturnValue('signedToken');
  
      const mockConnection = {
        execute: jest.fn().mockRejectedValue(new Error('Insertion failed')),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
  
      await expect(DB.loginUser(userId, token)).rejects.toThrow('Insertion failed');
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe('loginUser', () => {
    test('should insert token and userId into auth table', async () => {
      const userId = 1;
      const token = 'someRandomToken1';
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
  });
  
  describe('updateUser', () => {
    test('should update user information', async () => {
      const userId = 1;
      const newEmail = 'newemail@example.com';
      const newPassword = 'newPassword';
      const oldPassword = 'oldPassword';
  
      const mockConnection = {
        execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      DB.getUser = jest.fn().mockResolvedValue({ id: userId, email: newEmail });
      DB.loginUser = jest.fn().mockResolvedValue(true);
      bcrypt.hash = jest.fn().mockResolvedValue('hashedPassword');
  
      const updatedUser = await DB.updateUser(userId, newEmail, newPassword, oldPassword);

      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      expect(DB.getUser).toHaveBeenCalledWith(newEmail, newPassword);
      expect(updatedUser).toEqual({ id: userId, email: newEmail });
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
        { id: 1, franchiseId: 101, storeId: 201, date: '2025-01-01' },
        { id: 2, franchiseId: 102, storeId: 202, date: '2025-01-01' }
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
    });
  });

  describe('createFranchise', () => {
    let mockConnection;
    const Role = { Franchisee: 'franchisee' };
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      global.Role = Role;
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should create franchise with admins successfully', async () => {
      const franchise = {
        name: 'Test Franchise',
        admins: [
          { email: 'admin1@test.com' },
          { email: 'admin2@test.com' }
        ]
      };
  
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1, name: 'Admin 1' }]])
        .mockResolvedValueOnce([[{ id: 2, name: 'Admin 2' }]])
        .mockResolvedValueOnce([{ insertId: 101 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
  
      const result = await DB.createFranchise(franchise);
  
      expect(result).toEqual({
        id: 101,
        name: 'Test Franchise',
        admins: [
          { email: 'admin1@test.com', id: 1, name: 'Admin 1' },
          { email: 'admin2@test.com', id: 2, name: 'Admin 2' }
        ]
      });
  
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        'SELECT id, name FROM user WHERE email=?',
        ['admin1@test.com']
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        2,
        'SELECT id, name FROM user WHERE email=?',
        ['admin2@test.com']
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        3,
        'INSERT INTO franchise (name) VALUES (?)',
        ['Test Franchise']
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        4,
        'INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)',
        [1, Role.Franchisee, 101]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        5,
        'INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)',
        [2, Role.Franchisee, 101]
      );
  
    });
  
  });
  
  describe('deleteFranchise', () => {
    let mockConnection;
    const franchiseId = 1;
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should delete franchise successfully', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([]) 
        .mockResolvedValueOnce([]) 
        .mockResolvedValueOnce([]); 
  
      await DB.deleteFranchise(franchiseId);
  
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        'DELETE FROM store WHERE franchiseId=?',
        [franchiseId]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM userRole WHERE objectId=?',
        [franchiseId]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        3,
        'DELETE FROM franchise WHERE id=?',
        [franchiseId]
      );
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.rollback).not.toHaveBeenCalled();
      expect(mockConnection.end).toHaveBeenCalled();
    });
  
    test('should rollback and throw error if deletion fails', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Database error'));
  
      await expect(DB.deleteFranchise(franchiseId)).rejects.toThrow('unable to delete franchise');
  
    });
  });

  describe('getFranchise', () => {
    let mockConnection;
    const franchiseId = 1;
    const franchiseName = 'Test Franchise';
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should return a single franchise with admins and stores', async () => {
      const franchise = { id: franchiseId, name: franchiseName };
      const admins = [
        { id: 1, name: 'Admin 1', email: 'admin1@test.com' },
        { id: 2, name: 'Admin 2', email: 'admin2@test.com' }
      ];
      const stores = [
        { id: 101, name: 'Store 1', totalRevenue: '1000.00' },
        { id: 102, name: 'Store 2', totalRevenue: '2000.00' }
      ];
  
      mockConnection.execute
        .mockResolvedValueOnce([admins])
        .mockResolvedValueOnce([stores]);
  
      const result = await DB.getFranchise(franchise);
  
      expect(result).toEqual({
        id: franchiseId,
        name: franchiseName,
        admins,
        stores
      });
  
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        "SELECT u.id, u.name, u.email FROM userRole AS ur JOIN user AS u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee'",
        [franchiseId]
      );
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        2,
        "SELECT s.id, s.name, COALESCE(SUM(oi.price), 0) AS totalRevenue FROM dinerOrder AS do JOIN orderItem AS oi ON do.id=oi.orderId RIGHT JOIN store AS s ON s.id=do.storeId WHERE s.franchiseId=? GROUP BY s.id",
        [franchiseId]
      );
    });
  });

  describe('getFranchises', () => {
    let mockConnection;
    const Role = { Admin: 'admin' };
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      DB.getFranchise = jest.fn();
      global.Role = Role;
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should return franchises with stores for non-admin users', async () => {
      const authUser = { isRole: jest.fn().mockReturnValue(false) };
      const franchises = [
        { id: 1, name: 'Franchise 1' },
        { id: 2, name: 'Franchise 2' }
      ];
      const stores1 = [{ id: 101, name: 'Store 1' }];
      const stores2 = [{ id: 102, name: 'Store 2' }];
  
      mockConnection.execute
        .mockResolvedValueOnce([franchises])
        .mockResolvedValueOnce([stores1])
        .mockResolvedValueOnce([stores2]);
  
      const result = await DB.getFranchises(authUser);
  
      expect(result).toEqual([
        { id: 1, name: 'Franchise 1', stores: stores1 },
        { id: 2, name: 'Franchise 2', stores: stores2 }
      ]);
    });
  });
  

  describe('getUserFranchises', () => {
    let mockConnection;
    const userId = 1;
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
      DB.getFranchise = jest.fn();
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should return empty array when user has no franchises', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);
  
      const result = await DB.getUserFranchises(userId);
  
      expect(result).toEqual([]);
      expect(mockConnection.execute).toHaveBeenCalledWith(
        "SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?",
        [userId]
      );
    });
  
    test('should return franchises with details when user has franchises', async () => {
      const franchiseIds = [{ objectId: 1 }, { objectId: 2 }];
      const franchises = [
        { id: 1, name: 'Franchise 1' },
        { id: 2, name: 'Franchise 2' }
      ];
  
      mockConnection.execute
        .mockResolvedValueOnce([franchiseIds])
        .mockResolvedValueOnce([franchises]);
  
      DB.getFranchise.mockImplementation(async (franchise) => {
        franchise.details = `Details for ${franchise.name}`;
        return franchise;
      });
  
      const result = await DB.getUserFranchises(userId);
  
      expect(result).toEqual([
        { id: 1, name: 'Franchise 1', details: 'Details for Franchise 1' },
        { id: 2, name: 'Franchise 2', details: 'Details for Franchise 2' }
      ]);
      expect(mockConnection.execute).toHaveBeenNthCalledWith(
        1,
        "SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?",
        [userId]
      );
    });
  });

  
  

  describe('createStore', () => {
    let mockConnection;
    const franchiseId = 1;
    const store = { name: 'New Store' };
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should create a store successfully', async () => {
      const insertId = 101;
      mockConnection.execute.mockResolvedValueOnce([{ insertId }]);
  
      const result = await DB.createStore(franchiseId, store);
  
      expect(result).toEqual({
        id: insertId,
        franchiseId,
        name: store.name
      });
  
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'INSERT INTO store (franchiseId, name) VALUES (?, ?)',
        [franchiseId, store.name]
      );    
    }); 
  });

  describe('deleteStore', () => {
    let mockConnection;
    const franchiseId = 1;
    const storeId = 101;
  
    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        end: jest.fn()
      };
      DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    test('should delete a store successfully', async () => {
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
  
      await DB.deleteStore(franchiseId, storeId);
  
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'DELETE FROM store WHERE franchiseId=? AND id=?',
        [franchiseId, storeId]
      );
    });  
  });

  describe('getTokenSignature', () => {
    test('should return the signature part of a JWT token', () => {
      const token = 'header.payload.signature';
      const result = DB.getTokenSignature(token);
      expect(result).toBe('signed_header.payload.signature');
    });
  
    test('should return an empty string for invalid token format', () => {
      const token = 'invalid.token';
      const result = DB.getTokenSignature(token);
      expect(result).toBe('signed_invalid.token');
    });
  
    test('should return an empty string for empty token', () => {
      const token = '';
      const result = DB.getTokenSignature(token);
      expect(result).toBe('signed_');
    });
  });

});

  
  
