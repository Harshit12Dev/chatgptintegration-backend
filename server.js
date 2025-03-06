import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import OpenAI from 'openai';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://192.168.1.230:5173'], // Frontend URL
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Ensure OpenAI API Key is set
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

// OpenAI API setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MySQL Database Connection
let db;
try {
  db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mind',
    database: 'chatgpt_db',
  });
  console.log('✅ Connected to MySQL Database');
} catch (err) {
  console.error('❌ Database connection error:', err.message);
  process.exit(1);
}

// WebSocket connection
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Handle text-based chat
  socket.on('sendMessage', async (data) => {
    const { message, userId } = data;

    try {
      // Generate ChatGPT response
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: message }],
      });

      const botReply = response.choices[0].message.content;

      // Ensure message and botReply are not undefined
      await db.execute(
        'INSERT INTO messages (user_id, message, response, image_url) VALUES (?, ?, ?, ?)',
        [userId, message || null, botReply || null, null] // Set image_url as NULL
      );

      io.emit('receiveMessage', { message, botReply });
    } catch (err) {
      console.error('❌ OpenAI API Error:', err.message);
      socket.emit('errorMessage', { error: 'Failed to generate response' });
    }
  });

  // Handle image generation request
  socket.on('generateImage', async (data) => {
    console.log('data: ', data);
    const { prompt, userId } = data;
    console.log('userId: ', userId);

    try {
      // Generate an image using OpenAI's DALL·E model
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1, // Generate 1 image
        size: '1024x1024', // Image resolution
      });

      // Ensure the image URL is properly defined
      const imageUrl = response.data?.[0]?.url ?? null; // Use '??' to ensure null instead of undefined

      // Ensure no undefined values are passed
      // await db.execute(
      //   'INSERT INTO messages (user_id, message, response, image_url) VALUES (?, ?, ?, ?)',
      //   [userId ?? null, prompt ?? null, null, imageUrl] // Ensure all values are null-safe
      // );

      io.emit('imageGenerated', { prompt, imageUrl });
    } catch (err) {
      console.error('❌ OpenAI Image API Error:', err.message);
      socket.emit('errorMessage', { error: 'Failed to generate image' });
    }
  });

  socket.on('disconnect', () =>
    console.log('❌ User disconnected:', socket.id)
  );
});

server.listen(5000, () => console.log('🚀 Server running on port 5000'));
