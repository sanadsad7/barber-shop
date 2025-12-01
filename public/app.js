document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('bookingForm');
    const dateInput = document.getElementById('date');
    const timeSlotsContainer = document.getElementById('timeSlots');
    const selectedTimeInput = document.getElementById('selectedTime');
    const confirmation = document.getElementById('confirmation');
    const confirmationDetails = document.getElementById('confirmationDetails');

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    dateInput.value = today;

    // All available time slots (1 hour apart, 8 AM to 11 PM)
    const allTimeSlots = [
        '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
        '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
    ];

    // Load available time slots when date changes
    dateInput.addEventListener('change', loadTimeSlots);

    // Load time slots on page load
    loadTimeSlots();

    async function loadTimeSlots() {
        const selectedDate = dateInput.value;
        if (!selectedDate) return;

        timeSlotsContainer.innerHTML = '<div class="loading">Loading available times...</div>';
        selectedTimeInput.value = '';

        try {
            const response = await fetch(`/api/available-slots?date=${selectedDate}`);
            const data = await response.json();

            if (data.availableSlots.length === 0) {
                timeSlotsContainer.innerHTML = '<div class="no-slots">No available time slots for this date</div>';
                return;
            }

            timeSlotsContainer.innerHTML = '';

            allTimeSlots.forEach(time => {
                const slot = document.createElement('div');
                slot.className = 'time-slot';
                slot.textContent = formatTime(time);
                slot.dataset.time = time;

                if (!data.availableSlots.includes(time)) {
                    slot.classList.add('booked');
                } else {
                    slot.addEventListener('click', () => selectTimeSlot(slot, time));
                }

                timeSlotsContainer.appendChild(slot);
            });

            // Check if all visible slots are booked
            const visibleSlots = timeSlotsContainer.querySelectorAll('.time-slot:not(.booked)');
            if (visibleSlots.length === 0) {
                timeSlotsContainer.innerHTML = '<div class="no-slots">No available time slots for this date</div>';
            }

        } catch (error) {
            console.error('Error loading time slots:', error);
            timeSlotsContainer.innerHTML = '<div class="no-slots">Error loading time slots. Please try again.</div>';
        }
    }

    function selectTimeSlot(slotElement, time) {
        // Remove selection from all slots
        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));

        // Select this slot
        slotElement.classList.add('selected');
        selectedTimeInput.value = time;
    }

    function formatTime(time) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    }

    // Handle form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!selectedTimeInput.value) {
            alert('Please select a time slot');
            return;
        }

        const formData = {
            customerName: document.getElementById('customerName').value,
            phone: document.getElementById('phone').value,
            date: dateInput.value,
            time: selectedTimeInput.value
        };

        try {
            const response = await fetch('/api/book', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                form.classList.add('hidden');
                confirmation.classList.remove('hidden');
                confirmationDetails.innerHTML = `
                    <strong>Name:</strong> ${formData.customerName}<br>
                    <strong>Date:</strong> ${formatDate(formData.date)}<br>
                    <strong>Time:</strong> ${formatTime(formData.time)}<br>
                    <br>
                    <em>We look forward to seeing you!</em>
                `;
            } else {
                alert(data.message || 'Booking failed. Please try again.');
                loadTimeSlots(); // Reload slots in case it was already booked
            }

        } catch (error) {
            console.error('Error booking appointment:', error);
            alert('An error occurred. Please try again.');
        }
    });

    function formatDate(dateStr) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateStr).toLocaleDateString('en-US', options);
    }
});
