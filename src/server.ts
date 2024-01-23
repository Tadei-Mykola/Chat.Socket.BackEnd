import * as http from 'http';
import { Server, Socket } from 'socket.io';
import { Pool } from 'pg';
import { dbConnect } from './environment';

const express = require('express');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

interface MySocket extends Socket {
  userId?: string;
}

const pool = new Pool({
  user: dbConnect.user,
  host: dbConnect.host,
  database: dbConnect.database,
  password: dbConnect.password,
  port: dbConnect.port
});

app.get('/users/user', async (req, res) => {
  try {
    let phone = req.query.phone;
    phone = '+38' + phone;
    const users = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    res.json(users.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/chat/addChat', async (req, res) => {
  try {
    const { iduser, idusertwo, nameusertwo, nameuser } = req.body;

    const existingChat = await pool.query('SELECT * FROM chatList WHERE (iduser = $1 AND idusertwo = $2) OR (iduser = $2 AND idusertwo = $1)', [iduser, idusertwo]);

    if (existingChat.rows.length > 0) {
      res.status(400).send('Chat already exists');
      return;
    }

    const result = await pool.query('INSERT INTO chatList(iduser, idusertwo, nameusertwo) VALUES($1, $2, $3) RETURNING *', [iduser, idusertwo, nameusertwo]);
    const result2 = await pool.query('INSERT INTO chatList(iduser, idusertwo, nameusertwo) VALUES($1, $2, $3) RETURNING *', [idusertwo, iduser, nameuser]);
    
    if (result.rows.length > 0) {
      const createdChat = result.rows[0];
      res.status(201).json(createdChat);
    } else {
      res.status(500).send('Failed to create chat');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/chat/messages', async (req, res) => {
  try {
    const iduser = req.query.iduser;
    const idusertwo = req.query.idusertwo;

    if (!iduser || !idusertwo) {
      res.status(400).send('chatId is required');
      return;
    }

    const messages = await pool.query('SELECT * FROM messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) ORDER BY timestamp', [iduser, idusertwo]);

    res.json(messages.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/chat/list', async (req, res) => {
  try {
    const iduser = req.query.iduser;

    if (!iduser) {
      res.status(400).send('iduser is required');
      return;
    }

    const chatList = await pool.query('SELECT * FROM chatList WHERE iduser = $1', [iduser]);

    res.json(chatList.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/users/registration', async (req, res) => {
  try {
    const newUser = req.body;
    if (!newUser.userName || !newUser.password || !newUser.phone) {
      res.status(400).send('data is required');
      return;
    }

    const result = await pool.query('INSERT INTO users(userName, password, phone) VALUES($1, $2, $3) RETURNING *', [newUser.userName, newUser.password, newUser.phone]);

    if (result.rows.length > 0) {
      const createdUser = result.rows[0];
      res.status(201).json(createdUser);
    } else {
      res.status(500).send('Failed to retrieve user data after registration');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/users/login', async (req, res) => {
  try {
    const user = req.body;
    if (!user.password || !user.phone) {
      res.status(400).send('data is required');
      return;
    }

    const result = await pool.query('SELECT * FROM users WHERE password = $1 AND phone = $2', [user.password, user.phone]);

    if (result.rows.length > 0) {
      const authenticatedUser = result.rows[0];
      res.status(200).json(authenticatedUser);
    } else {
      res.status(401).send('Authentication failed');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});


const userSockets = new Map<string, Socket>();

io.on('connection', (socket: MySocket) => {
  console.log('User connected');

  socket.on('setUserId', (userId) => {
    console.log(userId)
    userSockets.set(userId, socket);
  });

  socket.on('message', (data) => {
    console.log('Received message:', data);

    const receiverSocket = userSockets.get(data.idusertwo);
    const { iduser, idusertwo, content } = data;

    const result = pool.query('INSERT INTO messages(sender_id, receiver_id, content) VALUES($1, $2, $3) RETURNING *', [iduser, idusertwo, content]);

    if (receiverSocket) {
      receiverSocket.emit('message', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    for (const [key, value] of userSockets.entries()) {
      if (value === socket) {
        userSockets.delete(key);
      }
    }
  });
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
