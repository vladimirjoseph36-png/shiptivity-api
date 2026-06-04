const express = require('express');
const Database = require('better-sqlite3');

const app = express();

// Middleware JSON
app.use(express.json());

// ROOT
app.get('/', (req, res) => {
  return res.status(200).send({
    message: 'SHIPTIVITY API. Read documentation to see API docs'
  });
});

// DB
const db = new Database('./clients.db');

// close DB safely
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

// VALIDATION ID
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

// PUT
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { valid, messageObj } = validateId(id);
  if (!valid) return res.status(400).send(messageObj);

  const client = db.prepare(
    'SELECT * FROM clients WHERE id = ?'
  ).get(id);

  let { status, priority } = req.body;

  status = status || client.status;

  let clients = db.prepare(
    'SELECT * FROM clients WHERE status = ? ORDER BY priority'
  ).all(status);

  clients = clients.filter(c => c.id !== id);

  if (!priority || priority < 1) {
    priority = clients.length + 1;
  }

  clients.splice(priority - 1, 0, {
    ...client,
    status,
    priority
  });

  clients = clients.map((c, index) => ({
    ...c,
    priority: index + 1
  }));

  const update = db.prepare(`
    UPDATE clients
    SET status = ?, priority = ?
    WHERE id = ?
  `);

  for (const c of clients) {
    update.run(c.status, c.priority, c.id);
  }

  const allClients = db.prepare(
    'SELECT * FROM clients ORDER BY status, priority'
  ).all();

  return res.status(200).send(allClients);
});

// CREATE (POST)
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
    priority ?? 1
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