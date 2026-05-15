export default async function handler(req, res) {
	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		const { name, email, message, website } = req.body || {};

		// Honeypot field. Real users never fill this.
		if (website) {
			return res.status(200).json({ ok: true });
		}

		if (!name || !email || !message) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return res.status(400).json({ error: 'Invalid email address' });
		}

		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: process.env.CONTACT_FROM_EMAIL,
				to: process.env.CONTACT_TO_EMAIL,
				reply_to: email,
				subject: `Portfolio message from ${name}`,
				text: `Name: ${name}\nEmail: ${email}\n\n${message}`
			})
		});

		if (!response.ok) {
			const details = await response.text();
			console.error(details);
			return res.status(500).json({ error: 'Failed to send message' });
		}

		return res.status(200).json({ ok: true });
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Server error' });
	}
}
