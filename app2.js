const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const port = 3000;

// ✅ CORS Configuration
const corsOptions = {
  origin: 'http://127.0.0.1:5500', // Frontend origin
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
};

// ✅ Apply Middleware
app.use(helmet());
app.use(cors(corsOptions)); // Apply CORS once
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create Books Table (if not exists)
db.run(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    author TEXT NOT NULL,
    subject TEXT NOT NULL,
    publisher TEXT NOT NULL,
    publishedYear INTEGER NOT NULL,
    availableCopies INTEGER NOT NULL
  )
`, function(err) {
  if (err) {
    console.error('Failed to create table:', err.message);
  } else {
    console.log('Books table is ready.');
  }
});

// Endpoint to get all books with optional filters (publisher and subject)
app.get('/books', (req, res) => {
  const { publisher, subject } = req.query;
  let query = "SELECT * FROM books WHERE 1=1";
  const params = [];

  if (publisher) {
    query += " AND publisher LIKE ?";
    params.push(`%${publisher}%`);
  }

  if (subject) {
    query += " AND subject LIKE ?";
    params.push(`%${subject}%`);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching books:', err.message);
      return res.status(500).json({ message: 'Something went wrong.' });
    }

    res.status(200).json(rows);
  });
});

// Endpoint to add a new book
app.post('/books', (req, res) => {
  const { name, author, subject, publisher, publishedYear, availableCopies } = req.body;

  if (!name || !author || !subject || !publisher || !publishedYear || !availableCopies) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  const stmt = db.prepare(`
    INSERT INTO books (name, author, subject, publisher, publishedYear, availableCopies)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(name, author, subject, publisher, publishedYear, availableCopies, function(err) {
    if (err) {
      console.error('Error adding new book:', err.message);
      return res.status(500).json({ message: 'Failed to add book.' });
    }

    res.status(201).json({ message: 'Book added successfully!' });
  });

  stmt.finalize();
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});



// Route to filter books based on query parameters
app.get('/books', (req, res) => {
  const { publisher, name, subject } = req.query;

  // Filter the books based on query parameters
  const filteredBooks = books.filter(book => {
    return (
      (publisher ? book.publisher.toLowerCase().includes(publisher.toLowerCase()) : true) &&
      (name ? book.name.toLowerCase().includes(name.toLowerCase()) : true) &&
      (subject ? book.subject.toLowerCase().includes(subject.toLowerCase()) : true)
    );
  });

  res.json(filteredBooks);
});

// Endpoint to borrow a book
app.post('/borrow-book', (req, res) => {
  const { bookId } = req.body;

  const book = books.find(b => b.id === bookId);
  
  if (!book) {
    return res.status(404).json({ message: 'Book not found' });
  }

  if (book.availableCopies <= 0) {
    return res.status(400).json({ message: 'No copies available to borrow' });
  }

  // Reduce the available copies by 1
  book.availableCopies--;

  return res.status(200).json({
    message: 'Book borrowed successfully',
    newAvailableCopies: book.availableCopies
  });
});


// Server listen
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
