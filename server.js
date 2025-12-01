const express = require('express');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data file path
const DATA_FILE = path.join(__dirname, 'bookings.json');

// All available time slots (1 hour apart, 8 AM to 11 PM)
const ALL_TIME_SLOTS = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

// Initialize or load bookings
function loadBookings() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
    return {};
}

// Save bookings to file
function saveBookings(bookings) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));
    } catch (error) {
        console.error('Error saving bookings:', error);
    }
}

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// API: Get available time slots for a specific date
app.get('/api/available-slots', (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date is required' });
    }

    const bookings = loadBookings();
    const bookedSlots = bookings[date] ? bookings[date].map(b => b.time) : [];
    const availableSlots = ALL_TIME_SLOTS.filter(slot => !bookedSlots.includes(slot));

    res.json({ date, availableSlots });
});

// API: Book an appointment
app.post('/api/book', (req, res) => {
    const { customerName, phone, date, time } = req.body;

    // Validate input
    if (!customerName || !phone || !date || !time) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const bookings = loadBookings();

    // Initialize date array if not exists
    if (!bookings[date]) {
        bookings[date] = [];
    }

    // Check if slot is already booked
    const isBooked = bookings[date].some(b => b.time === time);
    if (isBooked) {
        return res.json({ success: false, message: 'This time slot is no longer available' });
    }

    // Create booking
    const booking = {
        id: Date.now(),
        customerName,
        phone,
        date,
        time,
        createdAt: new Date().toISOString()
    };

    bookings[date].push(booking);
    saveBookings(bookings);

    // Notify owner (log to console and save to notifications)
    notifyOwner(booking);

    res.json({ success: true, message: 'Booking confirmed!', booking });
});

// Notify owner about new booking
function notifyOwner(booking) {
    const message = `
╔══════════════════════════════════════════╗
║         NEW APPOINTMENT BOOKED!          ║
╠══════════════════════════════════════════╣
║  Customer: ${booking.customerName.padEnd(28)}║
║  Phone: ${booking.phone.padEnd(31)}║
║  Date: ${formatDate(booking.date).padEnd(32)}║
║  Time: ${formatTime(booking.time).padEnd(32)}║
╚══════════════════════════════════════════╝
`;
    console.log(message);

    // Also save to notifications file for owner dashboard
    const notificationsFile = path.join(__dirname, 'notifications.json');
    let notifications = [];
    try {
        if (fs.existsSync(notificationsFile)) {
            notifications = JSON.parse(fs.readFileSync(notificationsFile, 'utf8'));
        }
    } catch (e) {}

    notifications.unshift({
        ...booking,
        read: false
    });

    fs.writeFileSync(notificationsFile, JSON.stringify(notifications, null, 2));
}

// Format date for display
function formatDate(dateStr) {
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString('en-US', options);
}

// Format time for display
function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// API: Get all bookings for owner
app.get('/api/bookings', (req, res) => {
    const bookings = loadBookings();
    res.json(bookings);
});

// API: Get today's bookings
app.get('/api/bookings/today', (req, res) => {
    const bookings = loadBookings();
    const today = getTodayDate();
    const todayBookings = bookings[today] || [];
    res.json(todayBookings);
});

// API: Get notifications for owner
app.get('/api/notifications', (req, res) => {
    const notificationsFile = path.join(__dirname, 'notifications.json');
    try {
        if (fs.existsSync(notificationsFile)) {
            const notifications = JSON.parse(fs.readFileSync(notificationsFile, 'utf8'));
            res.json(notifications);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.json([]);
    }
});

// API: Delete an appointment (for owner)
app.delete('/api/bookings/:date/:id', (req, res) => {
    const { date, id } = req.params;
    const bookings = loadBookings();

    if (!bookings[date]) {
        return res.status(404).json({ success: false, message: 'Date not found' });
    }

    const bookingIndex = bookings[date].findIndex(b => b.id === parseInt(id));
    if (bookingIndex === -1) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Remove the booking
    const removedBooking = bookings[date].splice(bookingIndex, 1)[0];

    // If no more bookings for that date, remove the date entry
    if (bookings[date].length === 0) {
        delete bookings[date];
    }

    saveBookings(bookings);

    console.log(`
╔══════════════════════════════════════════╗
║       APPOINTMENT REMOVED BY OWNER       ║
╠══════════════════════════════════════════╣
║  Customer: ${removedBooking.customerName.padEnd(28)}║
║  Date: ${formatDate(removedBooking.date).padEnd(32)}║
║  Time: ${formatTime(removedBooking.time).padEnd(32)}║
╚══════════════════════════════════════════╝
    `);

    res.json({ success: true, message: 'Booking removed successfully' });
});

// Schedule daily reset at midnight (12:00 AM)
cron.schedule('0 0 * * *', () => {
    console.log('🕛 Midnight - Clearing old bookings...');

    const bookings = loadBookings();
    const today = getTodayDate();

    // Keep only today's and future bookings
    const updatedBookings = {};
    Object.keys(bookings).forEach(date => {
        if (date >= today) {
            updatedBookings[date] = bookings[date];
        }
    });

    saveBookings(updatedBookings);
    console.log('✅ Old bookings cleared. Ready for a new day!');
});

// Serve owner dashboard
app.get('/owner', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'owner.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║     Barber Shop Reservation System       ║
╠══════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}  ║
║                                          ║
║  Customer booking: http://localhost:${PORT}  ║
║  Owner dashboard:  http://localhost:${PORT}/owner ║
╚══════════════════════════════════════════╝
    `);
});
