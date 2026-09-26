export default async function handler(req, res) {
    // CORS preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { return res.status(200).end(); }

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing ?url= param' });

    try {
        const response = await fetch(decodeURIComponent(url), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
                'Accept-Language': 'ru-RU,ru;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirect: 'follow',
        });
        const text = await response.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(text);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
