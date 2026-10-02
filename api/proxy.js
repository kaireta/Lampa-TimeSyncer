export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { return res.status(200).end(); }

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing ?url= param' });

    try {
        const response = await fetch(decodeURIComponent(url), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://vk.com/video',
                'Origin': 'https://vk.com',
                'Connection': 'keep-alive',
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