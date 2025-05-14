const express = require('express');
const session = require('express-session');

const app = express();

// Session middleware configuration
app.use(session({
  secret: 'your_secret_key',  // Can be any string, used to sign the session ID cookie
  resave: false,              // Don't save a session if it's not modified
  saveUninitialized: true,    // Save sessions even if they are empty
  cookie: { secure: false }   // Use secure: true for HTTPS
}));

// Body parser middleware for handling POST requests (if needed)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Login route (for testing)
app.post('/login', (req, res) => {
  req.session.id = 4;
  req.session.username = 'jyo';
  req.session.role = 'STUDENT';
  res.send('Logged in');
});

// Check session route (for testing)
app.get('/check-session', (req, res) => {
  console.log(req.session);  // Print the session details to the console for debugging
  if (req.session.username) {
    res.send(`Session Data: ${req.session.username}, Role: ${req.session.role}`);
  } else {
    res.send('No session found');
  }
});

// Test route to show session data
app.get('/dashboard', (req, res) => {
  console.log(req.session); // Debug session
  if (req.session.username) {
    res.send(`Welcome, ${req.session.username}. Your role: ${req.session.role}`);
  } else {
    res.send('You are not logged in.');
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
