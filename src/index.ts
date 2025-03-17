import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import router from './routes/index';
import { SupabaseConnection } from './utils/supabase';
dotenv.config();

const app = express();
const port = process.env.PORT || 1001;
const corsOptions = {
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'FETCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.raw());

// Create temp-pdfs directory if it doesn't exist
const tempPdfsDir = path.join(__dirname, '..', 'temp-pdfs');
if (!fs.existsSync(tempPdfsDir)) {
  fs.mkdirSync(tempPdfsDir, { recursive: true });
}

// Serve static files from temp-pdfs directory
app.use('/temp-pdfs', express.static(tempPdfsDir));

app.use('/api/v1', router);

SupabaseConnection();

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});