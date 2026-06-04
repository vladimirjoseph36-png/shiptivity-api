const express = require('express');
const Database = require('better-sqlite3');

const app = express();

// Middleware
app.use(express.json());

// ROOT
app.get('/', (req, res) => {
  res.status(200).send({
    message: 'SHIPTIVITY API. Read documentation to see API docs'
  });
});

// DB
const db = new Database('./clients.db');

// close DB safely
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

// VALIDATE ID
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        message: 'Invalid id provided.',
        long_message: 'Id can only be integer.'
      }
    };
  }

  const client = db.prepare(
    'SELECT * FROM clients WHERE id = ? LIMIT 1'
  ).get(id);

  if (!client) {
    return {
      valid: false,
      messageObj: {
        message: 'Invalid id provided.',
        long_message: 'Cannot find client with that id.'
      }
    };
  }

  return { valid: true };
};

// GET ALL
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;

  if (status) {
    if (!['backlog', 'in-progress', 'complete'].includes(status)) {
      return res.status(400).send({
        message: 'Invalid status provided.',
        long_message: 'Status must be backlog | in-progress | complete'
      });
    }

    const clients = db.prepare(
      'SELECT * FROM clients WHERE status = ? ORDER BY priority'
    ).all(status);

    return res.status(200).send(clients);
  }

  const clients = db.prepare(
    'SELECT * FROM clients ORDER BY status, priority'
  ).all();

  return res.status(200).send(clients);
});

// GET BY ID
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { valid, messageObj } = validateId(id);
  if (!valid) return res.status(400).send(messageObj);

  const client = db.prepare(
    'SELECT * FROM clients WHERE id = ?'
  ).get(id);

  return res.status(200).send(client);
});

// PUT (UPGRADED VERSION - DRAG & DROP + PRIORITY)
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { valid, messageObj } = validateId(id);
  if (!valid) return res.status(400).send(messageObj);

  const client = db.prepare(
    'SELECT * FROM clients WHERE id = ?'
  ).get(id);

  let { status, priority } = req.body;

  const newStatus = status || client.status;
  const oldStatus = client.status;
  const oldPriority = client.priority;

  if (!['backlog', 'in-progress', 'complete'].includes(newStatus)) {
    return res.status(400).send({
      message: 'Invalid status provided.',
      long_message: 'Status must be backlog | in-progress | complete'
    });
  }

  let clients = db.prepare('SELECT * FROM clients').all();

  // SAME STATUS → reorder
  if (oldStatus === newStatus && priority && oldPriority !== priority) {
    const sameStatus = clients
      .filter(c => c.status === newStatus && c.id !== id)
      .sort((a, b) => a.priority - b.priority);

    sameStatus.splice(priority - 1, 0, {
      ...client,
      status: newStatus,
      priority
    });

    const updated = sameStatus.map((c, i) => ({
      ...c,
      priority: i + 1
    }));

    clients = clients
      .filter(c => c.status !== newStatus)
      .concat(updated);
  }

  // DIFFERENT STATUS → move card
  else if (oldStatus !== newStatus) {
    const oldList = clients
      .filter(c => c.status === oldStatus && c.id !== id)
      .sort((a, b) => a.priority - b.priority);

    const newList = clients
      .filter(c => c.status === newStatus)
      .sort((a, b) => a.priority - b.priority);

    const moved = {
      ...client,
      status: newStatus,
      priority: priority || newList.length + 1
    };

    newList.splice(moved.priority - 1, 0, moved);

    const updatedNew = newList.map((c, i) => ({
      ...c,
      priority: i + 1
    }));

    const updatedOld = oldList.map((c, i) => ({
      ...c,
      priority: i + 1
    }));

    clients = clients
      .filter(c => c.status !== oldStatus && c.status !== newStatus)
      .concat(updatedOld, updatedNew);
  }

  const update = db.prepare(`
    UPDATE clients
    SET status = ?, priority = ?
    WHERE id = ?
  `);

  clients.forEach(c => {
    update.run(c.status, c.priority, c.id);
  });

  const allClients = db.prepare(
    'SELECT * FROM clients ORDER BY status, priority'
  ).all();

  return res.status(200).send(allClients);
});

// POST (CREATE)
app.post('/api/v1/clients', (req, res) => {
  const { name, description, status, priority } = req.body;

  if (!name) {
    return res.status(400).send({
      message: "Name is required"
    });
  }

  const insert = db.prepare(`
    INSERT INTO clients (name, description, status, priority)
    VALUES (?, ?, ?, ?)
  `);

  const result = insert.run(
    name,
    description || "",
    status || "backlog",
    priority || 1
  );

  const newClient = db.prepare(
    'SELECT * FROM clients WHERE id = ?'
  ).get(result.lastInsertRowid);

  return res.status(201).send(newClient);
});

// START SERVER
app.listen(3001, () => {
  console.log('app running on port 3001');
});