const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');

const app = express();
const port = 3000;

// ✅ CORS Configuration
const corsOptions = {
  origin: 'http://127.0.0.1:5500', // or whatever your frontend is running on
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type'],
  credentials: true
};

// ✅ Apply Middleware in the correct order
app.use(helmet());
app.use(cors(corsOptions)); // must come before session
app.use(session({
  secret: 'your-secret-key',  // Your secret key for signing cookies
  resave: false,  // Don't resave session if not modified
  saveUninitialized: false,  // Don't save uninitialized session
  cookie: {
    secure: false,  // Set to false for development (HTTP)
    httpOnly: true,  // Restrict cookie access to HTTP requests only
    sameSite: 'Lax'  // A common choice for same-site cookies
  }
}));


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Now you can connect to DB and define routes...


// ✅ Connect to SQLite Database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// ✅ Create Users Table (if not exists)
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('STUDENT', 'ADMIN'))
  )
`, (err) => {
  if (err) {
    console.error('Failed to create table:', err.message);
  } else {
    console.log('Users table is ready.');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS borrowed_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    returned INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (book_id) REFERENCES books(id)
  )`, (err) => {
    if (err) {
      console.error("❌ Failed to create borrowed_books table:", err.message);
    } else {
      console.log("✅ borrowed_books table created or already exists.");
    }
  });
});
app.get('/', (req, res) => {
  res.send('Server is running!');
});


// ✅ Simple Email Validator
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
app.get('/check-session', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});
app.get('/debug-session', (req, res) => {
  res.json({
    session: req.session,
    user: req.session?.user || null
  });
});

app.post('/register', (req, res) => {
  const { email, username, password, role } = req.body;

  // Validate the inputs
  if (!email || !username || !password || !role) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Check if the username or email already exists in the database
  const query = "SELECT * FROM users WHERE username = ? OR email = ?";
  db.get(query, [username, email], (err, row) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ message: "Something went wrong." });
    }

    if (row) {
      return res.status(400).json({ message: "Username or email already exists." });
    }

    // Hash the password before saving to the database
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error("Password hashing error:", err.message);
        return res.status(500).json({ message: "Something went wrong." });
      }

      // Insert the new user into the database
      const insertQuery = "INSERT INTO users (email, username, password, role) VALUES (?, ?, ?, ?)";
      db.run(insertQuery, [email, username, hashedPassword, role], function (err) {
        if (err) {
          console.error("Database insert error:", err.message);
          return res.status(500).json({ message: "Failed to register user." });
        }

        // Respond with success
        return res.status(201).json({ message: "User registered successfully." });
      });
    });
  });
});

app.post('/login', (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const query = "SELECT * FROM users WHERE username = ? AND role = ?";

  db.get(query, [username, role], (err, row) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ message: "Something went wrong." });
    }

    if (!row) {
      return res.status(404).json({ message: "User not found." });
    }

    bcrypt.compare(password, row.password, (err, result) => {
      if (err) {
        console.error("Password comparison error:", err.message);
        return res.status(500).json({ message: "Something went wrong." });
      }

      if (result) {
        // Store user information in session
        req.session.user = {
          id: row.id,
          username: row.username,
          role: row.role
        };

        // Send user data back to frontend
        return res.status(200).json({
          message: "Login successful",
          username: row.username,
          role: row.role,
          id: row.id
        });
        req.session.user = { id: row.id, username: row.username, role: row.role };

      } 
      else {
        return res.status(401).json({ message: "Incorrect password." });
      }
    });
  });
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
app.get('/books', (req, res) => {
  const { publisher, subject, sortBy, order, name } = req.query;

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

  if (name) {
    query += " AND name LIKE ?";
    params.push(`%${name}%`);
  }

  if (sortBy) {
    const validSortFields = ['name', 'author', 'publisher', 'subject'];
    if (validSortFields.includes(sortBy)) {
      query += ` ORDER BY ${sortBy} ${order === 'desc' ? 'DESC' : 'ASC'}`;
    }
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching books:', err.message);
      return res.status(500).json({ message: 'Something went wrong.' });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No books found matching your filters.' });
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
app.delete('/books/:id', (req, res) => {
  const id = req.params.id;  // Get the book ID from the URL
  db.run('DELETE FROM books WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });  // Return error if any
    }
    res.json({ message: `Book with ID ${id} deleted successfully.` });  // Return success message
  });
});
app.post('/borrow', (req, res) => {
  const userId = parseInt(req.body.userId);
  const bookId = parseInt(req.body.bookId);
  const borrowDate = req.body.borrowDate;

  if (!userId || !bookId || !borrowDate) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  const issueDate = borrowDate;
  const dueDate = new Date(new Date(issueDate).getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Check available copies of the book
  const checkQuery = `SELECT availableCopies FROM books WHERE id = ?`;
  db.get(checkQuery, [bookId], (err, row) => {
    if (err) return res.status(500).json({ message: 'Database error.' });

    if (!row || row.availableCopies <= 0) {
      return res.status(400).json({ message: 'No available copies left for this book.' });
    }

    // Insert the borrowing record into the borrowed_books table
    const borrowQuery = `
      INSERT INTO borrowed_books (user_id, book_id, issue_date, due_date, returned)
      VALUES (?, ?, ?, ?, 0)
    `;
    db.run(borrowQuery, [userId, bookId, issueDate, dueDate], function (err) {
      if (err) return res.status(500).json({ message: 'Failed to borrow book.' });

      const borrowId = this.lastID;

      // Update available copies in the books table
      const updateQuery = `UPDATE books SET availableCopies = availableCopies - 1 WHERE id = ? AND availableCopies > 0`;
      db.run(updateQuery, [bookId], function (err2) {
        if (err2) return res.status(500).json({ message: 'Borrowed but update failed.' });

        if (this.changes === 0) {
          return res.status(400).json({ message: 'Race condition — no copies left.' });
        }

        // Get the book details
        const bookQuery = `SELECT name AS bookName, author FROM books WHERE id = ?`;
        db.get(bookQuery, [bookId], (err3, book) => {
          if (err3) return res.status(500).json({ message: 'Error fetching book details.' });

          // Get the user details (borrowedBy)
          const userQuery = `SELECT username AS borrowedBy FROM users WHERE id = ?`;
          db.get(userQuery, [userId], (err4, user) => {
            if (err4) return res.status(500).json({ message: 'Error fetching user details.' });

            res.status(201).json({
              message: 'Book borrowed successfully.',
              borrowId: borrowId,
              borrowedBy: user.borrowedBy,
              bookName: book.bookName,
              author: book.author,
              issueDate: issueDate,
              dueDate: dueDate
            });
          });
        });
      });
    });
  });
});




app.get('/borrowed', (req, res) => {
  const query = `
    SELECT 
      borrowed_books.id AS borrowId,
      users.username AS borrowedBy,
      books.name AS bookName,
      books.author,
      borrowed_books.issue_date AS issueDate,
      borrowed_books.due_date AS dueDate,
      borrowed_books.returned
    FROM borrowed_books
    JOIN users ON borrowed_books.user_id = users.id
    JOIN books ON borrowed_books.book_id = books.id
    ORDER BY borrowed_books.issue_date DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching borrowed books:', err.message);
      return res.status(500).json({ message: 'Failed to fetch borrowed books.' });
    }

    // Convert 'returned' from 0/1 to true/false
    const formatted = rows.map(row => ({
      ...row,
      returned: row.returned === 1
    }));

    res.status(200).json(formatted);
  });
});

app.get('/api/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({ name: req.session.user.username });
});
app.get('/api/borrowed', (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const sql = `SELECT * FROM borrowed_books WHERE borrowedBy = ? AND returned = 0`;
  db.all(sql, [user.username], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(rows);
  });
});
app.get('/rules', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const sql = `
    SELECT b.name AS bookName, b.author, bb.issue_date AS issueDate, bb.due_date AS dueDate
    FROM borrowed_books bb
    JOIN books b ON bb.book_id = b.id
    WHERE bb.user_id = ? AND bb.returned = 0
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error('Database error in /rules:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(rows);
  });
});
app.get('/due', (req, res) => {
  const sql = `
    SELECT bb.id AS borrowId, bb.returned, bb.due_date AS dueDate, bb.issue_date AS issueDate,
           b.name AS bookName, b.author, u.username AS borrowedBy, u.email, b.id AS bookId
    FROM borrowed_books bb
    JOIN books b ON bb.book_id = b.id
    JOIN users u ON bb.user_id = u.id
    WHERE bb.returned = 0 OR bb.returned = 1
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

app.post('/return/:borrowId', (req, res) => {
  const borrowId = req.params.borrowId;

  const sqlUpdate = `
    UPDATE borrowed_books
    SET returned = 1
    WHERE id = ?
  `;

  const sqlGetBook = `
    SELECT book_id, returned FROM borrowed_books WHERE id = ?
  `;

  const sqlIncreaseStock = `
    UPDATE books SET availableCopies = availableCopies + 1 WHERE id = ?
  `;

  // Start transaction
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(sqlUpdate, [borrowId], function (err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ error: 'Failed to mark as returned' });
      }

      db.get(sqlGetBook, [borrowId], (err, row) => {
        if (err || !row) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: 'Borrow record not found' });
        }

        // Check if the book has already been returned
        if (row.returned === 1) {
          db.run("ROLLBACK");
          return res.status(400).json({ error: 'Book already marked as returned' });
        }

        // Increase stock of the book
        db.run(sqlIncreaseStock, [row.book_id], function (err2) {
          if (err2) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: 'Failed to update stock' });
          }

          // Commit transaction
          db.run("COMMIT");

          // Respond with success
          res.json({ success: true, message: 'Book marked as returned successfully' });
        });
      });
    });
  });
});
